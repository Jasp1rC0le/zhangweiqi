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
import java.time.*;
import java.util.*;

/** Explicit school-admin transitions. No account deletion or inferred historical affiliation. */
@Service
public class TeachingLifecycleService {
    private final JdbcTemplate db;private final TeachingService teaching;private final Clock clock;
    @Autowired public TeachingLifecycleService(JdbcTemplate db,TeachingService teaching){this(db,teaching,Clock.systemUTC());}
    public TeachingLifecycleService(JdbcTemplate db,TeachingService teaching,Clock clock){this.db=db;this.teaching=teaching;this.clock=clock;}
    public record Student(String id,String studentNumber,String name,String classId,String className,String college,String status,int revision){}
    public record Transition(String requestId,int revision,String expectedClassId,String action,String targetClassId,String reason){}
    public record Receipt(String requestId,String studentId,String classId,String status,int revision,int affectedLessons){}
    public record ModeReview(String mode,Integer revision,String reason){}
    public record ModeRequest(String requestId,String mode,Integer revision,String reason){}
    public record ModeReceipt(String requestId,String courseId,String mode,int revision,long actorId,String reason,Instant reviewedAt){}
    public record ModeState(String courseId,int revision,String mode,TeachingService.CourseTarget target,String groupName,String adminClassId,String adminClassName,String college,
            int activeMembers,int outsideAdminClass,int invalidActiveMembers,int futureLessons,String reviewRequestId,Integer reviewRevision,Long reviewedBy,String reviewReason,Instant reviewedAt){}
    private static ResponseStatusException error(int status,String message){return new ResponseStatusException(HttpStatus.valueOf(status),message);}
    private long admin(long actor){
        teaching.capabilities(actor); // existing normal account + ADMIN + school checks, before feature lookup
        if(!teaching.lifecycleEnabled())throw error(503,"学籍联动尚未启用，未修改任何记录");
        return db.queryForObject("SELECT school_id FROM users WHERE id=?",Long.class,actor);
    }
    private void uuid(String id){try{if(id==null || !UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw error(400,"记录编号无效");}}
    private String reason(String value){if(value==null || value.isBlank() || value.length()>300)throw error(400,"必须填写1至300字变更原因");return value.trim();}
    public Student status(long actor,String id){long school=admin(actor);uuid(id);return read(school,id);}
    private Student read(long school,String id){
        var rows=db.query("SELECT s.id,s.student_number,s.name,s.class_id,b.name AS class_name,b.college,COALESCE(x.status,'ACTIVE') AS state,COALESCE(x.revision,0) AS version FROM teaching_students s JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=s.school_id LEFT JOIN teaching_student_lifecycle x ON x.student_id=s.id AND x.school_id=s.school_id WHERE s.id=? AND s.school_id=?",(r,n)->new Student(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6),r.getString(7),r.getInt(8)),id,school);
        if(rows.isEmpty())throw error(404,"学生不在本校授权范围");return rows.get(0);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public ModeState modeStatus(long actor,String course){
        long school=admin(actor);uuid(course);return readMode(school,course);
    }
    private ModeState readMode(long school,String course){
        var rows=db.queryForList("SELECT c.*,b.name AS admin_name,b.college,r.group_name,r.revision,m.mode,m.reviewed_by,m.review_reason,m.reviewed_at,h.request_id,h.revision AS review_revision,COALESCE(NULLIF(t.nickname,''),t.username,'教师账号未绑定') AS teacher_name FROM teaching_courses c JOIN teaching_classes b ON b.id=c.class_id AND b.school_id=c.school_id JOIN teaching_course_rosters r ON r.course_id=c.id AND r.school_id=c.school_id LEFT JOIN teaching_course_enrollment_modes m ON m.course_id=c.id AND m.school_id=c.school_id LEFT JOIN teaching_course_mode_reviews h ON h.course_id=c.id AND h.school_id=c.school_id LEFT JOIN users t ON t.id=c.teacher_id AND t.school_id=c.school_id WHERE c.id=? AND c.school_id=?",course,school);
        if(rows.isEmpty())throw error(404,"课程不在本校授权范围");var row=rows.get(0);String mode=(String)row.get("mode");
        if(mode==null || !Set.of("LEGACY","ADMIN_CLASS","EXPLICIT").contains(mode))throw error(503,"课程来源基线缺失或无效，未猜测类型");
        String anchor=(String)row.get("class_id");
        var stats=db.queryForMap("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN s.class_id<>? THEN 1 ELSE 0 END),0) AS outside_count,COALESCE(SUM(CASE WHEN s.id IS NULL OR b.id IS NULL OR COALESCE(x.status,'ACTIVE')<>'ACTIVE' THEN 1 ELSE 0 END),0) AS invalid_count FROM teaching_course_members cm LEFT JOIN teaching_students s ON s.id=cm.student_id AND s.school_id=cm.school_id LEFT JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=s.school_id LEFT JOIN teaching_student_lifecycle x ON x.student_id=s.id AND x.school_id=s.school_id WHERE cm.school_id=? AND cm.course_id=? AND cm.active=TRUE",anchor,school,course);
        int total=((Number)stats.get("total")).intValue(),outside=((Number)stats.get("outside_count")).intValue(),invalid=((Number)stats.get("invalid_count")).intValue();
        if(total>TeachingService.MAX_COURSE_MEMBERS)throw error(503,"有效课程名单超过已验证边界，未截断核对");
        int future=db.queryForObject("SELECT COUNT(*) FROM teaching_lessons WHERE school_id=? AND course_id=? AND starts_at>? AND cancelled=FALSE",Integer.class,school,course,Timestamp.from(clock.instant()));
        var target=new TeachingService.CourseTarget((String)row.get("name"),(String)row.get("semester"),(String)row.get("teacher_name"),((Number)row.get("weekday")).intValue(),(String)row.get("start_time"),(String)row.get("end_time"),(String)row.get("room"));
        return new ModeState(course,((Number)row.get("revision")).intValue(),mode,target,(String)row.get("group_name"),anchor,(String)row.get("admin_name"),(String)row.get("college"),total,outside,invalid,future,(String)row.get("request_id"),row.get("review_revision")==null?null:((Number)row.get("review_revision")).intValue(),row.get("reviewed_by")==null?null:((Number)row.get("reviewed_by")).longValue(),(String)row.get("review_reason"),row.get("reviewed_at")==null?null:((Timestamp)row.get("reviewed_at")).toInstant());
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,timeout=20)
    public void reviewMode(long actor,String course,ModeReview in){
        if(in==null){admin(actor);throw error(400,"课程来源核对资料缺失");}
        applyMode(actor,course,new ModeRequest(UUID.randomUUID().toString(),in.mode(),in.revision(),in.reason()));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,timeout=20)
    public ModeReceipt reviewModeReceipt(long actor,String course,ModeRequest in){return applyMode(actor,course,in);}
    private ModeReceipt modeReplay(long school,String request,String hash){
        var rows=db.queryForList("SELECT * FROM teaching_course_mode_reviews WHERE school_id=? AND request_id=?",school,request);
        if(rows.isEmpty())return null;var row=rows.get(0);if(!hash.equals(row.get("request_hash")))throw error(409,"此核定请求编号已用于不同内容，未覆盖");
        return new ModeReceipt(request,(String)row.get("course_id"),(String)row.get("mode"),((Number)row.get("revision")).intValue(),((Number)row.get("actor_id")).longValue(),(String)row.get("reason"),((Timestamp)row.get("recorded_at")).toInstant());
    }
    private ModeReceipt applyMode(long actor,String course,ModeRequest in){
        long school=admin(actor);uuid(course);
        if(in==null || in.revision()==null || in.revision()<0 || in.revision()==Integer.MAX_VALUE || !Set.of("ADMIN_CLASS","EXPLICIT").contains(in.mode()==null?"":in.mode()))throw error(400,"需明确版本及整班或逐人选课来源");
        uuid(in.requestId());String why=reason(in.reason()),hash;
        try{hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((actor+"|"+course+"|"+in.mode()+"|"+in.revision()+"|"+why).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        var replay=modeReplay(school,in.requestId(),hash);if(replay!=null)return replay;
        var rows=db.queryForList("SELECT revision FROM teaching_course_rosters WHERE school_id=? AND course_id=? FOR UPDATE",Integer.class,school,course);
        if(rows.isEmpty())throw error(404,"课程不在本校范围");replay=modeReplay(school,in.requestId(),hash);if(replay!=null)return replay;
        if(rows.get(0).intValue()!=in.revision().intValue())throw error(409,"课程版本已变化");
        var modes=db.queryForList("SELECT mode FROM teaching_course_enrollment_modes WHERE school_id=? AND course_id=?",String.class,school,course);
        if(modes.size()!=1)throw error(503,"课程来源基线缺失");if(!"LEGACY".equals(modes.get(0)))throw error(409,"已核定课程不在此入口重写来源类型");
        ModeState state=readMode(school,course);
        if(state.invalidActiveMembers()>0)throw error(409,"有效名单包含未核实学籍或跨校归属，请先核对名单，未核定来源");
        if("ADMIN_CLASS".equals(in.mode()) && state.outsideAdminClass()>0)throw error(409,"有效名单含其他行政班学生，不能直接核定为整班课；请核对逐人选课依据");
        admin(actor);Instant now=clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);int revision=in.revision()+1;
        db.update("INSERT INTO teaching_course_mode_reviews(school_id,request_id,course_id,actor_id,mode,reason,old_revision,revision,request_hash,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)",school,in.requestId(),course,actor,in.mode(),why,in.revision(),revision,hash,Timestamp.from(now));
        if(db.update("UPDATE teaching_course_enrollment_modes SET mode=?,reviewed_by=?,review_reason=?,reviewed_at=? WHERE course_id=? AND school_id=? AND mode='LEGACY'",in.mode(),actor,why,Timestamp.from(now),course,school)!=1)throw error(409,"课程来源已变化，未覆盖");
        if(db.update("UPDATE teaching_course_rosters SET revision=? WHERE course_id=? AND school_id=? AND revision=?",revision,course,school,in.revision())!=1)throw error(409,"课程名单版本已变化");
        return new ModeReceipt(in.requestId(),course,in.mode(),revision,actor,why,now);
    }
    private Receipt replay(long school,String id,String hash){
        var rows=db.queryForList("SELECT student_id,new_class_id,new_status,revision,affected_lessons,request_hash FROM teaching_student_transition_audit WHERE school_id=? AND request_id=?",school,id);
        if(rows.isEmpty())return null;var r=rows.get(0);if(!hash.equals(r.get("request_hash")))throw error(409,"此请求编号已有不同变更，未覆盖");
        return new Receipt(id,(String)r.get("student_id"),(String)r.get("new_class_id"),(String)r.get("new_status"),((Number)r.get("revision")).intValue(),((Number)r.get("affected_lessons")).intValue());
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,timeout=20)
    public Receipt transition(long actor,String id,Transition in){
        long school=admin(actor);uuid(id);if(in==null)throw error(400,"变更资料缺失");uuid(in.requestId());uuid(in.expectedClassId());
        if(!Set.of("TRANSFER","LEAVE","RESTORE").contains(in.action()==null?"":in.action()))throw error(400,"仅支持已核对的转班、离校或复学");
        boolean restoring="RESTORE".equals(in.action()),leaving="LEAVE".equals(in.action());
        String why=reason(in.reason()),target=leaving?in.expectedClassId():in.targetClassId();uuid(target);
        String hash;
        try{hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((actor+"|"+id+"|"+in.revision()+"|"+in.expectedClassId()+"|"+in.action()+"|"+target+"|"+why).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        var replay=replay(school,in.requestId(),hash);if(replay!=null)return replay;
        if(db.queryForList("SELECT id FROM teaching_students WHERE id=? AND school_id=? FOR UPDATE",String.class,id,school).isEmpty())throw error(404,"学生不在本校授权范围");
        replay=replay(school,in.requestId(),hash);if(replay!=null)return replay;
        Student before=read(school,id);
        if(before.revision()!=in.revision() || !before.classId().equals(in.expectedClassId()))throw error(409,"学籍状态已变化，请重新核对");
        if(restoring ? !"LEFT".equals(before.status()) : !"ACTIVE".equals(before.status()))
            throw error(409,restoring?"只有已离校状态可通过明确复学操作恢复":"已离校学生需通过独立复学操作核对，不能在转班入口恢复学籍");
        // Serialize capacity checks for different students entering the same administrative class.
        db.queryForList("SELECT id FROM teaching_classes WHERE school_id=? AND id IN (?,?) ORDER BY id FOR UPDATE",String.class,school,before.classId(),target);
        var colleges=db.queryForList("SELECT college FROM teaching_classes WHERE id=? AND school_id=?",String.class,target,school);
        if(colleges.isEmpty())throw error(404,"目标班级不在本校范围");if("TRANSFER".equals(in.action()) && target.equals(before.classId()))throw error(400,"目标班级与当前班级相同");
        if(!leaving && !target.equals(before.classId()) && db.queryForObject("SELECT COUNT(*) FROM teaching_students WHERE class_id=? AND school_id=?",Integer.class,target,school)>=300)throw error(409,"转入行政班已达到300人配置边界，需先分班核对，不截断名单");
        Timestamp now=Timestamp.from(clock.instant());
        // Lock order is student -> sorted course rosters -> sorted lessons, shared with creation/mark/withdrawal.
        var courses=db.queryForList("SELECT c.id,c.class_id FROM teaching_courses c WHERE c.school_id=? AND (EXISTS(SELECT 1 FROM teaching_course_members m WHERE m.course_id=c.id AND m.school_id=c.school_id AND m.student_id=? AND m.active=TRUE) OR (?=FALSE AND c.class_id=? AND NOT EXISTS(SELECT 1 FROM teaching_course_enrollment_modes mode WHERE mode.course_id=c.id AND mode.school_id=c.school_id AND mode.mode='EXPLICIT'))) AND EXISTS(SELECT 1 FROM teaching_lessons l WHERE l.course_id=c.id AND l.starts_at>?) ORDER BY c.id LIMIT 1001",school,id,leaving,target,now);
        if(courses.size()>1000)throw error(409,"涉及课程过多，需单独分期核对，未部分执行");
        var plans=new LinkedHashMap<String,Boolean>();
        for(var c:courses){
            String course=(String)c.get("id");
            if(db.queryForList("SELECT revision FROM teaching_course_rosters WHERE course_id=? AND school_id=? FOR UPDATE",Integer.class,course,school).isEmpty())throw error(503,"课程名单基线缺失");
            var modes=db.queryForList("SELECT mode FROM teaching_course_enrollment_modes WHERE course_id=? AND school_id=?",String.class,course,school);
            if(!leaving && (modes.size()!=1 || !Set.of("ADMIN_CLASS","EXPLICIT").contains(modes.get(0))))throw error(409,"涉及未核定选课来源的历史课程，请管理员先核定整班或选修类型");
            boolean active=db.queryForObject("SELECT COUNT(*) FROM teaching_course_members WHERE course_id=? AND student_id=? AND school_id=? AND active=TRUE",Integer.class,course,id,school)>0;
            // Readmission restores only explicitly selected administrative-class teaching.
            // Previous electives remain withdrawn until a separate, versioned re-enrollment.
            if(restoring && active && "EXPLICIT".equals(modes.get(0)))throw error(409,"离校状态仍有有效选修，请先核对来源，未自动恢复或撤销课程");
            boolean desired=!leaving && ("ADMIN_CLASS".equals(modes.get(0))?target.equals(c.get("class_id")):!restoring && active);
            if(desired && !active && db.queryForObject("SELECT COUNT(*) FROM teaching_course_members WHERE course_id=? AND school_id=? AND active=TRUE",Integer.class,course,school)>=TeachingService.MAX_COURSE_MEMBERS)throw error(409,"转入课程已达到2000人名单边界，未部分执行");
            if(active || desired)plans.put(course,desired);
        }
        record Row(String lesson,String course,String status,String oldClass,String oldCollege,Boolean withdrawn){}
        var rows=new ArrayList<Row>();
        for(var plan:plans.entrySet()) {
            String course=plan.getKey();
            var lessons=db.queryForList("SELECT id FROM teaching_lessons WHERE course_id=? AND school_id=? AND starts_at>? ORDER BY id FOR UPDATE",String.class,course,school,now);
            if(rows.size()+lessons.size()>10000)throw error(409,"涉及未来安排过多，需单独核对，未部分执行");
            for(String lesson:lessons){
                var existing=db.query("SELECT a.status,r.admin_class_id,r.college,r.withdrawn FROM teaching_attendance a LEFT JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id WHERE a.lesson_id=? AND a.student_id=?",(r,n)->new Row(lesson,course,r.getString(1),r.getString(2),r.getString(3),(Boolean)r.getObject(4)),lesson,id);
                if(!existing.isEmpty()){
                    Row r=existing.get(0);if(r.oldClass()==null)throw error(503,"考勤归属基线缺失");
                    if(!"UNKNOWN".equals(r.status()))throw error(409,"未来课程已有点名记录，需先由任课教师核对，未覆盖或隐藏考勤");rows.add(r);
                }else if(plan.getValue())rows.add(new Row(lesson,course,null,null,null,null));
            }
        }
        // All business validation is complete before the first write.
        int revision=before.revision()+1;String state=leaving?"LEFT":"ACTIVE",scopeSource=restoring?"LIFECYCLE_RESTORE":"LIFECYCLE_TRANSFER";
        for(var plan:plans.entrySet()) {
            String course=plan.getKey();int changed=db.update("UPDATE teaching_course_members SET active=? WHERE course_id=? AND student_id=? AND school_id=?",plan.getValue(),course,id,school);
            if(changed==0 && plan.getValue())db.update("INSERT INTO teaching_course_members(course_id,student_id,school_id,active) VALUES(?,?,?,TRUE)",course,id,school);
            db.update("UPDATE teaching_course_rosters SET revision=revision+1 WHERE course_id=? AND school_id=?",course,school);
            int rosterRevision=db.queryForObject("SELECT revision FROM teaching_course_rosters WHERE course_id=?",Integer.class,course);
            db.update("INSERT INTO teaching_enrollment_audit(id,school_id,course_id,student_id,actor_id,action,reason,revision,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),school,course,id,actor,in.action(),why,rosterRevision,now);
        }
        for(Row r:rows){
            boolean withdrawn=!plans.get(r.course());
            if(r.status()==null){
                db.update("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name) VALUES(?,?,?,?)",r.lesson(),id,before.studentNumber(),before.name());
                db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source,captured_at) VALUES(?,?,?,?,?,?,?,?)",r.lesson(),id,school,target,colleges.get(0),withdrawn,scopeSource,now);
            }else db.update("UPDATE teaching_attendance_scopes SET admin_class_id=?,college=?,withdrawn=?,source=?,captured_at=? WHERE lesson_id=? AND student_id=? AND school_id=?",withdrawn?r.oldClass():target,withdrawn?r.oldCollege():colleges.get(0),withdrawn,scopeSource,now,r.lesson(),id,school);
            db.update("INSERT INTO teaching_future_scope_audit(id,school_id,request_id,lesson_id,student_id,actor_id,old_class_id,new_class_id,old_college,new_college,old_withdrawn,new_withdrawn,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),school,in.requestId(),r.lesson(),id,actor,r.oldClass(),withdrawn?r.oldClass():target,r.oldCollege(),withdrawn?r.oldCollege():colleges.get(0),r.withdrawn(),withdrawn,now);
            db.update("UPDATE teaching_lessons SET revision=revision+1,finalized=FALSE WHERE id=? AND school_id=?",r.lesson(),school);
        }
        db.update("UPDATE teaching_students SET class_id=? WHERE id=? AND school_id=?",target,id,school);
        int changed=db.update("UPDATE teaching_student_lifecycle SET status=?,revision=?,changed_at=? WHERE student_id=? AND school_id=?",state,revision,now,id,school);
        if(changed==0)db.update("INSERT INTO teaching_student_lifecycle(student_id,school_id,status,revision,changed_at) VALUES(?,?,?,?,?)",id,school,state,revision,now);
        db.update("INSERT INTO teaching_student_transition_audit(school_id,request_id,student_id,actor_id,action,old_class_id,new_class_id,old_status,new_status,reason,revision,affected_lessons,request_hash,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",school,in.requestId(),id,actor,in.action(),before.classId(),target,before.status(),state,why,revision,rows.size(),hash,now);
        return new Receipt(in.requestId(),id,target,state,revision,rows.size());
    }
}
