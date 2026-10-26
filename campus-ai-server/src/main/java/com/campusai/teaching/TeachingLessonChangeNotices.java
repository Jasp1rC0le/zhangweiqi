package com.campusai.teaching;

import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Recipient-only station inbox. No administrator reason, roster or other people's data in DTOs. */
@Service
public class TeachingLessonChangeNotices {
    static final String STUDENT="LESSON_CHANGE_STUDENT",TEACHER="LESSON_CHANGE_TEACHER",BOTH="LESSON_CHANGE_BOTH",RELEASED="LESSON_CHANGE_RELEASED";
    private final JdbcTemplate db;private final TeachingService teaching;private final ObjectMapper json;private final boolean enabled;private final Clock clock;
    @Autowired public TeachingLessonChangeNotices(JdbcTemplate db,TeachingService teaching,ObjectMapper json,@Value("${app.teaching.lesson-change-enabled:false}") boolean enabled){this(db,teaching,json,enabled,Clock.systemUTC());}
    public TeachingLessonChangeNotices(JdbcTemplate db,TeachingService teaching,ObjectMapper json,boolean enabled,Clock clock){this.db=db;this.teaching=teaching;this.json=json;this.enabled=enabled;this.clock=clock;}
    public record Arrangement(LocalDate date,String startTime,String endTime,String teacher,String room){}
    public record Notice(String id,String requestId,String action,String course,Arrangement original,Arrangement proposed,String targetLessonId,String view,boolean outdated,Instant changedAt,Instant readAt){}
    public record Page(boolean enabled,List<Notice> items,int page,int size,int total,int totalPages,boolean unreadOnly,LocalDate from,LocalDate to){}
    private record Query(String sql,List<Object> args){}
    private static ResponseStatusException error(int code,String message){return new ResponseStatusException(HttpStatus.valueOf(code),message);}
    private void ready(){if(!enabled||!teaching.lifecycleEnabled()||!teaching.identityReviewEnabled())throw error(503,"课程变更通知尚未启用；未返回猜测内容");}

    // Called inside the existing change transaction, after its immutable receipt has been inserted.
    // Replays return before here. A failed batch rolls the course replacement and audit back too.
    static void record(JdbcTemplate db,long school,TeachingLessonChangeService.Receipt receipt){
        String lesson=receipt.replacementLessonId()==null?receipt.original().lessonId():receipt.replacementLessonId();
        var rows=db.queryForList("SELECT s.user_id FROM teaching_attendance_scopes r JOIN teaching_students s ON s.id=r.student_id AND s.school_id=r.school_id JOIN users u ON u.id=s.user_id AND u.school_id=s.school_id AND u.status=1 LEFT JOIN teaching_student_lifecycle x ON x.student_id=s.id AND x.school_id=s.school_id WHERE r.lesson_id=? AND r.school_id=? AND r.withdrawn=FALSE AND COALESCE(x.status,'ACTIVE')='ACTIVE' ORDER BY s.user_id LIMIT 2001",Long.class,lesson,school);
        if(rows.size()>TeachingService.MAX_COURSE_MEMBERS||new HashSet<>(rows).size()!=rows.size())throw error(503,"变更收件人不完整或重复，整项操作已回滚");
        var recipients=new TreeMap<Long,String>();for(long user:rows)recipients.put(user,STUDENT);
        Long teacher=receipt.proposed()==null?receipt.original().teacherId():receipt.proposed().teacherId();
        if(approvedTeacher(db,school,teacher))recipients.put(teacher,recipients.containsKey(teacher)?BOTH:TEACHER);
        Long previous=receipt.original().teacherId();
        if(!Objects.equals(previous,teacher)&&approvedTeacher(db,school,previous))recipients.putIfAbsent(previous,RELEASED);
        var entries=new ArrayList<>(recipients.entrySet());
        for(int first=0;first<entries.size();first+=100){
            var batch=entries.subList(first,Math.min(entries.size(),first+100));var args=new ArrayList<Object>();
            for(var entry:batch){String kind=entry.getValue();if(kind.length()>24)throw new IllegalStateException("notice kind exceeds existing schema");String id=UUID.nameUUIDFromBytes(("lesson-change-notice:"+receipt.requestId()+":"+entry.getKey()).getBytes(StandardCharsets.UTF_8)).toString();Collections.addAll(args,id,entry.getKey(),receipt.original().lessonId(),kind,Timestamp.from(receipt.recordedAt()));}
            int inserted=db.update("INSERT INTO teaching_notices(id,user_id,lesson_id,kind,due_at) VALUES "+String.join(",",Collections.nCopies(batch.size(),"(?,?,?,?,?)")),args.toArray());
            if(inserted!=batch.size())throw error(503,"变更通知未完整保存，整项操作已回滚");
        }
    }
    private static boolean approvedTeacher(JdbcTemplate db,long school,Long user){
        return user!=null&&db.queryForObject("SELECT COUNT(*) FROM users u WHERE u.id=? AND u.school_id=? AND u.status=1 AND EXISTS(SELECT 1 FROM teaching_identities i WHERE i.user_id=u.id AND i.school_id=u.school_id AND i.requested_role='TEACHER' AND i.status='APPROVED')",Integer.class,user,school)==1;
    }
    private Query query(long user,boolean unreadOnly,String exactId){
        var authority=teaching.noticeAuthority(user);
        String effective="COALESCE(h.new_lesson_id,h.old_lesson_id)",
            member="EXISTS(SELECT 1 FROM teaching_attendance_scopes rs JOIN teaching_students student ON student.id=rs.student_id AND student.school_id=rs.school_id JOIN teaching_classes captured ON captured.id=rs.admin_class_id AND captured.school_id=rs.school_id LEFT JOIN teaching_student_lifecycle life ON life.student_id=student.id WHERE rs.lesson_id="+effective+" AND rs.school_id=h.school_id AND rs.withdrawn=FALSE AND student.user_id=? AND (life.student_id IS NULL OR (life.school_id=rs.school_id AND life.status='ACTIVE')))",
            teacher="(CASE WHEN n.kind='"+RELEASED+"' THEN original_course.teacher_id ELSE COALESCE(replacement_course.teacher_id,original_course.teacher_id) END)=? AND ?=TRUE";
        var args=new ArrayList<Object>(List.of(user,authority.teacherAllowed(),user,authority.school(),Timestamp.from(LocalDate.now(clock.withZone(TeachingService.ZONE)).minusDays(30).atStartOfDay(TeachingService.ZONE).toInstant()),Timestamp.from(clock.instant()),user,authority.teacherAllowed(),user));
        String sql=" FROM teaching_notices n JOIN teaching_lesson_changes h ON h.old_lesson_id=n.lesson_id JOIN teaching_lessons original ON original.id=h.old_lesson_id AND original.school_id=h.school_id JOIN teaching_courses original_course ON original_course.id=original.course_id AND original_course.school_id=h.school_id LEFT JOIN teaching_lessons replacement ON replacement.id=h.new_lesson_id AND replacement.school_id=h.school_id LEFT JOIN teaching_courses replacement_course ON replacement_course.id=h.new_course_id AND replacement_course.school_id=h.school_id WHERE n.user_id=? AND h.school_id=? AND n.due_at>=? AND n.due_at<=? AND original.cancelled=TRUE AND original.class_id=original_course.class_id AND (h.new_lesson_id IS NULL AND h.new_course_id IS NULL OR replacement.id IS NOT NULL AND replacement_course.id IS NOT NULL AND replacement.course_id=h.new_course_id) AND ((n.kind IN ('"+TEACHER+"','"+BOTH+"','"+RELEASED+"') AND "+teacher+") OR (n.kind IN ('"+STUDENT+"','"+BOTH+"') AND "+member+")) AND (n.kind='"+RELEASED+"' OR NOT EXISTS(SELECT 1 FROM teaching_lesson_changes successor WHERE successor.school_id=h.school_id AND successor.old_lesson_id=h.new_lesson_id))";
        if(unreadOnly)sql+=" AND n.read_at IS NULL";
        if(exactId!=null){sql+=" AND n.id=?";args.add(exactId);}
        // The first two parameters belong to the SELECT projection, not the relation.
        return new Query(sql,args);
    }
    private List<Notice> selected(long user,Query query,int size,int offset){
        var args=new ArrayList<>(query.args());args.add(size);args.add(offset);
        return db.query("SELECT n.id,n.kind,n.read_at,h.request_id,h.old_lesson_id,h.new_lesson_id,h.new_course_id,h.actor_id,h.revision,h.receipt_json,h.recorded_at,original.course_id AS original_course_id,original.class_id AS original_class_id,replacement.cancelled AS target_cancelled,CASE WHEN (CASE WHEN n.kind='"+RELEASED+"' THEN original_course.teacher_id ELSE COALESCE(replacement_course.teacher_id,original_course.teacher_id) END)=? AND ?=TRUE THEN 'TEACHER' ELSE 'STUDENT' END AS authorized_view"+query.sql()+" ORDER BY n.due_at DESC,n.id LIMIT ? OFFSET ?",(r,n)->{
            try{
                var receipt=json.readValue(r.getString("receipt_json"),TeachingLessonChangeService.Receipt.class);var old=receipt.original();var next=receipt.proposed();boolean released=RELEASED.equals(r.getString("kind"));
                if(old==null||!Objects.equals(receipt.requestId(),r.getString("request_id"))||!Objects.equals(old.lessonId(),r.getString("old_lesson_id"))||!Objects.equals(old.courseId(),r.getString("original_course_id"))||!Objects.equals(old.classId(),r.getString("original_class_id"))||!Objects.equals(receipt.replacementLessonId(),r.getString("new_lesson_id"))||!Objects.equals(receipt.replacementCourseId(),r.getString("new_course_id"))||receipt.actorId()!=r.getLong("actor_id")||receipt.revision()!=r.getInt("revision")||!Objects.equals(receipt.recordedAt(),r.getTimestamp("recorded_at").toInstant())||!Set.of("CANCEL","RESCHEDULE").contains(receipt.action())||!plain(old.name(),100)||!valid(old.date(),old.startTime(),old.endTime(),old.teacherLabel(),old.room())||("RESCHEDULE".equals(receipt.action())&&(next==null||!valid(next.date(),next.startTime(),next.endTime(),next.teacherLabel(),next.room())))||("CANCEL".equals(receipt.action())&&(next!=null||receipt.replacementLessonId()!=null)))throw new IllegalStateException("invalid recipient receipt");
                boolean outdated=!released&&next!=null&&r.getBoolean("target_cancelled");String target=outdated?null:released||next==null?old.lessonId():receipt.replacementLessonId();
                return new Notice(r.getString("id"),receipt.requestId(),released?"RELEASED":receipt.action(),old.name(),new Arrangement(old.date(),old.startTime(),old.endTime(),old.teacherLabel(),old.room()),released||next==null?null:new Arrangement(next.date(),next.startTime(),next.endTime(),next.teacherLabel(),next.room()),target,r.getString("authorized_view"),outdated,receipt.recordedAt(),r.getTimestamp("read_at")==null?null:r.getTimestamp("read_at").toInstant());
            }catch(RuntimeException failure){throw error(503,"课程变更原回执不完整，本页未显示；请重新核对课表");}
        },args.toArray());
    }
    private static boolean plain(String value,int max){return value!=null&&!value.isBlank()&&value.length()<=max&&value.chars().noneMatch(Character::isISOControl);}
    private static boolean valid(LocalDate date,String start,String end,String teacher,String room){return date!=null&&start!=null&&end!=null&&start.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")&&end.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")&&start.compareTo(end)<0&&plain(teacher,150)&&plain(room,100);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Page page(long user,boolean unreadOnly,int page,int size){
        LocalDate to=LocalDate.now(clock.withZone(TeachingService.ZONE)),from=to.minusDays(30);
        if(page<0||page>10000||size!=25)throw error(400,"通知每页25条，请使用有效页码");
        if(!enabled)return new Page(false,List.of(),0,25,0,0,unreadOnly,from,to);
        ready();var q=query(user,unreadOnly,null);var countArgs=q.args().subList(2,q.args().size());int total=db.queryForObject("SELECT COUNT(*)"+q.sql(),Integer.class,countArgs.toArray()),pages=(total+24)/25;
        if(page>0&&page>=pages)throw error(409,"通知清单已变化，请从第一页重新读取");
        return new Page(true,selected(user,q,25,page*25),page,25,total,pages,unreadOnly,from,to);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,timeout=12)
    public Notice markRead(long user,String id){
        ready();teaching.noticeAuthority(user);if(id==null||!id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw error(400,"通知编号无效");
        if(db.queryForList("SELECT id FROM teaching_notices WHERE id=? AND user_id=? FOR UPDATE",String.class,id,user).isEmpty())throw error(404,"通知不在当前账号范围");
        var q=query(user,false,id);if(selected(user,q,1,0).isEmpty())throw error(404,"通知已撤回、过时或当前无权查看");
        db.update("UPDATE teaching_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",Timestamp.from(clock.instant()),id,user);
        var current=selected(user,query(user,false,id),1,0);if(current.isEmpty())throw error(404,"权限或课程已变化，未确认已读");return current.get(0);
    }
}
