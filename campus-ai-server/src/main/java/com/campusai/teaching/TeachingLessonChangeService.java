package com.campusai.teaching;

import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.*;
import java.util.*;

/** One future lesson is replaced, never its course's historical teacher/room or past attendance. */
@Service
public class TeachingLessonChangeService {
    private final JdbcTemplate db;
    private final TeachingService teaching;
    private final ObjectMapper json;
    private final boolean enabled;
    private final Clock clock;
    @Autowired public TeachingLessonChangeService(JdbcTemplate db,TeachingService teaching,ObjectMapper json,
            @Value("${app.teaching.lesson-change-enabled:false}") boolean enabled){this(db,teaching,json,enabled,Clock.systemUTC());}
    public TeachingLessonChangeService(JdbcTemplate db,TeachingService teaching,ObjectMapper json,boolean enabled,Clock clock){this.db=db;this.teaching=teaching;this.json=json;this.enabled=enabled;this.clock=clock;}
    public record Access(boolean enabled,int maxMembers,String changeScope){}
    public record Target(String lessonId,String courseId,int revision,int rosterRevision,String name,String semester,
            LocalDate firstMonday,String classId,String classLabel,String groupName,Long teacherId,String teacherLabel,
            LocalDate date,String startTime,String endTime,String room,int members,String enrollmentMode,String sourceHash){}
    public record Input(String requestId,String lessonId,int revision,String sourceHash,String action,LocalDate date,
            String startTime,String endTime,Long teacherId,String room,String reason,String previewHash){}
    public record Proposed(LocalDate date,String startTime,String endTime,long teacherId,String teacherLabel,String room){}
    public record Conflict(String kind,int arrangements){}
    public record Option(String lessonId,String course,String semester,String className,String teacher,String room,Instant startsAt,Instant endsAt,int revision,String blockedReason){}
    public record Options(List<Option> items,int page,int size,int total,int totalPages,LocalDate from,LocalDate to,String search){}
    public record Preview(Target original,Proposed proposed,String action,String reason,String fingerprint,List<Conflict> conflicts,List<String> warnings){}
    public record Receipt(String requestId,long actorId,String action,Target original,String replacementCourseId,
            String replacementLessonId,Proposed proposed,int revision,String reason,Instant recordedAt){}
    private record Person(String id,String number,String name,String status,String adminClass,String college,boolean withdrawn,Instant capturedAt,String lifeStatus){}
    private record Source(Target target,List<Person> people,boolean cancelled,boolean finalized,Instant startsAt,String courseFingerprint){}
    private static ResponseStatusException error(int code,String message){return new ResponseStatusException(HttpStatus.valueOf(code),message);}
    private static void uuid(String id){if(id==null||!id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw error(400,"记录或请求编号无效");}
    private static void text(String value,int max){if(value==null||value.isBlank()||value.length()>max||value.chars().anyMatch(Character::isISOControl))throw error(400,"填写明确内容和1至300字原因，不能含控制字符");}
    private long authorize(long actor){teaching.capabilities(actor);return db.queryForObject("SELECT school_id FROM users WHERE id=? AND status=1 AND role='ADMIN'",Long.class,actor);}
    private void ready(){if(!enabled||!teaching.lifecycleEnabled()||!teaching.identityReviewEnabled())throw error(503,"受控调停课尚未启用，需先核对增量迁移、身份审核、名单与学籍配置");}
    public Access access(long actor){authorize(actor);return new Access(enabled&&teaching.lifecycleEnabled()&&teaching.identityReviewEnabled(),TeachingService.MAX_COURSE_MEMBERS,"ONE_FUTURE_LESSON");}
    private String hash(Object value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(value)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private Source source(long school,String id){
        uuid(id);
        var rows=db.queryForList("SELECT l.*,c.name,c.semester,c.first_monday,c.teacher_id,c.room,c.request_hash,c.class_id AS anchor,r.group_name,r.revision AS roster_revision,m.mode AS enrollment_mode,b.college,b.name AS class_name,COALESCE(NULLIF(u.nickname,''),u.username,'原教师账号不可用') AS teacher_label FROM teaching_lessons l JOIN teaching_courses c ON c.id=l.course_id AND c.school_id=l.school_id JOIN teaching_classes b ON b.id=c.class_id AND b.school_id=c.school_id JOIN teaching_course_rosters r ON r.course_id=c.id AND r.school_id=c.school_id LEFT JOIN teaching_course_enrollment_modes m ON m.course_id=c.id AND m.school_id=c.school_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=c.school_id WHERE l.school_id=? AND l.id=?",school,id);
        if(rows.isEmpty())throw error(404,"课程不在本校或名单基线尚未核对");var r=rows.get(0);
        if(!Objects.equals(r.get("class_id"),r.get("anchor")))throw error(503,"本次课与课程底档的主办班不一致，未猜测归属");
        String mode=(String)r.get("enrollment_mode");if(mode==null||!Set.of("LEGACY","ADMIN_CLASS","EXPLICIT").contains(mode))throw error(503,"课程来源基线缺失或无效，未猜测整班或选修");
        var people=db.query("SELECT a.student_id,a.student_number,a.student_name,a.status,r.admin_class_id,r.college,r.withdrawn,r.captured_at,COALESCE(x.status,'ACTIVE') AS life_status,s.school_id AS member_school,b.school_id AS class_school,x.school_id AS life_school FROM teaching_attendance a LEFT JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id AND r.school_id=? LEFT JOIN teaching_students s ON s.id=a.student_id LEFT JOIN teaching_classes b ON b.id=r.admin_class_id LEFT JOIN teaching_student_lifecycle x ON x.student_id=a.student_id WHERE a.lesson_id=? ORDER BY a.student_id LIMIT 4001",(rs,n)->{
            if(rs.getString("admin_class_id")==null||rs.getString("college")==null||rs.getObject("withdrawn")==null||rs.getLong("member_school")!=school||rs.getLong("class_school")!=school||rs.getObject("life_school")!=null&&rs.getLong("life_school")!=school||rs.getTimestamp("captured_at")==null||!TeachingService.STATUSES.contains(rs.getString("status")))throw error(503,"本次课存在缺失或跨校的名单归属，未返回部分结果");
            return new Person(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getBoolean(7),rs.getTimestamp(8).toInstant(),rs.getString(9));},school,id);
        if(people.size()>4000||people.stream().filter(p->!p.withdrawn).count()>TeachingService.MAX_COURSE_MEMBERS)throw error(409,"本次课名单超出受控上限，未处理部分成员");
        Instant start=((Timestamp)r.get("starts_at")).toInstant(),end=((Timestamp)r.get("ends_at")).toInstant();var a=start.atZone(TeachingService.ZONE);var z=end.atZone(TeachingService.ZONE);
        if(!a.toLocalDate().equals(z.toLocalDate()))throw error(409,"跨日课程须先人工核对，未猜测日期");
        var target=new Target(id,(String)r.get("course_id"),((Number)r.get("revision")).intValue(),((Number)r.get("roster_revision")).intValue(),(String)r.get("name"),(String)r.get("semester"),((java.sql.Date)r.get("first_monday")).toLocalDate(),(String)r.get("anchor"),r.get("college")+" · "+r.get("class_name"),(String)r.get("group_name"),r.get("teacher_id")==null?null:((Number)r.get("teacher_id")).longValue(),(String)r.get("teacher_label"),a.toLocalDate(),a.toLocalTime().toString(),z.toLocalTime().toString(),(String)r.get("room"),(int)people.stream().filter(p->!p.withdrawn).count(),mode,"");
        String fingerprint=hash(List.of(target,people,r.get("request_hash"),r.get("cancelled"),r.get("finalized")));
        target=new Target(target.lessonId,target.courseId,target.revision,target.rosterRevision,target.name,target.semester,target.firstMonday,target.classId,target.classLabel,target.groupName,target.teacherId,target.teacherLabel,target.date,target.startTime,target.endTime,target.room,target.members,target.enrollmentMode,fingerprint);
        return new Source(target,List.copyOf(people),(Boolean)r.get("cancelled"),(Boolean)r.get("finalized"),start,(String)r.get("request_hash"));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Target target(long actor,String id){long school=authorize(actor);ready();return source(school,id).target;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Options page(long actor,LocalDate from,LocalDate to,int page,int size,String search){
        long school=authorize(actor);ready();if(from==null||to==null||from.getYear()<2000||to.getYear()>2100||to.isBefore(from)||to.isAfter(from.plusDays(30))||page<0||page>10000||size<1||size>100)throw error(400,"选择31天以内的日期，每页1至100项");
        String q=search==null?"":search.trim();if(q.length()>100||q.chars().anyMatch(Character::isISOControl))throw error(400,"查找文字无效");
        var args=new ArrayList<Object>(List.of(school,Timestamp.from(from.atStartOfDay(TeachingService.ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(TeachingService.ZONE).toInstant()),Timestamp.from(clock.instant().plusSeconds(300))));
        String joined=" FROM teaching_lessons l JOIN teaching_courses c ON c.id=l.course_id AND c.school_id=l.school_id JOIN teaching_classes b ON b.id=c.class_id AND b.school_id=c.school_id LEFT JOIN teaching_course_rosters r ON r.course_id=c.id AND r.school_id=c.school_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=c.school_id ";
        String where=" WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<? AND l.starts_at>? AND l.cancelled=FALSE";
        if(!q.isEmpty()){String like="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";where+=" AND (c.name LIKE ? ESCAPE '!' OR c.semester LIKE ? ESCAPE '!' OR c.room LIKE ? ESCAPE '!' OR r.group_name LIKE ? ESCAPE '!' OR u.username LIKE ? ESCAPE '!' OR u.nickname LIKE ? ESCAPE '!')";for(int i=0;i<6;i++)args.add(like);}
        if(db.queryForObject("SELECT COUNT(*)"+joined+where+" AND r.course_id IS NULL",Integer.class,args.toArray())>0)throw error(503,"查询范围存在未建立的名单基线，未静默漏掉课程");
        int total=db.queryForObject("SELECT COUNT(*)"+joined+where,Integer.class,args.toArray()),pages=(total+size-1)/size;if(page>0&&page>=pages)throw error(409,"课程清单已变化，请重新读取第一页");
        args.add(size);args.add(page*size);var items=db.query("SELECT l.id,c.name,c.semester,r.group_name,COALESCE(NULLIF(u.nickname,''),u.username,'原教师账号不可用') AS teacher,c.room,l.starts_at,l.ends_at,l.revision,CASE WHEN l.finalized=TRUE OR EXISTS(SELECT 1 FROM teaching_attendance a WHERE a.lesson_id=l.id AND a.status<>'UNKNOWN') THEN '已有点名记录，不能直接调停课' ELSE '' END AS blocked"+joined+where+" ORDER BY l.starts_at,l.id LIMIT ? OFFSET ?",(r,n)->new Option(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6),r.getTimestamp(7).toInstant(),r.getTimestamp(8).toInstant(),r.getInt(9),r.getString(10)),args.toArray());
        return new Options(items,page,size,total,pages,from,to,q);
    }
    private Input normalize(Input in){
        if(in==null)throw error(400,"调停课资料缺失");uuid(in.requestId);uuid(in.lessonId);text(in.reason,300);
        if(in.revision<0||in.revision==Integer.MAX_VALUE||in.sourceHash==null||!in.sourceHash.matches("[a-f0-9]{64}")||!Set.of("RESCHEDULE","CANCEL").contains(in.action==null?"":in.action))throw error(400,"请核对版本、当前来源与变更类型");
        if("CANCEL".equals(in.action)&&(in.date!=null||in.startTime!=null||in.endTime!=null||in.teacherId!=null||in.room!=null))throw error(400,"取消本次课不接受另一个调课目标");
        if("RESCHEDULE".equals(in.action)){
            text(in.room,100);if(in.date==null||in.teacherId==null||in.teacherId<1||in.startTime==null||in.endTime==null||!in.startTime.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")||!in.endTime.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")||in.startTime.compareTo(in.endTime)>=0)throw error(400,"请选择明确日期、起止钟点、任课教师和教室");
        }
        return new Input(in.requestId,in.lessonId,in.revision,in.sourceHash,in.action,in.date,in.startTime,in.endTime,in.teacherId,in.room==null?null:in.room.trim(),in.reason.trim(),in.previewHash);
    }
    private static String deterministic(String value){return UUID.nameUUIDFromBytes(value.getBytes(StandardCharsets.UTF_8)).toString();}
    private TeachingService.CourseInput replacement(long school,Input in,Target old){
        long week=ChronoUnit.WEEKS.between(old.firstMonday,in.date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)))+1;
        if(week<1||week>30)throw error(400,"调课日期超出原学期30周，跨学期请另建安排");
        return new TeachingService.CourseInput(deterministic("lesson-change:"+school+":"+in.requestId),old.classId,in.teacherId,old.name,old.semester,old.firstMonday,in.date.getDayOfWeek().getValue(),in.startTime,in.endTime,List.of((int)week),in.room);
    }
    private Preview inspect(long actor,long school,Input in,Source source){
        var old=source.target;
        if(old.revision!=in.revision||!old.sourceHash.equals(in.sourceHash))throw error(409,"原课程、名单或归属已变化，请重新读取，未覆盖旧安排");
        if(source.cancelled||source.finalized||!source.startsAt.isAfter(clock.instant().plusSeconds(300))||source.people.stream().anyMatch(p->!"UNKNOWN".equals(p.status)))throw error(409,"已取消、已点名或已进入课前5分钟的课不能从此入口改动；保留原记录");
        if(source.people.stream().anyMatch(p->!p.withdrawn&&!"ACTIVE".equals(p.lifeStatus)))throw error(409,"名单中存在离校或异常学籍，请先核对，不自动恢复选课");
        if(old.members==0&&"RESCHEDULE".equals(in.action))throw error(409,"本次课没有有效名单，不能借调课自动加入同学；可明确取消本次课");
        Proposed proposed=null;var conflicts=new ArrayList<Conflict>();
        if("RESCHEDULE".equals(in.action)){
            if("LEGACY".equals(old.enrollmentMode))throw error(409,"先核定历史课程为整班或逐人来源；不能借调课改变课程类型");
            if("ADMIN_CLASS".equals(old.enrollmentMode)&&source.people.stream().anyMatch(p->!p.withdrawn&&!old.classId.equals(p.adminClass)))throw error(409,"整班课存在其他行政班的有效成员，请先核对原课程类型");
            var course=replacement(school,in,old);var verified=teaching.previewCourse(actor,new TeachingService.CourseDraft(course,"CLASS","",List.of()));
            Instant start=in.date.atTime(LocalTime.parse(in.startTime)).atZone(TeachingService.ZONE).toInstant(),end=in.date.atTime(LocalTime.parse(in.endTime)).atZone(TeachingService.ZONE).toInstant();
            if(!start.isAfter(clock.instant().plusSeconds(300)))throw error(409,"目标课程须尚未进入课前5分钟，不能补造过去安排");
            if(in.date.equals(old.date)&&in.startTime.equals(old.startTime)&&in.endTime.equals(old.endTime)&&Objects.equals(in.teacherId,old.teacherId)&&in.room.equals(old.room))throw error(409,"安排没有变化，不创建重复课程");
            proposed=new Proposed(in.date,in.startTime,in.endTime,in.teacherId,verified.teacherLabel(),in.room);
            var args=List.of(school,old.lessonId,Timestamp.from(end),Timestamp.from(start));
            String from=" FROM teaching_lessons l JOIN teaching_courses c ON c.id=l.course_id AND c.school_id=l.school_id WHERE l.school_id=? AND l.id<>? AND l.cancelled=FALSE AND l.starts_at<? AND l.ends_at>?";
            var teacherArgs=new ArrayList<Object>(args);teacherArgs.add(in.teacherId);int teacher=db.queryForObject("SELECT COUNT(*)"+from+" AND c.teacher_id=?",Integer.class,teacherArgs.toArray());if(teacher>0)conflicts.add(new Conflict("TEACHER",teacher));
            var roomArgs=new ArrayList<Object>(args);roomArgs.add(in.room.toLowerCase(Locale.ROOT));int room=db.queryForObject("SELECT COUNT(*)"+from+" AND LOWER(TRIM(c.room))=?",Integer.class,roomArgs.toArray());if(room>0)conflicts.add(new Conflict("ROOM",room));
            var memberArgs=new ArrayList<Object>(args);memberArgs.add(old.lessonId);int members=db.queryForObject("SELECT COUNT(*)"+from+" AND EXISTS(SELECT 1 FROM teaching_attendance_scopes x JOIN teaching_attendance_scopes origin ON origin.student_id=x.student_id AND origin.school_id=x.school_id WHERE x.lesson_id=l.id AND x.school_id=l.school_id AND x.withdrawn=FALSE AND origin.lesson_id=? AND origin.withdrawn=FALSE)",Integer.class,memberArgs.toArray());if(members>0)conflicts.add(new Conflict("MEMBERS",members));
        }
        String fingerprint=hash(Arrays.asList(in.requestId,old,in.action,proposed,in.reason,conflicts));
        return new Preview(old,proposed,in.action,in.reason,fingerprint,List.copyOf(conflicts),List.of("只调整这一项未来课程，不改原课程其他周次、过去考勤或成员行政归属。","保留原课程类型：整班后续按学籍规则联动；逐人选修不自动补入整班。","冲突仅核本站教学安排：教师、相同教室文字及实际选课成员；不冒充已接教务或读取其他人的私人导入。"));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=15)
    public Preview preview(long actor,Input raw){long school=authorize(actor);ready();var in=normalize(raw);return inspect(actor,school,in,source(school,in.lessonId));}
    private Receipt replay(long school,long actor,String id,String expected){
        var rows=db.queryForList("SELECT actor_id,request_hash,receipt_json FROM teaching_lesson_changes WHERE school_id=? AND request_id=?",school,id);
        if(rows.isEmpty())return null;var row=rows.get(0);if(((Number)row.get("actor_id")).longValue()!=actor||expected!=null&&!expected.equals(row.get("request_hash")))throw error(409,"同一请求编号已用于其他内容，未冒认原回执");
        return json.readValue((String)row.get("receipt_json"),Receipt.class);
    }
    @Transactional(readOnly=true)
    public Receipt request(long actor,String id){long school=authorize(actor);ready();uuid(id);var rows=db.queryForList("SELECT receipt_json FROM teaching_lesson_changes WHERE school_id=? AND request_id=? AND actor_id=?",String.class,school,id,actor);if(rows.isEmpty())throw error(404,"尚未查到本次回执；不能据此认为在途保存没有执行");return json.readValue(rows.get(0),Receipt.class);}
    @Transactional(isolation=Isolation.READ_COMMITTED,timeout=20)
    public Receipt change(long actor,Input raw){
        long school=authorize(actor);ready();var in=normalize(raw);if(in.previewHash==null||!in.previewHash.matches("[a-f0-9]{64}"))throw error(400,"先生成并核对调停课预览");String requestHash=hash(in);
        teaching.scheduleWriteLock(school);
        var oldReceipt=replay(school,actor,in.requestId,requestHash);if(oldReceipt!=null)return oldReceipt;
        var userIds=new TreeSet<Long>();userIds.add(actor);if(in.teacherId!=null)userIds.add(in.teacherId);
        db.queryForList("SELECT id FROM users WHERE id IN ("+String.join(",",Collections.nCopies(userIds.size(),"?"))+") ORDER BY id FOR UPDATE",Long.class,userIds.toArray());authorize(actor);
        var before=source(school,in.lessonId);var ids=before.people.stream().map(Person::id).sorted().toList();
        if(!ids.isEmpty()){var args=new ArrayList<Object>(List.of(school));args.addAll(ids);db.queryForList("SELECT id FROM teaching_students WHERE school_id=? AND id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+") ORDER BY id FOR UPDATE",String.class,args.toArray());}
        db.queryForObject("SELECT revision FROM teaching_course_rosters WHERE course_id=? AND school_id=? FOR UPDATE",Integer.class,before.target.courseId,school);
        db.queryForObject("SELECT revision FROM teaching_lessons WHERE id=? AND school_id=? FOR UPDATE",Integer.class,in.lessonId,school);
        var original=source(school,in.lessonId);var plan=inspect(actor,school,in,original);
        if(!in.previewHash.equals(plan.fingerprint))throw error(409,"预览目标或名单已经变化，请重新核对，未提交");if(!plan.conflicts.isEmpty())throw error(409,"目标时间存在教师、教室或选课冲突，请重新安排；未保存部分变更");
        String newCourse=null,newLesson=null;
        if("RESCHEDULE".equals(in.action)){
            var course=replacement(school,in,original.target);var selected=original.people.stream().filter(p->!p.withdrawn).map(Person::id).toList();
            if(db.queryForObject("SELECT COUNT(*) FROM teaching_courses WHERE id=?",Integer.class,course.id())!=0)throw error(409,"替代课程编号已存在但没有本次回执，未修改已有数据；请核对原请求");
            newCourse=teaching.createRosterCourse(actor,new TeachingService.RosterCourseInput(course,original.target.groupName,selected));newLesson=deterministic(newCourse+":"+in.date);
            if(db.update("UPDATE teaching_course_enrollment_modes SET mode=? WHERE course_id=? AND school_id=?",original.target.enrollmentMode,newCourse,school)!=1)throw error(503,"替代安排来源未完整建立，整笔已回滚");
            // Only the rows just staged by this transaction are replaced. All original evidence stays.
            db.update("DELETE FROM teaching_attendance_scopes WHERE lesson_id=? AND school_id=?",newLesson,school);
            db.update("DELETE FROM teaching_attendance WHERE lesson_id=?",newLesson);
            int copied=db.update("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name,status) SELECT ?,a.student_id,a.student_number,a.student_name,'UNKNOWN' FROM teaching_attendance a JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id WHERE a.lesson_id=? AND r.school_id=? AND r.withdrawn=FALSE",newLesson,in.lessonId,school);
            int scopes=db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source,captured_at) SELECT ?,student_id,school_id,admin_class_id,college,FALSE,source,captured_at FROM teaching_attendance_scopes WHERE lesson_id=? AND school_id=? AND withdrawn=FALSE",newLesson,in.lessonId,school);
            if(copied!=selected.size()||scopes!=selected.size())throw error(409,"原名单变化，已回滚整个调课请求，未生成部分安排");
        }
        if(db.update("UPDATE teaching_lessons SET cancelled=TRUE,revision=revision+1 WHERE school_id=? AND id=? AND revision=? AND cancelled=FALSE",school,in.lessonId,in.revision)!=1)throw error(409,"原课程版本已变化，整项变更已回滚");
        Instant now=clock.instant().truncatedTo(ChronoUnit.SECONDS);var receipt=new Receipt(in.requestId,actor,in.action,original.target,newCourse,newLesson,plan.proposed,in.revision+1,in.reason,now);
        db.update("INSERT INTO teaching_lesson_changes(school_id,request_id,actor_id,old_lesson_id,new_lesson_id,new_course_id,request_hash,old_revision,revision,reason,receipt_json,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",school,in.requestId,actor,in.lessonId,newLesson,newCourse,requestHash,in.revision,in.revision+1,in.reason,json.writeValueAsString(receipt),Timestamp.from(now));
        TeachingLessonChangeNotices.record(db,school,receipt);
        return replay(school,actor,in.requestId,requestHash);
    }
}
