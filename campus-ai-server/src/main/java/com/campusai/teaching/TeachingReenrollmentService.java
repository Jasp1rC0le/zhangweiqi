package com.campusai.teaching;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;

/** A former course member rejoins future teaching only after an explicit admin confirmation. */
@Service
public class TeachingReenrollmentService {
    private final JdbcTemplate db;
    private final TeachingService teaching;
    private final TeachingLifecycleService lifecycle;
    private final Clock clock;
    @Autowired public TeachingReenrollmentService(JdbcTemplate db,TeachingService teaching,TeachingLifecycleService lifecycle){this(db,teaching,lifecycle,Clock.systemUTC());}
    public TeachingReenrollmentService(JdbcTemplate db,TeachingService teaching,TeachingLifecycleService lifecycle,Clock clock){this.db=db;this.teaching=teaching;this.lifecycle=lifecycle;this.clock=clock;}
    public record Input(String requestId,Integer revision,Integer studentRevision,String expectedClassId,String reason){}
    public record Receipt(String requestId,String courseId,String studentId,String classId,int revision,int studentRevision,int affectedLessons){}
    private record Row(String lesson,String status,String oldClass,String oldCollege,Boolean withdrawn){}
    private static ResponseStatusException error(int status,String message){return new ResponseStatusException(HttpStatus.valueOf(status),message);}
    private void uuid(String value){try{if(value==null || !UUID.fromString(value).toString().equals(value))throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw error(400,"记录编号无效");}}
    private Receipt replay(long school,String request,String hash){
        var rows=db.queryForList("SELECT course_id,student_id,class_id,revision,student_revision,affected_lessons,request_hash FROM teaching_enrollment_requests WHERE school_id=? AND request_id=?",school,request);
        if(rows.isEmpty())return null;
        var row=rows.get(0);if(!hash.equals(row.get("request_hash")))throw error(409,"此请求编号已用于不同选课，未覆盖");
        return new Receipt(request,(String)row.get("course_id"),(String)row.get("student_id"),(String)row.get("class_id"),((Number)row.get("revision")).intValue(),((Number)row.get("student_revision")).intValue(),((Number)row.get("affected_lessons")).intValue());
    }
    @Transactional(timeout=20,isolation=Isolation.READ_COMMITTED)
    public Receipt reenroll(long actor,String course,String student,Input in){
        teaching.capabilities(actor);
        if(!teaching.lifecycleEnabled())throw error(503,"学籍及重新选课联动尚未启用，未修改记录");
        long school=db.queryForObject("SELECT school_id FROM users WHERE id=?",Long.class,actor);
        uuid(course);uuid(student);if(in==null)throw error(400,"重新选课资料缺失");uuid(in.requestId());uuid(in.expectedClassId());
        if(in.revision()==null || in.studentRevision()==null || in.revision()<0 || in.studentRevision()<0 || in.reason()==null || in.reason().isBlank() || in.reason().length()>300)throw error(400,"请提供有效版本和1至300字核验原因");
        String why=in.reason().trim(),hash;
        try{hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((actor+"|"+course+"|"+student+"|"+in.revision()+"|"+in.studentRevision()+"|"+in.expectedClassId()+"|"+why).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        var receipt=replay(school,in.requestId(),hash);if(receipt!=null)return receipt;
        // Same order as lifecycle changes: student, course roster, then sorted lessons.
        if(db.queryForList("SELECT id FROM teaching_students WHERE id=? AND school_id=? FOR UPDATE",String.class,student,school).isEmpty())throw error(404,"学生不在本校授权范围");
        receipt=replay(school,in.requestId(),hash);if(receipt!=null)return receipt;
        var person=lifecycle.status(actor,student);
        if(!"ACTIVE".equals(person.status()))throw error(409,"学生已离校，须先明确核对复学，不自动恢复学籍");
        if(person.revision()!=in.studentRevision() || !person.classId().equals(in.expectedClassId()))throw error(409,"学生当前学籍已变化，请重新核对");
        var versions=db.queryForList("SELECT revision FROM teaching_course_rosters WHERE course_id=? AND school_id=? FOR UPDATE",Integer.class,course,school);
        if(versions.isEmpty())throw error(404,"课程不在本校范围");
        if(versions.get(0).intValue()!=in.revision().intValue())throw error(409,"课程名单已变化，请重新核对");
        var members=db.queryForList("SELECT active FROM teaching_course_members WHERE course_id=? AND student_id=? AND school_id=?",Boolean.class,course,student,school);
        if(members.isEmpty())throw error(404,"仅支持已存在的原课程成员，不按姓名自动加入");
        if(members.get(0))throw error(409,"该同学已在有效名单中，请重新读取，不重复选课");
        var modes=db.queryForList("SELECT mode FROM teaching_course_enrollment_modes WHERE course_id=? AND school_id=?",String.class,course,school);
        if(modes.size()!=1 || !Set.of("ADMIN_CLASS","EXPLICIT").contains(modes.get(0)))throw error(409,"课程来源尚未核定，请先核对整班或选修类型");
        String administrative=db.queryForObject("SELECT class_id FROM teaching_courses WHERE id=? AND school_id=?",String.class,course,school);
        if("ADMIN_CLASS".equals(modes.get(0)) && !person.classId().equals(administrative))throw error(409,"整班课程与当前行政班不符，不能借重新选课扩大范围");
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_course_members WHERE course_id=? AND school_id=? AND active=TRUE",Integer.class,course,school)>=TeachingService.MAX_COURSE_MEMBERS)throw error(409,"课程有效名单已达2000人，未部分执行");
        Timestamp now=Timestamp.from(clock.instant());
        var ids=db.queryForList("SELECT id FROM teaching_lessons WHERE course_id=? AND school_id=? AND starts_at>? AND cancelled=FALSE ORDER BY id LIMIT 31 FOR UPDATE",String.class,course,school,now);
        if(ids.isEmpty())throw error(409,"该课程没有尚未开始且未取消的安排，不补造过去考勤");
        if(ids.size()>30)throw error(409,"涉及未来安排过多，需分期核对，未部分执行");
        var rows=new ArrayList<Row>();
        for(String lesson:ids){
            var found=db.query("SELECT a.status,r.admin_class_id,r.college,r.withdrawn FROM teaching_attendance a LEFT JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id AND r.school_id=? WHERE a.lesson_id=? AND a.student_id=?",(r,n)->new Row(lesson,r.getString(1),r.getString(2),r.getString(3),r.getObject(4,Boolean.class)),school,lesson,student);
            if(found.isEmpty())rows.add(new Row(lesson,null,null,null,null));
            else{
                Row row=found.get(0);
                if(row.oldClass()==null || row.oldCollege()==null || row.withdrawn()==null)throw error(503,"原考勤归属基线缺失，未恢复部分名单");
                if(!"UNKNOWN".equals(row.status()))throw error(409,"未来已有该同学的点名记录，请先核对，不覆盖原记录");
                rows.add(row);
            }
        }
        teaching.capabilities(actor); // Recheck the live account immediately before the first write.
        int revision=in.revision()+1;
        for(Row row:rows){
            if(row.status()==null){
                db.update("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name) VALUES(?,?,?,?)",row.lesson(),student,person.studentNumber(),person.name());
                db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source,captured_at) VALUES(?,?,?,?,?,FALSE,'REENROLLMENT',?)",row.lesson(),student,school,person.classId(),person.college(),now);
            }else db.update("UPDATE teaching_attendance_scopes SET admin_class_id=?,college=?,withdrawn=FALSE,source='REENROLLMENT',captured_at=? WHERE lesson_id=? AND student_id=? AND school_id=?",person.classId(),person.college(),now,row.lesson(),student,school);
            db.update("INSERT INTO teaching_future_scope_audit(id,school_id,request_id,lesson_id,student_id,actor_id,old_class_id,new_class_id,old_college,new_college,old_withdrawn,new_withdrawn,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,FALSE,?)",UUID.randomUUID().toString(),school,in.requestId(),row.lesson(),student,actor,row.oldClass(),person.classId(),row.oldCollege(),person.college(),row.withdrawn(),now);
            db.update("UPDATE teaching_lessons SET revision=revision+1,finalized=FALSE WHERE id=? AND school_id=?",row.lesson(),school);
        }
        if(db.update("UPDATE teaching_course_members SET active=TRUE WHERE course_id=? AND student_id=? AND school_id=? AND active=FALSE",course,student,school)!=1)throw error(409,"选课状态已变化");
        if(db.update("UPDATE teaching_course_rosters SET revision=? WHERE course_id=? AND school_id=? AND revision=?",revision,course,school,in.revision())!=1)throw error(409,"课程名单已变化");
        db.update("INSERT INTO teaching_enrollment_audit(id,school_id,course_id,student_id,actor_id,action,reason,revision,recorded_at) VALUES(?,?,?,?,?,'REENROLL',?,?,?)",UUID.randomUUID().toString(),school,course,student,actor,why,revision,now);
        db.update("INSERT INTO teaching_enrollment_requests(school_id,request_id,course_id,student_id,class_id,actor_id,request_hash,revision,student_revision,affected_lessons,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",school,in.requestId(),course,student,person.classId(),actor,hash,revision,person.revision(),rows.size(),now);
        return new Receipt(in.requestId(),course,student,person.classId(),revision,person.revision(),rows.size());
    }
}
