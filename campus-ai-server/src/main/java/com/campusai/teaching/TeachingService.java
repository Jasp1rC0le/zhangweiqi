package com.campusai.teaching;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Private teaching scope; never a public knowledge document or client-selected privilege. */
@Service
public class TeachingService {
    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    public static final Set<String> STATUSES = Set.of("UNKNOWN", "ON_TIME", "LATE", "ABSENT", "EXCUSED", "EARLY_LEAVE");
    public static final int MAX_COURSE_MEMBERS=2000;
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final boolean enabled;
    private final Clock clock;
    private final TeachingIdentityService identities;
    private final int reminderLessons,reminderNotices,prepareSeconds;
    private final boolean rostersEnabled;
    private final boolean lifecycleEnabled;
    @Value("${app.teaching.responsibility-enabled:false}") private boolean responsibilityEnabled;
    @Value("${app.teaching.lesson-change-enabled:false}") private boolean lessonChangesEnabled;
    @Autowired public TeachingService(JdbcTemplate db, ObjectMapper json, @Value("${app.teaching.enabled:false}") boolean enabled, TeachingIdentityService identities,
            @Value("${app.teaching.reminder-lesson-batch:100}") int lessons,@Value("${app.teaching.reminder-notice-batch:1000}") int notices,
            @Value("${app.teaching.reminder-prepare-seconds:900}") int prepareSeconds,@Value("${app.teaching.roster-enabled:false}") boolean rostersEnabled,
            @Value("${app.teaching.lifecycle-enabled:false}") boolean lifecycleEnabled) {
        this(db, json, enabled, Clock.systemUTC(),identities,lessons,notices,prepareSeconds,rostersEnabled,lifecycleEnabled);
    }
    public TeachingService(JdbcTemplate db, ObjectMapper json, boolean enabled, Clock clock) {
        this(db,json,enabled,clock,null);
    }
    public TeachingService(JdbcTemplate db, ObjectMapper json, boolean enabled, Clock clock,TeachingIdentityService identities) {
        this(db,json,enabled,clock,identities,100,1000,0);
    }
    public TeachingService(JdbcTemplate db, ObjectMapper json, boolean enabled, Clock clock,TeachingIdentityService identities,int lessons,int notices,int prepareSeconds) {
        this(db,json,enabled,clock,identities,lessons,notices,prepareSeconds,false);
    }
    public TeachingService(JdbcTemplate db, ObjectMapper json, boolean enabled, Clock clock,TeachingIdentityService identities,int lessons,int notices,int prepareSeconds,boolean rostersEnabled) {
        this(db,json,enabled,clock,identities,lessons,notices,prepareSeconds,rostersEnabled,false);
    }
    public TeachingService(JdbcTemplate db, ObjectMapper json, boolean enabled, Clock clock,TeachingIdentityService identities,int lessons,int notices,int prepareSeconds,boolean rostersEnabled,boolean lifecycleEnabled) {
        if(lessons<1 || lessons>500 || notices<1 || notices>5000 || prepareSeconds<0 || prepareSeconds>1800)throw new IllegalArgumentException("提醒批次配置无效");
        this.db=db; this.json=json; this.enabled=enabled; this.clock=clock;
        this.identities=identities;
        this.reminderLessons=lessons;this.reminderNotices=notices;this.prepareSeconds=prepareSeconds;
        this.rostersEnabled=rostersEnabled;
        if(lifecycleEnabled && !rostersEnabled)throw new IllegalArgumentException("学籍联动需要独立教学名单");
        this.lifecycleEnabled=lifecycleEnabled;
    }
    public record Member(String studentNumber, String name, Long userId) {}
    public record ClassInput(String id, String college, String name, List<Member> members) {}
    public record CourseInput(String id, String classId, Long teacherId, String name, String semester,
            LocalDate firstMonday, int weekday, String startTime, String endTime, List<Integer> weeks, String room) {}
    public record GrantInput(Long userId, String viewRole, String scopeKey) {}
    public record RosterCourseInput(CourseInput course,String groupName,List<String> studentIds) {}
    public record WithdrawInput(int revision,String reason) {}
    public record Enrollment(String studentId,String studentNumber,String name,String adminClassId,String college,boolean active) {}
    public record CourseTarget(String name,String semester,String teacher,int weekday,String startTime,String endTime,String room) {}
    public record CourseRoster(String courseId,String groupName,int revision,List<Enrollment> members,CourseTarget target) {}
    public record CourseRosterPage(CourseRoster roster,int page,int size,int total,int totalPages,int activeTotal,String search,boolean activeOnly) {}
    public record CourseMember(String courseId,int revision,Enrollment member) {}
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CourseMember courseMember(long actor,String course,String student) {
        Principal p=admin(actor);uuid(course);uuid(student);if(!rostersEnabled)throw error(503,"独立名单尚未启用");var header=courseRosterHeader(p,course);
        var rows=db.query("SELECT s.id,s.student_number,s.name,s.class_id,b.college,m.active FROM teaching_course_members m JOIN teaching_students s ON s.id=m.student_id AND s.school_id=m.school_id JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=s.school_id WHERE m.school_id=? AND m.course_id=? AND m.student_id=?",(r,n)->new Enrollment(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getBoolean(6)),p.school,course,student);
        if(rows.isEmpty())throw error(404,"成员不在该课程名单");return new CourseMember(course,header.revision(),rows.get(0));
    }
    public record AccountBinding(Long userId, Long expectedUserId) {}
    public record ClassRow(String id, String college, String name, int members, int linked) {}
    public record ConfigOption(String value,String label,String description) {}
    public record ConfigPage(List<ConfigOption> items,ConfigOption selected,int page,int size,int total,int totalPages) {}
    public record CourseDefinition(CourseInput course,String fingerprint) {}
    public record CourseDraft(CourseInput course,String rosterMode,String groupName,List<String> studentIds) {}
    public record CourseDraftPreview(String id,String classLabel,String teacherLabel,String fingerprint,int members,String rosterMode,String groupName) {}
    private void validateCourseInput(Principal p,CourseInput in){
        if(in==null)throw error(400,"课程资料缺失");uuid(in.id);uuid(in.classId);classInSchool(in.classId,p.school);sameSchoolAccount(in.teacherId,p.school);
        if(identities!=null)identities.requireApproved(in.teacherId,"TEACHER");
        text(in.name,100,true);text(in.semester,100,true);text(in.room,100,true);
        if(in.firstMonday==null||in.firstMonday.getYear()<2000||in.firstMonday.getYear()>2100||in.firstMonday.getDayOfWeek()!=DayOfWeek.MONDAY||in.weekday<1||in.weekday>7||!time(in.startTime)||!time(in.endTime)||in.startTime.compareTo(in.endTime)>=0||in.weeks==null||in.weeks.isEmpty()||in.weeks.size()>30||in.weeks.stream().anyMatch(w->w==null||w<1||w>30))throw error(400,"需填写已核实钟点、周次和第1周周一；不能从节次猜时间");
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CourseDraftPreview previewCourse(long actor,CourseDraft draft){
        Principal p=admin(actor);if(draft==null||!Set.of("CLASS","SELECTED").contains(draft.rosterMode==null?"":draft.rosterMode))throw error(400,"明确整班或逐人选课");
        var in=draft.course;validateCourseInput(p,in);boolean selected="SELECTED".equals(draft.rosterMode);List<String> ids=null;int members;
        if(selected){if(!rostersEnabled)throw error(503,"独立名单尚未启用");text(draft.groupName,100,true);if(draft.studentIds==null||draft.studentIds.isEmpty()||draft.studentIds.size()>MAX_COURSE_MEMBERS)throw error(400,"明确选择1至2000位同学");draft.studentIds.forEach(TeachingService::uuid);ids=draft.studentIds.stream().distinct().sorted().toList();if(ids.size()!=draft.studentIds.size())throw error(400,"名单重复");var args=new ArrayList<Object>(List.of(p.school));args.addAll(ids);String where="s.school_id=? AND s.id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")";if(lifecycleEnabled)where+=" AND NOT EXISTS(SELECT 1 FROM teaching_student_lifecycle x WHERE x.student_id=s.id AND x.status='LEFT')";members=db.queryForObject("SELECT COUNT(*) FROM teaching_students s WHERE "+where,Integer.class,args.toArray());if(members!=ids.size())throw error(409,"所选名单或学籍已变化，请重新核对");}
        else members=db.queryForObject("SELECT COUNT(*) FROM teaching_students s WHERE s.school_id=? AND s.class_id=?"+(lifecycleEnabled?" AND NOT EXISTS(SELECT 1 FROM teaching_student_lifecycle x WHERE x.student_id=s.id AND x.status='LEFT')":""),Integer.class,p.school,in.classId);
        var parts=new ArrayList<Object>(List.of(in.classId,in.teacherId,in.name.trim(),in.semester.trim(),in.firstMonday,in.weekday,in.startTime,in.endTime,in.weeks.stream().distinct().sorted().toList(),in.room.trim()));if(selected){parts.add(draft.groupName.trim());parts.add(ids);}
        String label=db.queryForObject("SELECT CONCAT(college,' · ',name) FROM teaching_classes WHERE school_id=? AND id=?",String.class,p.school,in.classId),teacher=db.queryForObject("SELECT CONCAT(username,' · ',nickname) FROM users WHERE school_id=? AND id=?",String.class,p.school,in.teacherId);
        return new CourseDraftPreview(in.id,label,teacher,hash(parts),members,draft.rosterMode,selected?draft.groupName.trim():"");
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CourseDefinition courseDefinition(long actor,String id){
        Principal p=admin(actor);uuid(id);
        var rows=db.query("SELECT * FROM teaching_courses WHERE school_id=? AND id=?",(r,n)->new CourseDefinition(new CourseInput(r.getString("id"),r.getString("class_id"),r.getLong("teacher_id"),r.getString("name"),r.getString("semester"),r.getDate("first_monday").toLocalDate(),r.getInt("weekday"),r.getString("start_time"),r.getString("end_time"),json.readValue(r.getString("weeks_json"),json.getTypeFactory().constructCollectionType(List.class,Integer.class)),r.getString("room")),r.getString("request_hash")),p.school,id);
        if(rows.isEmpty())throw error(404,"课程尚未查到；不能据此推断在途保存没有执行");return rows.get(0);
    }
    public record Capabilities(boolean rosterEnabled,int maxCourseMembers,boolean lifecycleEnabled,boolean readmissionEnabled,boolean reenrollmentEnabled,boolean governanceEnabled,boolean enrollmentModeReviewEnabled,boolean administrativeAuditEnabled) {}
    public Capabilities capabilities(long actor) { admin(actor);return new Capabilities(rostersEnabled,MAX_COURSE_MEMBERS,lifecycleEnabled(),lifecycleEnabled(),lifecycleEnabled(),true,lifecycleEnabled(),true); }
    public record MemberRow(String id, String studentNumber, String name, Long userId) {}
    public record Mark(String studentId, String status) {}
    public record RollCall(int revision, List<Mark> marks, String reason, boolean finish) {}
    public record Access(boolean enabled, List<String> views,boolean governanceEnabled) {
        public Access(boolean enabled,List<String> views){this(enabled,views,false);}
    }
    public record Counts(int unknown, int onTime, int late, int absent, int excused,int earlyLeave) {
        public Counts(int unknown,int onTime,int late,int absent,int excused){this(unknown,onTime,late,absent,excused,0);}
        public int total() { return unknown+onTime+late+absent+excused+earlyLeave; }
    }
    public record Lesson(String id, String course, String className, String college, String teacher, String room,
            Instant startsAt, Instant endsAt, int revision, boolean finalized, boolean cancelled, Counts counts) {}
    public record Entry(String studentId, String studentNumber, String name, String status) {}
    public record Detail(Lesson lesson, List<Entry> entries, boolean canMark, boolean canRecordAbsence) {}
    public record DetailPage(Detail detail,int page,int size,int total,int totalPages,String search) {}
    public record Notice(String id, String lessonId, String kind, String course, String room,
            String teacher, Instant startsAt, Instant dueAt, Instant readAt) {}
    public record DayAnswer(String answer, String source, LocalDate date) {}
    public record ClassOption(String id,String name,String college) {}
    public record ClassPage(List<ClassOption> items,int page,int size,int total,int totalPages) {}
    public record LessonPage(List<Lesson> items,int page,int size,int total,int totalPages,ScopeSummary summary,int planned,int today,int conflicts,Set<String> conflictIds) {}
    public record ScheduleLesson(String id,String course,String className,String teacher,String room,Instant startsAt,Instant endsAt,int revision,boolean cancelled) {}
    public record ScheduleLessonPage(List<ScheduleLesson> items,int total) {}
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public ScheduleLessonPage scheduleExportPage(long user,String view,LocalDate from,LocalDate to,String classId,int page){
        Principal p="ADMIN".equals(view)?admin(user):principal(user);if(page<0||page>10000||from==null||to==null||to.isBefore(from)||to.isAfter(from.plusDays(30)))throw error(400,"课表页码或日期无效");
        var args=new ArrayList<Object>(List.of(p.school,Timestamp.from(from.atStartOfDay(ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant())));
        String where=" WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<?";
        if(!"ADMIN".equals(view))where+=" AND "+scope(p,view,args);
        if(classId!=null&&!classId.isBlank()){
            if("ADMIN".equals(view)){uuid(classId);classInSchool(classId,p.school);where+=rostersEnabled?" AND (EXISTS(SELECT 1 FROM teaching_attendance_scopes r WHERE r.lesson_id=l.id AND r.school_id=l.school_id AND r.admin_class_id=? AND r.withdrawn=FALSE) OR (l.class_id=? AND NOT EXISTS(SELECT 1 FROM teaching_attendance a WHERE a.lesson_id=l.id)))":" AND l.class_id=?";args.add(classId);if(rostersEnabled)args.add(classId);}
            else{authorizedClass(p,view,classId);where+=" AND "+lessonClassFilter(p,view,classId,args);}
        }
        requireRangeBaseline(p,view,from,to,where,args);
        int total=db.queryForObject("SELECT COUNT(*) "+LESSON_FROM+where,Integer.class,args.toArray());var paged=new ArrayList<>(args);Collections.addAll(paged,100,page*100);
        var rows=db.query(lessonSql()+where+" ORDER BY l.starts_at,l.id LIMIT ? OFFSET ?",(r,n)->new ScheduleLesson(r.getString("id"),r.getString("course_name"),r.getString("class_name"),r.getString("teacher_name"),r.getString("room"),r.getTimestamp("starts_at").toInstant(),r.getTimestamp("ends_at").toInstant(),r.getInt("revision"),r.getBoolean("cancelled")),paged.toArray());
        return new ScheduleLessonPage(rows,total);
    }
    public record ScopeSummary(Counts counts,int absentStudents) {}
    /** Internal parameterized relation, never accepted from or returned by a controller. */
    public record LessonRelation(String sql,List<Object> args) {}
    public LessonRelation ownLessonRelation(long user,String view,LocalDate from,LocalDate to,String classId) {
        if(!Set.of("STUDENT","TEACHER").contains(view))throw error(403,"本人混合课表不接受管理范围");
        Principal p=principal(user);
        if(from==null || to==null || to.isBefore(from) || to.isAfter(from.plusDays(6)))throw error(400,"混合课表每次限一周");
        var args=new ArrayList<Object>(List.of(p.school,Timestamp.from(from.atStartOfDay(ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant())));
        String clause=scope(p,view,args);
        if(classId!=null && !classId.isBlank()){authorizedClass(p,view,classId);clause+=" AND "+lessonClassFilter(p,view,classId,args);}
        String where=" WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<? AND "+clause;
        requireRangeBaseline(p,view,from,to,where,args);
        String sql=lessonSql()+where;
        return new LessonRelation(sql,List.copyOf(args));
    }
    public List<Lesson> ownLessonsByIds(long user,String view,LocalDate from,LocalDate to,String classId,List<String> ids) {
        if(ids.isEmpty())return List.of();if(ids.size()>100)throw error(400,"每页最多100项");
        ids.forEach(TeachingService::uuid);var relation=ownLessonRelation(user,view,from,to,classId);var args=new ArrayList<>(relation.args());args.addAll(ids);
        Principal p=principal(user);var rows=db.query(relation.sql()+" AND l.id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")",(r,n)->bound(r),args.toArray());
        if(rows.size()!=new HashSet<>(ids).size())throw error(409,"课表授权或记录已变化，请重新读取");
        var totals=countBatch(rows,p,view,classId);return rows.stream().map(b->enriched(b,totals.get(b.lesson.id))).toList();
    }
    public record AuditRow(String id,String studentNumber,String studentName,String actorName,String oldStatus,String newStatus,String reason,Instant recordedAt,Instant expiresAt,boolean expired) {}
    public record AuditPage(String lessonId,String view,List<AuditRow> items,int page,int size,int total,int totalPages,int retentionYears,int expiredWithinScope,boolean deletionEnabled) {}
    /** Package-only, parameterized relation for authorized governance reads. Never accepts caller SQL. */
    record GovernanceRelation(String from,String where,List<Object> args) {}
    GovernanceRelation governanceRelation(long user,String view,LocalDate from,LocalDate to,String classId) {
        Principal p="ADMIN".equals(view)?admin(user):principal(user);
        if(from==null || to==null || to.isBefore(from) || to.isAfter(from.plusDays(30)))throw error(400,"每次查询限31天，请分期核对或导出");
        var args=new ArrayList<Object>(List.of(p.school,Timestamp.from(from.atStartOfDay(ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant())));
        String where="WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<? AND "+("ADMIN".equals(view)?"1=1":scope(p,view,args));
        boolean selected=classId!=null && !classId.isBlank();
        if(selected) {
            if("ADMIN".equals(view)){uuid(classId);classInSchool(classId,p.school);}
            else authorizedClass(p,view,classId);
        }
        // Check the complete authorized lesson range before filtering individual rows or pages.
        requireRangeBaseline(p,view,from,to,where,args);
        String rowScope;
        if("ADMIN".equals(view)) {
            rowScope="1=1";
            if(selected){rowScope=rostersEnabled?"r.admin_class_id=?":"l.class_id=?";args.add(classId);}
        } else rowScope=attendanceScope(p,view,selected?classId:null,args);
        String relation=" FROM teaching_attendance a JOIN teaching_lessons l ON l.id=a.lesson_id JOIN teaching_courses c ON c.id=l.course_id AND c.school_id=l.school_id JOIN teaching_classes b ON b.id=l.class_id AND b.school_id=l.school_id LEFT JOIN users teacher ON teacher.id=c.teacher_id AND teacher.school_id=l.school_id ";
        if(rostersEnabled)relation+=" JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id AND r.school_id=l.school_id LEFT JOIN teaching_classes captured ON captured.id=r.admin_class_id AND captured.school_id=r.school_id ";
        String completeWhere=" "+where+" AND "+rowScope;
        if(rostersEnabled && !db.queryForList("SELECT a.student_id"+relation+completeWhere+" AND (captured.id IS NULL OR TRIM(r.college)='' OR TRIM(r.source)='') LIMIT 1",String.class,args.toArray()).isEmpty())throw error(503,"考勤历史归属不完整，请管理员核对；未返回部分记录");
        return new GovernanceRelation(relation,completeWhere,List.copyOf(args));
    }
    public boolean rostersEnabled() { return rostersEnabled; }
    public boolean lifecycleEnabled() { return enabled && lifecycleEnabled; }
    public boolean identityReviewEnabled(){return identities!=null&&identities.enabled();}
    public boolean privateCopyNeedsReview(long user,Instant checkedAt) {
        if(!lifecycleEnabled())return false;
        return db.queryForObject("SELECT COUNT(*) FROM teaching_student_lifecycle x JOIN teaching_students s ON s.id=x.student_id AND s.school_id=x.school_id WHERE s.user_id=? AND x.changed_at>?",Integer.class,user,Timestamp.from(checkedAt))>0;
    }
    private record Principal(long id, long school) {}
    public record NoticeAuthority(long school,boolean teacherAllowed){}
    public NoticeAuthority noticeAuthority(long user){Principal p=principal(user);return new NoticeAuthority(p.school,identities==null||identities.approvedRoles(user).contains("TEACHER"));}
    private record BoundLesson(Lesson lesson, long school, String classId, long teacherId, String room, boolean teacherAvailable) {}

    private Principal principal(long userId) {
        if (!enabled) throw error(503,"教学考勤尚未启用；请管理员完成授权配置和数据库迁移");
        var rows=db.query("SELECT id,school_id FROM users WHERE id=? AND status=1 AND school_id IS NOT NULL AND school_id>0",(r,n)->new Principal(r.getLong(1),r.getLong(2)),userId);
        if(rows.isEmpty()) throw error(403,"账号不可用");
        return rows.get(0);
    }
    private Principal admin(long userId) {
        Principal p=principal(userId);
        if (!"ADMIN".equals(db.queryForObject("SELECT role FROM users WHERE id=?",String.class,userId))) throw error(403,"需要管理员权限");
        return p;
    }
    private void sameSchoolAccount(Long userId,long school) {
        if(userId==null || db.queryForObject("SELECT COUNT(*) FROM users WHERE id=? AND school_id=? AND status=1",Integer.class,userId,school)!=1)
            throw error(400,"只能绑定本校已启用账号，不能按同名自动认领");
    }
    public Access access(long userId) {
        if(!enabled) return new Access(false,List.of());
        Principal p=principal(userId); List<String> views=new ArrayList<>();
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_students WHERE user_id=? AND school_id=?",Integer.class,p.id,p.school)>0) views.add("STUDENT");
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_courses WHERE teacher_id=? AND school_id=?",Integer.class,p.id,p.school)>0) views.add("TEACHER");
        for(String role:List.of("COUNSELOR","SECRETARY")) if(db.queryForObject("SELECT COUNT(*) FROM teaching_grants WHERE user_id=? AND school_id=? AND view_role=?",Integer.class,p.id,p.school,role)>0) views.add(role);
        if(identities!=null) { var approved=identities.approvedRoles(userId); views.removeIf(v->!"STUDENT".equals(v) && !approved.contains(v)); }
        return new Access(true,views,true);
    }
    @Transactional public String createClass(long actor,ClassInput in) {
        Principal p=admin(actor);
        if(in==null) throw error(400,"班级资料缺失"); uuid(in.id); text(in.college,100,true); text(in.name,100,true);
        if(in.members==null || in.members.isEmpty() || in.members.size()>300) throw error(400,"每班名单限1至300人");
        Set<String> numbers=new HashSet<>(); Set<Long> users=new HashSet<>();
        for(Member m:in.members) {
            if(m==null) throw error(400,"名单行无效"); text(m.name,100,true); text(m.studentNumber,40,true);
            if(!numbers.add(m.studentNumber.trim()) || (m.userId!=null && !users.add(m.userId))) throw error(400,"名单学号或账号重复，请核对");
            if(m.userId!=null) sameSchoolAccount(m.userId,p.school);
        }
        String hash=hash(List.of(in.college.trim(),in.name.trim(),in.members));
        if(existing("teaching_classes",in.id,p.school,hash)) return in.id;
        try {
            db.update("INSERT INTO teaching_classes(id,school_id,college,name,request_hash) VALUES(?,?,?,?,?)",in.id,p.school,in.college.trim(),in.name.trim(),hash);
            for(Member m:in.members) db.update("INSERT INTO teaching_students(id,school_id,class_id,student_number,name,user_id) VALUES(?,?,?,?,?,?)",
                    UUID.randomUUID().toString(),p.school,in.id,m.studentNumber.trim(),m.name.trim(),m.userId);
        } catch(DuplicateKeyException e) { throw error(409,"班级、学号或账号已绑定；未覆盖旧名单"); }
        return in.id;
    }
    @Transactional public String createCourse(long actor,CourseInput in) {
        return createCourse(actor,in,null,null);
    }
    @Transactional public String createRosterCourse(long actor,RosterCourseInput in) {
        admin(actor);
        if(!rostersEnabled) throw error(503,"独立教学名单尚未启用；未创建课程");
        if(in==null) throw error(400,"课程名单缺失");
        text(in.groupName,100,true);
        return createCourse(actor,in.course,in.groupName.trim(),in.studentIds);
    }
    private String createCourse(long actor,CourseInput in,String groupName,List<String> studentIds) {
        Principal p=admin(actor);
        if(lessonChangesEnabled)scheduleWriteLock(p.school);
        validateCourseInput(p,in);
        List<String> roster=null;
        if(groupName!=null) {
            if(studentIds==null || studentIds.isEmpty() || studentIds.size()>MAX_COURSE_MEMBERS) throw error(400,"课程名单限1至2000人，请分批核对来源；点名按页提交");
            for(String id:studentIds) uuid(id);
            roster=studentIds.stream().distinct().sorted().toList();
            if(roster.size()!=studentIds.size()) throw error(400,"课程名单重复，不会重复创建学生身份");
            var args=new ArrayList<Object>(List.of(p.school));args.addAll(roster);
            if(db.queryForObject("SELECT COUNT(*) FROM teaching_students WHERE school_id=? AND id IN ("+String.join(",",Collections.nCopies(roster.size(),"?"))+")",Integer.class,args.toArray())!=roster.size()) throw error(400,"课程名单包含不可用或外校学生");
        }
        var hashParts=new ArrayList<Object>(List.of(in.classId,in.teacherId,in.name.trim(),in.semester.trim(),in.firstMonday,in.weekday,in.startTime,in.endTime,in.weeks.stream().distinct().sorted().toList(),in.room.trim()));
        if(groupName!=null) {hashParts.add(groupName);hashParts.add(roster);}
        String hash=hash(hashParts);
        if(existing("teaching_courses",in.id,p.school,hash)) return in.id;
        if(lifecycleEnabled) {
            var args=new ArrayList<Object>(List.of(p.school));String filter;
            if(roster==null){filter="class_id=?";args.add(in.classId);}else{filter="id IN ("+String.join(",",Collections.nCopies(roster.size(),"?"))+")";args.addAll(roster);}
            var locked=db.queryForList("SELECT id FROM teaching_students WHERE school_id=? AND "+filter+" ORDER BY id FOR UPDATE",String.class,args.toArray());
            if(roster!=null)for(String id:locked)if(db.queryForObject("SELECT COUNT(*) FROM teaching_student_lifecycle WHERE student_id=? AND status='LEFT'",Integer.class,id)>0)throw error(400,"名单含已离校学生，需先核对学籍，未恢复选课");
        }
        // Stable ID is the retry key; exact duplicate offerings with a fresh ID are rejected too.
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_courses WHERE school_id=? AND class_id=? AND request_hash=?",Integer.class,p.school,in.classId,hash)>0)
            throw error(409,"这项课程已存在");
        db.update("INSERT INTO teaching_courses(id,school_id,class_id,teacher_id,name,semester,first_monday,weekday,start_time,end_time,weeks_json,room,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                in.id,p.school,in.classId,in.teacherId,in.name.trim(),in.semester.trim(),in.firstMonday,in.weekday,in.startTime,in.endTime,
                json.writeValueAsString(in.weeks.stream().distinct().sorted().toList()),in.room.trim(),hash);
        if(rostersEnabled) {
            String label=groupName==null?db.queryForObject("SELECT name FROM teaching_classes WHERE id=?",String.class,in.classId):groupName;
            db.update("INSERT INTO teaching_course_rosters(course_id,school_id,group_name) VALUES(?,?,?)",in.id,p.school,label);
            if(lifecycleEnabled)db.update("INSERT INTO teaching_course_enrollment_modes(course_id,school_id,mode) VALUES(?,?,?)",in.id,p.school,groupName==null?"ADMIN_CLASS":"EXPLICIT");
            if(roster==null) db.update("INSERT INTO teaching_course_members(course_id,student_id,school_id) SELECT ?,id,school_id FROM teaching_students s WHERE school_id=? AND class_id=?"+(lifecycleEnabled?" AND NOT EXISTS(SELECT 1 FROM teaching_student_lifecycle x WHERE x.student_id=s.id AND x.status='LEFT')":""),in.id,p.school,in.classId);
            else for(int offset=0;offset<roster.size();offset+=100) {
                var batch=roster.subList(offset,Math.min(offset+100,roster.size()));var args=new ArrayList<Object>();
                for(String id:batch) Collections.addAll(args,in.id,id,p.school);
                db.update("INSERT INTO teaching_course_members(course_id,student_id,school_id) VALUES "+String.join(",",Collections.nCopies(batch.size(),"(?,?,?)")),args.toArray());
            }
            db.update("INSERT INTO teaching_enrollment_audit(id,school_id,course_id,student_id,actor_id,action,reason,revision,recorded_at) SELECT UUID(),school_id,course_id,student_id,?,'CREATE','管理员核对课程名单',0,? FROM teaching_course_members WHERE course_id=? AND school_id=?",actor,Timestamp.from(clock.instant()),in.id,p.school);
        }
        materializeCourse(in,p.school);
        return in.id;
    }
    private boolean existing(String table,String id,long school,String hash) {
        // table is selected by the two internal callers, never request input.
        var rows=db.queryForList("SELECT school_id,request_hash FROM "+table+" WHERE id=?",id);
        if(rows.isEmpty()) return false;
        if(((Number)rows.get(0).get("school_id")).longValue()!=school || !hash.equals(rows.get(0).get("request_hash"))) throw error(409,"此编号已有不同资料，未覆盖");
        return true;
    }
    private void materializeCourse(CourseInput in,long school) {
        for(int week:in.weeks.stream().distinct().sorted().toList()) {
            LocalDate date=in.firstMonday.plusWeeks(week-1).plusDays(in.weekday-1);
            Instant start=date.atTime(LocalTime.parse(in.startTime)).atZone(ZONE).toInstant();
            Instant end=date.atTime(LocalTime.parse(in.endTime)).atZone(ZONE).toInstant();
            String id=UUID.nameUUIDFromBytes((in.id+":"+date).getBytes(StandardCharsets.UTF_8)).toString();
            db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,?,?,?,?,?)",id,school,in.id,in.classId,Timestamp.from(start),Timestamp.from(end));
            if(!rostersEnabled) db.update("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name) SELECT ?,id,student_number,name FROM teaching_students WHERE class_id=? AND school_id=?",id,in.classId,school);
            else {
                db.update("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name) SELECT ?,s.id,s.student_number,s.name FROM teaching_students s JOIN teaching_course_members m ON m.student_id=s.id AND m.school_id=s.school_id WHERE m.course_id=? AND m.school_id=? AND m.active=TRUE",id,in.id,school);
                db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,source) SELECT a.lesson_id,a.student_id,s.school_id,s.class_id,b.college,'CAPTURED_AT_CREATION' FROM teaching_attendance a JOIN teaching_students s ON s.id=a.student_id JOIN teaching_classes b ON b.id=s.class_id WHERE a.lesson_id=? AND s.school_id=?",id,school);
            }
        }
    }
    @Transactional public void grant(long actor,GrantInput in,boolean revoke) {
        Principal p=admin(actor);
        if(responsibilityEnabled)throw error(409,"受控负责范围已启用，请使用带版本、原因和回执的新入口核对；旧入口未执行变更");
        if(in==null || in.viewRole==null || !Set.of("COUNSELOR","SECRETARY").contains(in.viewRole)) throw error(400,"负责范围角色无效");
        sameSchoolAccount(in.userId,p.school); text(in.scopeKey,100,true);
        if(!revoke && identities!=null) identities.requireApproved(in.userId,in.viewRole);
        if("COUNSELOR".equals(in.viewRole)) { uuid(in.scopeKey); classInSchool(in.scopeKey,p.school); }
        else if(db.queryForObject("SELECT COUNT(*) FROM teaching_classes WHERE school_id=? AND college=?",Integer.class,p.school,in.scopeKey)==0) throw error(400,"学院尚未配置");
        if(revoke) db.update("DELETE FROM teaching_grants WHERE school_id=? AND user_id=? AND view_role=? AND scope_key=?",p.school,in.userId,in.viewRole,in.scopeKey);
        else if(db.queryForObject("SELECT COUNT(*) FROM teaching_grants WHERE school_id=? AND user_id=? AND view_role=? AND scope_key=?",Integer.class,p.school,in.userId,in.viewRole,in.scopeKey)==0)
            db.update("INSERT INTO teaching_grants VALUES(?,?,?,?)",p.school,in.userId,in.viewRole,in.scopeKey);
    }
    private void classInSchool(String id,long school) {
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_classes WHERE id=? AND school_id=?",Integer.class,id,school)!=1) throw error(404,"班级不存在或不在授权范围");
    }
    public List<ClassRow> classes(long actor) {
        Principal p=admin(actor);
        var result=db.query("SELECT b.id,b.college,b.name,COUNT(s.id) AS members,COUNT(s.user_id) AS linked FROM teaching_classes b LEFT JOIN teaching_students s ON s.class_id=b.id WHERE b.school_id=? GROUP BY b.id,b.college,b.name ORDER BY b.college,b.name LIMIT 501",(r,n)->new ClassRow(r.getString("id"),r.getString("college"),r.getString("name"),r.getInt("members"),r.getInt("linked")),p.school);
        if(result.size()>500) throw error(400,"班级过多，需要分页配置");
        return result;
    }
    /** Bounded configuration lookup. Selected scope is checked independently of the filtered page. */
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public ConfigPage configurationPage(long actor,String kind,int page,int size,String search,String selected) {
        Principal p=admin(actor);pageBounds(page,size);
        if(!Set.of("CLASS","COLLEGE","COURSE","TEACHER").contains(kind==null?"":kind)) throw error(400,"配置范围类型无效");
        String q=search==null?"":search.trim();text(q,100,false);
        String chosen=selected==null?"":selected.trim();text(chosen,100,false);
        if("COURSE".equals(kind)) return courseConfigurationPage(p,page,size,q,chosen);
        if("TEACHER".equals(kind))return teacherConfigurationPage(p,page,size,q,chosen);
        boolean classes="CLASS".equals(kind);
        if(classes && !chosen.isEmpty()) uuid(chosen);
        String like="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        List<Object> args=new ArrayList<>(List.of(p.school));
        String where=" WHERE school_id=?";
        if(!q.isEmpty()) {
            where+=classes?" AND (name LIKE ? ESCAPE '!' OR college LIKE ? ESCAPE '!')":" AND college LIKE ? ESCAPE '!'";
            args.add(like);if(classes) args.add(like);
        }
        int total=db.queryForObject("SELECT COUNT("+(classes?"*":"DISTINCT college")+") FROM teaching_classes"+where,Integer.class,args.toArray());
        int pages=(total+size-1)/size;
        if(page>0 && page>=pages) throw error(400,"这一页已不存在，请返回第一页重新读取");
        args.add(size);args.add(page*size);
        String columns=classes?"id,name,college":"DISTINCT college";
        var rows=db.query("SELECT "+columns+" FROM teaching_classes"+where+(classes?" ORDER BY college,name,id":" ORDER BY college")+" LIMIT ? OFFSET ?",
                (r,n)->classes?new ConfigOption(r.getString("id"),r.getString("name"),r.getString("college")):new ConfigOption(r.getString("college"),r.getString("college"),""),args.toArray());
        ConfigOption option=null;
        if(!chosen.isEmpty()) {
            var found=db.query("SELECT "+columns+" FROM teaching_classes WHERE school_id=? AND "+(classes?"id":"college")+"=?",
                    (r,n)->classes?new ConfigOption(r.getString("id"),r.getString("name"),r.getString("college")):new ConfigOption(r.getString("college"),r.getString("college"),""),p.school,chosen);
            if(!found.isEmpty()) option=found.get(0);
        }
        return new ConfigPage(rows,option,page,size,total,pages);
    }
    private ConfigPage teacherConfigurationPage(Principal p,int page,int size,String search,String selected){
        if(!selected.isEmpty()&&!selected.matches("[1-9][0-9]{0,17}"))throw error(400,"请选择已核实教师账号，不按姓名绑定");
        String base=" FROM users u WHERE u.school_id=? AND u.status=1"+(identities!=null&&identities.enabled()?" AND EXISTS(SELECT 1 FROM teaching_identities i WHERE i.school_id=u.school_id AND i.user_id=u.id AND i.requested_role='TEACHER' AND i.status='APPROVED')":"");
        String where=base;var args=new ArrayList<Object>(List.of(p.school));
        if(!search.isEmpty()){String like="%"+search.replace("!","!!").replace("%","!%").replace("_","!_")+"%";where+=" AND (u.username LIKE ? ESCAPE '!' OR u.nickname LIKE ? ESCAPE '!' OR CAST(u.id AS CHAR)=?)";Collections.addAll(args,like,like,search);}
        int total=db.queryForObject("SELECT COUNT(*)"+where,Integer.class,args.toArray()),pages=(total+size-1)/size;if(page>0&&page>=pages)throw error(400,"教师页已变化，请重新读取第一页");
        var paged=new ArrayList<>(args);Collections.addAll(paged,size,page*size);
        var items=db.query("SELECT CAST(u.id AS CHAR),u.nickname,u.username"+where+" ORDER BY u.nickname,u.username,u.id LIMIT ? OFFSET ?",(r,n)->new ConfigOption(r.getString(1),r.getString(2),r.getString(3)),paged.toArray());
        ConfigOption choice=null;if(!selected.isEmpty()){var matches=db.query("SELECT CAST(u.id AS CHAR),u.nickname,u.username"+base+" AND u.id=?",(r,n)->new ConfigOption(r.getString(1),r.getString(2),r.getString(3)),p.school,Long.parseLong(selected));if(!matches.isEmpty())choice=matches.get(0);}
        return new ConfigPage(items,choice,page,size,total,pages);
    }
    private ConfigPage courseConfigurationPage(Principal p,int page,int size,String search,String selected) {
        if(!rostersEnabled) throw error(503,"独立教学名单尚未启用");
        if(!selected.isEmpty()) uuid(selected);
        var args=new ArrayList<Object>(List.of(p.school));String where=" WHERE c.school_id=?";
        if(!search.isEmpty()) {
            String like="%"+search.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            where+=" AND (c.name LIKE ? ESCAPE '!' OR c.semester LIKE ? ESCAPE '!')";args.add(like);args.add(like);
        }
        String from=" FROM teaching_courses c JOIN teaching_course_rosters r ON r.course_id=c.id AND r.school_id=c.school_id";
        int total=db.queryForObject("SELECT COUNT(*)"+from+where,Integer.class,args.toArray()),pages=(total+size-1)/size;
        if(page>0 && page>=pages) throw error(400,"这一页已不存在，请返回第一页重新读取");
        args.add(size);args.add(page*size);
        var rows=db.query("SELECT c.id,c.name,c.semester"+from+where+" ORDER BY c.semester,c.name,c.id LIMIT ? OFFSET ?",(r,n)->new ConfigOption(r.getString(1),r.getString(2),r.getString(3)),args.toArray());
        ConfigOption chosen=null;
        if(!selected.isEmpty()) {var found=db.query("SELECT c.id,c.name,c.semester"+from+" WHERE c.school_id=? AND c.id=?",(r,n)->new ConfigOption(r.getString(1),r.getString(2),r.getString(3)),p.school,selected);if(!found.isEmpty())chosen=found.get(0);}
        return new ConfigPage(rows,chosen,page,size,total,pages);
    }
    public List<MemberRow> members(long actor,String classId) {
        Principal p=admin(actor); uuid(classId); classInSchool(classId,p.school);
        return db.query("SELECT id,student_number,name,user_id FROM teaching_students WHERE school_id=? AND class_id=? ORDER BY student_number",(r,n)->new MemberRow(r.getString("id"),r.getString("student_number"),r.getString("name"),r.getObject("user_id",Long.class)),p.school,classId);
    }
    @Transactional public void bindMember(long actor,String id,AccountBinding in) {
        Principal p=admin(actor); uuid(id);
        if(in==null) throw error(400,"账号绑定资料缺失");
        if(in.userId!=null) sameSchoolAccount(in.userId,p.school);
        var rows=db.query("SELECT user_id FROM teaching_students WHERE id=? AND school_id=? FOR UPDATE",(r,n)->r.getObject(1,Long.class),id,p.school);
        if(rows.isEmpty()) throw error(404,"名单目标不存在或无权配置");
        if(!Objects.equals(rows.get(0),in.expectedUserId)) throw error(409,"账号绑定已在另一页面变化，请重新读取后核对");
        if(Objects.equals(rows.get(0),in.userId)) return;
        try { db.update("UPDATE teaching_students SET user_id=? WHERE id=? AND school_id=?",in.userId,id,p.school); }
        catch(DuplicateKeyException duplicate) { throw error(409,"此账号已绑定另一位学生，不会覆盖"); }
        db.update("INSERT INTO teaching_binding_audit(id,school_id,student_id,actor_id,old_user_id,new_user_id,recorded_at) VALUES(?,?,?,?,?,?,?)",UUID.randomUUID().toString(),p.school,id,actor,rows.get(0),in.userId,Timestamp.from(clock.instant()));
    }
    private String scope(Principal p,String view,List<Object> args) {
        if(view==null || !access(p.id).views.contains(view)) throw error(403,"没有此视图的教学授权");
        if(rostersEnabled && !"TEACHER".equals(view)) return "EXISTS(SELECT 1 FROM teaching_attendance a WHERE a.lesson_id=l.id AND "+attendanceScope(p,view,null,args)+")";
        args.add(p.id);
        return switch(view) {
            case "TEACHER" -> "c.teacher_id=?";
            case "STUDENT" -> "EXISTS(SELECT 1 FROM teaching_students s WHERE s.class_id=l.class_id AND s.school_id=l.school_id AND s.user_id=?)";
            case "COUNSELOR" -> "EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=l.school_id AND g.user_id=? AND g.view_role='COUNSELOR' AND g.scope_key=l.class_id)";
            case "SECRETARY" -> "EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=l.school_id AND g.user_id=? AND g.view_role='SECRETARY' AND g.scope_key=b.college)";
            default -> throw error(403,"教学授权无效");
        };
    }
    private static final String LESSON_FROM="FROM teaching_lessons l JOIN teaching_courses c ON c.id=l.course_id JOIN teaching_classes b ON b.id=l.class_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=l.school_id ";
    private static final String LESSON_SQL="SELECT l.*,c.name AS course_name,c.teacher_id,c.room,b.name AS class_name,b.college,u.status AS teacher_status,COALESCE(NULLIF(u.nickname,''),u.username,'教师账号未绑定') AS teacher_name "+LESSON_FROM;
    private String lessonSql() {
        if(!rostersEnabled) return LESSON_SQL;
        String college="CASE WHEN (SELECT COUNT(DISTINCT rs.college) FROM teaching_attendance_scopes rs WHERE rs.lesson_id=l.id AND rs.school_id=l.school_id AND rs.withdrawn=FALSE)>1 THEN '跨学院教学' ELSE COALESCE((SELECT MAX(rs.college) FROM teaching_attendance_scopes rs WHERE rs.lesson_id=l.id AND rs.school_id=l.school_id AND rs.withdrawn=FALSE),b.college) END AS college";
        return LESSON_SQL.replace("b.name AS class_name","COALESCE((SELECT r.group_name FROM teaching_course_rosters r WHERE r.course_id=c.id AND r.school_id=l.school_id),b.name) AS class_name").replace("b.college,u.status",college+",u.status");
    }
    /** Attendance authorization is per member, never the course's administrative anchor class. */
    private String attendanceScope(Principal p,String view,String classId,List<Object> args) {
        if(!rostersEnabled) {
            if(!"STUDENT".equals(view)) return "1=1";
            args.add(p.id);return "EXISTS(SELECT 1 FROM teaching_students s WHERE s.id=a.student_id AND s.user_id=?)";
        }
        return "EXISTS(SELECT 1 FROM teaching_attendance_scopes r WHERE r.lesson_id=a.lesson_id AND r.student_id=a.student_id AND "+rosterMemberScope(p,view,classId,"r",args)+")";
    }
    /** alias is a fixed internal SQL identifier, never request input. */
    private String rosterMemberScope(Principal p,String view,String classId,String alias,List<Object> args) {
        args.add(p.school);
        String where=alias+".school_id=? AND "+alias+".withdrawn=FALSE";
        switch(view) {
            case "STUDENT" -> {where+=" AND EXISTS(SELECT 1 FROM teaching_students s WHERE s.id="+alias+".student_id AND s.school_id="+alias+".school_id AND s.user_id=?)";args.add(p.id);}
            case "COUNSELOR" -> {where+=" AND EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id="+alias+".school_id AND g.user_id=? AND g.view_role='COUNSELOR' AND g.scope_key="+alias+".admin_class_id)";args.add(p.id);}
            case "SECRETARY" -> {where+=" AND EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id="+alias+".school_id AND g.user_id=? AND g.view_role='SECRETARY' AND g.scope_key="+alias+".college)";args.add(p.id);}
            case "TEACHER" -> { }
            default -> throw error(403,"教学视图无效");
        }
        if(classId!=null && !classId.isBlank()) {where+=" AND "+alias+".admin_class_id=?";args.add(classId);}
        return where;
    }
    private String lessonClassFilter(Principal p,String view,String classId,List<Object> args) {
        if(!rostersEnabled) {args.add(classId);return "l.class_id=?";}
        return "EXISTS(SELECT 1 FROM teaching_attendance a WHERE a.lesson_id=l.id AND "+attendanceScope(p,view,classId,args)+")";
    }
    private BoundLesson bound(java.sql.ResultSet r) throws java.sql.SQLException {
        return new BoundLesson(new Lesson(r.getString("id"),r.getString("course_name"),r.getString("class_name"),r.getString("college"),r.getString("teacher_name"),r.getString("room"),r.getTimestamp("starts_at").toInstant(),r.getTimestamp("ends_at").toInstant(),r.getInt("revision"),r.getBoolean("finalized"),r.getBoolean("cancelled"),null),r.getLong("school_id"),r.getString("class_id"),r.getLong("teacher_id"),r.getString("room"),r.getInt("teacher_status")==1);
    }
    private BoundLesson authorized(Principal p,String view,String id,boolean lock) {
        uuid(id); List<Object> args=new ArrayList<>(List.of(p.school,id)); String clause=scope(p,view,args);
        var rows=db.query(lessonSql()+"WHERE l.school_id=? AND l.id=? AND "+clause+(lock?" FOR UPDATE":""),(r,n)->bound(r),args.toArray());
        if(rows.isEmpty()) throw error(404,"课程不存在或不在授权范围");
        requireRosterBaseline(p,List.of(id));
        return rows.get(0);
    }
    private void requireRosterBaseline(Principal p,List<String> ids) {
        if(!rostersEnabled || ids.isEmpty()) return;
        var args=new ArrayList<Object>(ids);args.add(p.school);
        int missing=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance a LEFT JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id WHERE a.lesson_id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+") AND (r.lesson_id IS NULL OR r.school_id<>? OR a.status IS NULL OR a.status NOT IN ("+statusSql()+"))",Integer.class,args.toArray());
        if(missing>0) throw error(503,"教学名单归属基线不完整，请管理员核对；未返回部分名单");
    }
    private static String statusSql(){return STATUSES.stream().sorted().map(s->"'"+s+"'").collect(java.util.stream.Collectors.joining(","));}
    /** Readiness covers the entire selected range, not only the returned page. */
    private void requireRangeBaseline(Principal p,String view,LocalDate from,LocalDate to,String where,List<Object> args){
        if(!rostersEnabled)return;
        String checks="EXISTS(SELECT 1 FROM teaching_attendance chk LEFT JOIN teaching_attendance_scopes base ON base.lesson_id=chk.lesson_id AND base.student_id=chk.student_id WHERE chk.lesson_id=l.id AND (base.lesson_id IS NULL OR base.school_id<>l.school_id OR chk.status IS NULL OR chk.status NOT IN ("+statusSql()+"))";
        if("STUDENT".equals(view))checks+=" AND EXISTS(SELECT 1 FROM teaching_students owner_student WHERE owner_student.id=chk.student_id AND owner_student.school_id=l.school_id AND owner_student.user_id="+p.id+")";
        checks+=")";
        var parameters=new ArrayList<>(args);String scope=where;
        if("STUDENT".equals(view)){
            // Raw owner identity is used only for a fail-closed integrity check, never to grant access.
            scope="WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<?";
            parameters=new ArrayList<>(List.of(p.school,Timestamp.from(from.atStartOfDay(ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant())));
        }
        if(!db.queryForList("SELECT l.id "+LESSON_FROM+scope+" AND "+checks+" LIMIT 1",String.class,parameters.toArray()).isEmpty())throw error(503,"查询范围存在缺失归属或异常考勤状态，请管理员核对；未返回部分统计");
    }
    private Counts checkedCounts(Map<String,Integer> values){
        if(values.keySet().stream().anyMatch(s->s==null || !STATUSES.contains(s)))throw error(503,"存在未识别考勤状态，未忽略异常记录或返回部分统计");
        return new Counts(values.getOrDefault("UNKNOWN",0),values.getOrDefault("ON_TIME",0),values.getOrDefault("LATE",0),values.getOrDefault("ABSENT",0),values.getOrDefault("EXCUSED",0),values.getOrDefault("EARLY_LEAVE",0));
    }
    private Counts counts(String lessonId,Principal p,String view) {
        var args=new ArrayList<Object>(List.of(lessonId));String rowScope=attendanceScope(p,view,null,args);
        var rows=db.queryForList("SELECT a.status,COUNT(*) AS count FROM teaching_attendance a WHERE a.lesson_id=? AND "+rowScope+" GROUP BY a.status",args.toArray());
        Map<String,Integer> values=new HashMap<>(); for(var row:rows) values.put((String)row.get("status"),((Number)row.get("count")).intValue());
        return checkedCounts(values);
    }
    private Lesson enriched(BoundLesson b,Principal p,String view) {
        return enriched(b,counts(b.lesson.id,p,view));
    }
    private Lesson enriched(BoundLesson b,Counts counts) {
        Lesson l=b.lesson; return new Lesson(l.id,l.course,l.className,l.college,l.teacher,l.room,l.startsAt,l.endsAt,l.revision,l.finalized,l.cancelled,counts);
    }
    /** One aggregation for a service-authorized list, not one query per displayed course. */
    private Map<String,Counts> countBatch(List<BoundLesson> lessons,Principal p,String view,String classId) {
        if(lessons.isEmpty()) return Map.of();
        requireRosterBaseline(p,lessons.stream().map(b->b.lesson.id).toList());
        List<Object> args=new ArrayList<>(lessons.stream().map(b->b.lesson.id).toList());
        String sql="SELECT a.lesson_id,a.status,COUNT(*) AS count FROM teaching_attendance a WHERE a.lesson_id IN ("+String.join(",",Collections.nCopies(lessons.size(),"?"))+") AND "+attendanceScope(p,view,classId,args)+" ";
        sql+="GROUP BY a.lesson_id,a.status";
        Map<String,Map<String,Integer>> totals=new HashMap<>();
        db.query(sql,r->{totals.computeIfAbsent(r.getString("lesson_id"),key->new HashMap<>()).put(r.getString("status"),r.getInt("count"));},args.toArray());
        Map<String,Counts> result=new HashMap<>();
        for(BoundLesson b:lessons)result.put(b.lesson.id,checkedCounts(totals.getOrDefault(b.lesson.id,Map.of())));
        return result;
    }
    public List<Lesson> lessons(long user,String view,LocalDate from,LocalDate to) {
        return lessons(user,view,from,to,null);
    }
    private String classScope(Principal p,String view) {
        if(view==null || !access(p.id).views.contains(view)) throw error(403,"没有此视图的教学授权");
        if(rostersEnabled && "TEACHER".equals(view)) return "EXISTS(SELECT 1 FROM teaching_courses c WHERE c.school_id=b.school_id AND c.teacher_id=? AND (c.class_id=b.id OR EXISTS(SELECT 1 FROM teaching_lessons l JOIN teaching_attendance_scopes r ON r.lesson_id=l.id WHERE l.course_id=c.id AND r.school_id=b.school_id AND r.admin_class_id=b.id AND r.withdrawn=FALSE)))";
        if(rostersEnabled && "STUDENT".equals(view)) return "EXISTS(SELECT 1 FROM teaching_attendance_scopes r JOIN teaching_students s ON s.id=r.student_id AND s.school_id=r.school_id WHERE r.admin_class_id=b.id AND r.school_id=b.school_id AND r.withdrawn=FALSE AND s.user_id=?)";
        return switch(view) {
            case "STUDENT" -> "EXISTS(SELECT 1 FROM teaching_students s WHERE s.class_id=b.id AND s.school_id=b.school_id AND s.user_id=?)";
            case "TEACHER" -> "EXISTS(SELECT 1 FROM teaching_courses c WHERE c.class_id=b.id AND c.school_id=b.school_id AND c.teacher_id=?)";
            case "COUNSELOR" -> "EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=b.school_id AND g.user_id=? AND g.view_role='COUNSELOR' AND g.scope_key=b.id)";
            case "SECRETARY" -> "EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=b.school_id AND g.user_id=? AND g.view_role='SECRETARY' AND g.scope_key=b.college)";
            default -> throw error(403,"教学视图无效");
        };
    }
    public List<ClassOption> classesForView(long user,String view) {
        Principal p=principal(user); String clause=classScope(p,view);
        var result=db.query("SELECT b.id,b.name,b.college FROM teaching_classes b WHERE b.school_id=? AND "+clause+" ORDER BY b.college,b.name LIMIT 501",(r,n)->new ClassOption(r.getString(1),r.getString(2),r.getString(3)),p.school,user);
        if(result.size()>500) throw error(400,"负责班级过多，请分批配置");
        return result;
    }
    private static void pageBounds(int page,int size) {
        if(page<0 || page>10000 || size<1 || size>100) throw error(400,"页码无效，每页限1至100条");
    }
    public ClassPage classPage(long user,String view,int page,int size,String search) {
        pageBounds(page,size); Principal p=principal(user); String clause=classScope(p,view);
        String q=search==null?"":search.trim();text(q,100,false);
        List<Object> args=new ArrayList<>(List.of(p.school,user));
        String where=" WHERE b.school_id=? AND "+clause;
        if(!q.isEmpty()) {
            String like="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            where+=" AND (b.name LIKE ? ESCAPE '!' OR b.college LIKE ? ESCAPE '!')";args.add(like);args.add(like);
        }
        int total=db.queryForObject("SELECT COUNT(*) FROM teaching_classes b"+where,Integer.class,args.toArray());
        int pages=(total+size-1)/size;
        if(page>0 && page>=pages) throw error(400,"这一页已不存在，请返回第一页重新读取");
        args.add(size);args.add(page*size);
        var rows=db.query("SELECT b.id,b.name,b.college FROM teaching_classes b"+where+" ORDER BY b.college,b.name,b.id LIMIT ? OFFSET ?",(r,n)->new ClassOption(r.getString(1),r.getString(2),r.getString(3)),args.toArray());
        return new ClassPage(rows,page,size,total,pages);
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ,timeout=12)
    public ConfigPage governanceClasses(long user,String view,int page,int size,String search,String selected) {
        if("ADMIN".equals(view))return configurationPage(user,"CLASS",page,size,search,selected);
        ClassPage result=classPage(user,view,page,size,search);ConfigOption chosen=null;
        if(selected!=null && !selected.isBlank()) {
            Principal p=principal(user);authorizedClass(p,view,selected);
            chosen=db.queryForObject("SELECT id,name,college FROM teaching_classes WHERE id=? AND school_id=?",(r,n)->new ConfigOption(r.getString(1),r.getString(2),r.getString(3)),selected,p.school);
        }
        return new ConfigPage(result.items().stream().map(c->new ConfigOption(c.id(),c.name(),c.college())).toList(),chosen,page,size,result.total(),result.totalPages());
    }
    private void authorizedClass(Principal p,String view,String classId) {
        uuid(classId);String clause=classScope(p,view);
        if(db.queryForObject("SELECT COUNT(*) FROM teaching_classes b WHERE b.school_id=? AND "+clause+" AND b.id=?",Integer.class,p.school,p.id,classId)!=1)
            throw error(404,"班级不在负责范围");
    }
    public List<Lesson> lessons(long user,String view,LocalDate from,LocalDate to,String classId) {
        Principal p=principal(user);
        if(from==null || to==null || to.isBefore(from) || to.isAfter(from.plusDays(30))) throw error(400,"每次查询限31天");
        List<Object> args=new ArrayList<>(List.of(p.school,Timestamp.from(from.atStartOfDay(ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant())));
        String clause=scope(p,view,args);
        if(classId!=null && !classId.isBlank()) {
            authorizedClass(p,view,classId);
            clause+=" AND "+lessonClassFilter(p,view,classId,args);
        }
        var rows=db.query(lessonSql()+"WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<? AND "+clause+" ORDER BY l.starts_at,l.id LIMIT 501",(r,n)->bound(r),args.toArray());
        if(rows.size()>500) throw error(400,"记录过多，请缩小日期范围");
        var totals=countBatch(rows,p,view,classId);
        return rows.stream().map(b->enriched(b,totals.get(b.lesson.id))).toList();
    }
    /** Bounded detail page; aggregate queries always cover the entire authorized date/filter scope. */
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ,timeout=12)
    public LessonPage lessonPage(long user,String view,LocalDate from,LocalDate to,String classId,int page,int size) {
        return lessonPage(user,view,from,to,classId,page,size,"");
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ,timeout=12)
    public LessonPage lessonPage(long user,String view,LocalDate from,LocalDate to,String classId,int page,int size,String search) {
        pageBounds(page,size);Principal p=principal(user);
        String q=search==null?"":search.trim();text(q,100,false);
        if(from==null || to==null || to.isBefore(from) || to.isAfter(from.plusDays(30))) throw error(400,"每次查询限31天");
        List<Object> rangeArgs=List.of(p.school,Timestamp.from(from.atStartOfDay(ZONE).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant()));
        List<Object> args=new ArrayList<>(rangeArgs);
        String rangeWhere="WHERE l.school_id=? AND l.starts_at>=? AND l.starts_at<?";
        String where=rangeWhere+" AND "+scope(p,view,args);
        if(classId!=null && !classId.isBlank()) { authorizedClass(p,view,classId);where+=" AND "+lessonClassFilter(p,view,classId,args); }
        String searchWhere="";List<Object> searchArgs=new ArrayList<>();
        if(!q.isEmpty()) {
            String like="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            searchWhere=" AND (c.name LIKE ? ESCAPE '!' OR b.name LIKE ? ESCAPE '!' OR c.room LIKE ? ESCAPE '!' OR u.nickname LIKE ? ESCAPE '!' OR u.username LIKE ? ESCAPE '!'";
            for(int i=0;i<5;i++)searchArgs.add(like);
            if(rostersEnabled){searchWhere+=" OR EXISTS(SELECT 1 FROM teaching_course_rosters label WHERE label.course_id=c.id AND label.school_id=l.school_id AND label.group_name LIKE ? ESCAPE '!')";searchArgs.add(like);}
            searchWhere+=")";where+=searchWhere;args.addAll(searchArgs);
        }
        requireRangeBaseline(p,view,from,to,where,args);
        int total=db.queryForObject("SELECT COUNT(*) "+LESSON_FROM+where,Integer.class,args.toArray());
        int pages=(total+size-1)/size;
        if(page>0 && page>=pages) throw error(400,"这一页已不存在，请返回第一页重新读取");
        List<Object> pagedArgs=new ArrayList<>(args);pagedArgs.add(size);pagedArgs.add(page*size);
        var rows=db.query(lessonSql()+where+" ORDER BY l.starts_at,l.id LIMIT ? OFFSET ?",(r,n)->bound(r),pagedArgs.toArray());
        var totals=countBatch(rows,p,view,classId);
        List<Object> countArgs=new ArrayList<>(args);
        String attendanceFrom="FROM teaching_attendance a JOIN teaching_lessons l ON l.id=a.lesson_id JOIN teaching_courses c ON c.id=l.course_id JOIN teaching_classes b ON b.id=l.class_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=l.school_id ";
        String activeWhere=where;
        if(rostersEnabled){
            // These rows already ARE attendance members. Applying the lesson's
            // existential member scope again nests a roster scan per member and
            // can make native MySQL aggregates quadratic. Keep the same date,
            // search, teacher and member/class authorization exactly once.
            countArgs=new ArrayList<>(rangeArgs);activeWhere=rangeWhere;
            if("TEACHER".equals(view)){activeWhere+=" AND c.teacher_id=?";countArgs.add(p.id);}
            activeWhere+=searchWhere;countArgs.addAll(searchArgs);
        }
        activeWhere+=" AND l.cancelled=FALSE";
        activeWhere+=" AND "+attendanceScope(p,view,classId,countArgs);
        Map<String,Integer> counts=new HashMap<>();
        db.query("SELECT a.status,COUNT(*) AS total "+attendanceFrom+activeWhere+" GROUP BY a.status",r->{counts.put(r.getString(1),r.getInt(2));},countArgs.toArray());
        int people=db.queryForObject("SELECT COUNT(DISTINCT a.student_id) "+attendanceFrom+activeWhere+" AND a.status='ABSENT'",Integer.class,countArgs.toArray());
        int planned=db.queryForObject("SELECT COUNT(*) "+LESSON_FROM+where+" AND l.cancelled=FALSE",Integer.class,args.toArray());
        List<Object> todayArgs=new ArrayList<>(args);LocalDate today=LocalDate.now(clock.withZone(ZONE));
        todayArgs.add(Timestamp.from(today.atStartOfDay(ZONE).toInstant()));todayArgs.add(Timestamp.from(today.plusDays(1).atStartOfDay(ZONE).toInstant()));
        int todayCount=db.queryForObject("SELECT COUNT(*) "+LESSON_FROM+where+" AND l.cancelled=FALSE AND l.starts_at>=? AND l.starts_at<?",Integer.class,todayArgs.toArray());
        List<Object> overlapArgs=new ArrayList<>(args);
        String overlapFrom,overlapWhere;
        if(rostersEnabled && !"TEACHER".equals(view)){
            // Start from authorized members, then use their student index to
            // find other lessons. A correlated lesson EXISTS inside another
            // lesson EXISTS expands badly for many simultaneous classes.
            overlapArgs=new ArrayList<>(rangeArgs);overlapArgs.addAll(searchArgs);
            String member=rosterMemberScope(p,view,classId,"shared_member",overlapArgs);
            overlapFrom="FROM teaching_attendance_scopes shared_member JOIN teaching_attendance_scopes other_member ON other_member.student_id=shared_member.student_id AND other_member.school_id=shared_member.school_id AND other_member.withdrawn=FALSE JOIN teaching_lessons l ON l.id=shared_member.lesson_id AND l.school_id=shared_member.school_id JOIN teaching_lessons other ON other.id=other_member.lesson_id AND other.school_id=other_member.school_id ";
            // Metadata is needed only for text search. Joining three unrelated
            // label tables in the normal conflict count distorts MySQL's join
            // order and can bypass the indexed student-to-other-lesson lookup.
            if(!q.isEmpty())overlapFrom+="JOIN teaching_courses c ON c.id=l.course_id JOIN teaching_classes b ON b.id=l.class_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=l.school_id ";
            overlapWhere=rangeWhere+searchWhere+" AND l.cancelled=FALSE AND other.id<>l.id AND other.cancelled=FALSE AND other.starts_at<l.ends_at AND other.ends_at>l.starts_at AND "+member;
        }else{
            String shared="other.class_id=l.class_id";
            if("TEACHER".equals(view)){shared="EXISTS(SELECT 1 FROM teaching_courses other_course WHERE other_course.id=other.course_id AND other_course.school_id=l.school_id AND other_course.teacher_id=?)";overlapArgs.add(p.id);}
            overlapFrom=LESSON_FROM;overlapWhere=where+" AND l.cancelled=FALSE AND EXISTS(SELECT 1 FROM teaching_lessons other WHERE other.school_id=l.school_id AND "+shared+" AND other.id<>l.id AND other.cancelled=FALSE AND other.starts_at<l.ends_at AND other.ends_at>l.starts_at)";
        }
        // A bulk roster import can leave InnoDB cardinalities temporarily stale.
        // Keep the equality lookup on student before expanding lesson pairs.
        // H2 treats this static native-optimizer hint as a normal SQL comment.
        String overlapHint=rostersEnabled&&!"TEACHER".equals(view)?"/*+ JOIN_ORDER(shared_member,other_member,l,other) */ ":"";
        int conflicts=db.queryForObject("SELECT "+overlapHint+"COUNT(DISTINCT l.id) "+overlapFrom+overlapWhere,Integer.class,overlapArgs.toArray());
        Set<String> conflictIds=new HashSet<>();
        if(!rows.isEmpty()) {
            List<Object> conflictArgs=new ArrayList<>(overlapArgs);conflictArgs.addAll(rows.stream().map(r->r.lesson.id).toList());
            conflictIds.addAll(db.queryForList("SELECT "+overlapHint+"DISTINCT l.id "+overlapFrom+overlapWhere+" AND l.id IN ("+String.join(",",Collections.nCopies(rows.size(),"?"))+")",String.class,conflictArgs.toArray()));
        }
        return new LessonPage(rows.stream().map(b->enriched(b,totals.get(b.lesson.id))).toList(),page,size,total,pages,
                new ScopeSummary(checkedCounts(counts),people),planned,todayCount,conflicts,Set.copyOf(conflictIds));
    }
    /** Only callable with service-produced lessons; no controller accepts an arbitrary ID list. */
    public ScopeSummary summarize(long user,String view,List<Lesson> authorizedLessons) {
        return summarize(user,view,authorizedLessons,null);
    }
    public ScopeSummary summarize(long user,String view,List<Lesson> authorizedLessons,String classId) {
        Principal p=principal(user);
        int unknown=0,onTime=0,late=0,absent=0,excused=0,earlyLeave=0;
        List<String> ids=new ArrayList<>();
        for(Lesson l:authorizedLessons) if(!l.cancelled) { ids.add(l.id); unknown+=l.counts.unknown; onTime+=l.counts.onTime; late+=l.counts.late; absent+=l.counts.absent; excused+=l.counts.excused; earlyLeave+=l.counts.earlyLeave; }
        int people=0;
        if(!ids.isEmpty()) {
            List<Object> args=new ArrayList<>(ids);
            String query="SELECT COUNT(DISTINCT a.student_id) FROM teaching_attendance a WHERE a.status='ABSENT' AND a.lesson_id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+") AND "+attendanceScope(p,view,classId,args);
            people=db.queryForObject(query,Integer.class,args.toArray());
        }
        return new ScopeSummary(new Counts(unknown,onTime,late,absent,excused,earlyLeave),people);
    }
    /** Used for full legacy read models after their complete-or-error authorization read. */
    public Set<String> rosterConflicts(long user,String view,List<Lesson> authorizedLessons,String classId) {
        if(!rostersEnabled || authorizedLessons.isEmpty()) return Set.of();
        Principal p=principal(user);if(authorizedLessons.size()>500) throw error(400,"课程过多，请缩小范围");
        var args=new ArrayList<Object>(List.of(p.school));args.addAll(authorizedLessons.stream().map(Lesson::id).toList());
        String scope=attendanceScope(p,view,classId,args);
        return Set.copyOf(db.queryForList("SELECT DISTINCT l.id FROM teaching_lessons l WHERE l.school_id=? AND l.id IN ("+String.join(",",Collections.nCopies(authorizedLessons.size(),"?"))+") AND l.cancelled=FALSE AND EXISTS(SELECT 1 FROM teaching_attendance a JOIN teaching_attendance_scopes y ON y.student_id=a.student_id AND y.school_id=l.school_id JOIN teaching_lessons other ON other.id=y.lesson_id AND other.school_id=l.school_id WHERE a.lesson_id=l.id AND "+scope+" AND y.withdrawn=FALSE AND other.id<>l.id AND other.cancelled=FALSE AND other.starts_at<l.ends_at AND other.ends_at>l.starts_at)",String.class,args.toArray()));
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Detail detail(long user,String view,String id) {
        Principal p=principal(user); BoundLesson b=authorized(p,view,id,false);
        var args=new ArrayList<Object>(List.of(id));String filter=attendanceScope(p,view,null,args);
        var entries=db.query("SELECT a.* FROM teaching_attendance a WHERE a.lesson_id=? AND "+filter+" ORDER BY a.student_number,a.student_id LIMIT 301",(r,n)->new Entry(r.getString("student_id"),r.getString("student_number"),r.getString("student_name"),r.getString("status")),args.toArray());
        if(entries.size()>300)throw error(400,"大合班名单请使用分页入口；未截断名单");
        boolean canMark="TEACHER".equals(view) && !b.lesson.cancelled && !clock.instant().isBefore(b.lesson.startsAt.minusSeconds(300));
        return new Detail(enriched(b,p,view),entries,canMark,canMark && !clock.instant().isBefore(b.lesson.startsAt));
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public DetailPage detailPage(long user,String view,String id,int page,int size,String search) {
        pageBounds(page,size);Principal p=principal(user);BoundLesson b=authorized(p,view,id,false);String q=search==null?"":search.trim();text(q,100,false);
        var args=new ArrayList<Object>(List.of(id));String filter=attendanceScope(p,view,null,args);
        if(!q.isEmpty()){String like="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";filter+=" AND (a.student_name LIKE ? ESCAPE '!' OR a.student_number LIKE ? ESCAPE '!')";args.add(like);args.add(like);}
        int total=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance a WHERE a.lesson_id=? AND "+filter,Integer.class,args.toArray());int pages=(total+size-1)/size;
        if(page>0 && page>=pages)throw error(400,"名单页面已变化，请返回第一页重新读取");
        args.add(size);args.add(page*size);var rows=db.query("SELECT a.* FROM teaching_attendance a WHERE a.lesson_id=? AND "+filter+" ORDER BY a.student_number,a.student_id LIMIT ? OFFSET ?",(r,n)->new Entry(r.getString("student_id"),r.getString("student_number"),r.getString("student_name"),r.getString("status")),args.toArray());
        boolean canMark="TEACHER".equals(view)&&!b.lesson.cancelled&&!clock.instant().isBefore(b.lesson.startsAt.minusSeconds(300));
        return new DetailPage(new Detail(enriched(b,p,view),rows,canMark,canMark&&!clock.instant().isBefore(b.lesson.startsAt)),page,size,total,pages,q);
    }
    /** User-approved policy: direct teacher corrections with immutable old/new audit; retain one calendar year.
     * Expiry is preview-only until an operator archives/verifies a production cleanup. No read deletes history. */
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public AuditPage auditPage(long user,String view,String lessonId,int page,int size) {
        pageBounds(page,size);Principal p=principal(user);authorized(p,view,lessonId,false);
        var args=new ArrayList<Object>(List.of(p.school,lessonId));String rowScope=attendanceScope(p,view,null,args);
        String from=" FROM teaching_attendance_audit h JOIN teaching_attendance a ON a.lesson_id=h.lesson_id AND a.student_id=h.student_id LEFT JOIN users actor ON actor.id=h.actor_id AND actor.school_id=h.school_id ";
        String where=" WHERE h.school_id=? AND h.lesson_id=? AND "+rowScope;
        int total=db.queryForObject("SELECT COUNT(*)"+from+where,Integer.class,args.toArray());int pages=(total+size-1)/size;
        if(page>0 && page>=pages)throw error(400,"这一页记录已变化，请重新读取");
        var expiryArgs=new ArrayList<Object>(args);expiryArgs.add(Timestamp.from(clock.instant()));
        int expired=db.queryForObject("SELECT COUNT(*)"+from+where+" AND TIMESTAMPADD(YEAR,1,h.recorded_at)<=?",Integer.class,expiryArgs.toArray());
        args.add(size);args.add(page*size);
        var rows=db.query("SELECT h.*,a.student_number,a.student_name,COALESCE(actor.nickname,actor.username,'历史操作账号') AS actor_name"+from+where+" ORDER BY h.recorded_at DESC,h.id DESC LIMIT ? OFFSET ?",(r,n)->{
            Instant recorded=r.getTimestamp("recorded_at").toInstant(),expires=recorded.atZone(ZONE).plusYears(1).toInstant();
            return new AuditRow(r.getString("id"),r.getString("student_number"),r.getString("student_name"),r.getString("actor_name"),r.getString("old_status"),r.getString("new_status"),r.getString("reason"),recorded,expires,!expires.isAfter(clock.instant()));
        },args.toArray());
        return new AuditPage(lessonId,view,rows,page,size,total,pages,1,expired,false);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) public Detail mark(long user,String id,RollCall in) {
        detail(user,"TEACHER",id); // Legacy writes must fail before mutation if a full response cannot be returned.
        saveMarks(user,id,in);return detail(user,"TEACHER",id);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public DetailPage markPage(long user,String id,RollCall in,int page,int size,String search) {
        detailPage(user,"TEACHER",id,page,size,search);saveMarks(user,id,in);return detailPage(user,"TEACHER",id,page,size,search);
    }
    private void saveMarks(long user,String id,RollCall in) {
        Principal p=principal(user);authorized(p,"TEACHER",id,false);
        if(rostersEnabled)db.queryForObject("SELECT r.revision FROM teaching_course_rosters r JOIN teaching_lessons l ON l.course_id=r.course_id AND l.school_id=r.school_id WHERE l.id=? AND r.school_id=? FOR UPDATE",Integer.class,id,p.school);
        BoundLesson b=authorized(p,"TEACHER",id,true);
        if(in==null || in.marks==null || in.marks.size()>300 || in.revision!=b.lesson.revision) throw error(in!=null && in.revision!=b.lesson.revision?409:400,"点名版本已变化或格式无效；请重新读取，草稿不应自动重发");
        if(b.lesson.cancelled || clock.instant().isBefore(b.lesson.startsAt.minusSeconds(300))) throw error(409,"未到课前5分钟或此课已取消，不能点名");
        text(in.reason,300,false); Set<String> distinct=new HashSet<>();
        var rowArgs=new ArrayList<Object>(List.of(id));String rowScope=attendanceScope(p,"TEACHER",null,rowArgs);
        if(in.marks.stream().anyMatch(Objects::isNull))throw error(400,"名单行无效");
        var requested=in.marks.stream().map(Mark::studentId).toList();requested.forEach(TeachingService::uuid);
        String selected=requested.isEmpty()?"1=0":"a.student_id IN ("+String.join(",",Collections.nCopies(requested.size(),"?"))+")";rowArgs.addAll(requested);
        var old=db.queryForList("SELECT a.student_id,a.status FROM teaching_attendance a WHERE a.lesson_id=? AND "+rowScope+" AND "+selected,rowArgs.toArray()); Map<String,String> previous=new HashMap<>();
        for(var row:old) previous.put((String)row.get("student_id"),(String)row.get("status"));
        for(Mark m:in.marks) {
            if(m==null || m.status==null || !distinct.add(m.studentId) || !previous.containsKey(m.studentId) || !STATUSES.contains(m.status)) throw error(400,"名单目标重复、越界或考勤状态无效");
            String before=previous.get(m.studentId);
            if(!before.equals(m.status) && (!"UNKNOWN".equals(before) || b.lesson.finalized) && in.reason.isBlank()) throw error(400,"更正已记录状态需要原因");
            if("ABSENT".equals(m.status) && clock.instant().isBefore(b.lesson.startsAt)) throw error(400,"开课前不能记旷课");
            if("EARLY_LEAVE".equals(m.status) && clock.instant().isBefore(b.lesson.startsAt))throw error(400,"开课前不能记早退");
        }
        boolean changed=in.marks.stream().anyMatch(m->!m.status.equals(previous.get(m.studentId)));
        var remainingArgs=new ArrayList<Object>(List.of(id));String remainingScope=attendanceScope(p,"TEACHER",null,remainingArgs);
        int remaining=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance a WHERE a.lesson_id=? AND "+remainingScope+" AND a.status='UNKNOWN'",Integer.class,remainingArgs.toArray());
        for(Mark m:in.marks){if("UNKNOWN".equals(previous.get(m.studentId)))remaining--;if("UNKNOWN".equals(m.status))remaining++;}
        if(in.finish && remaining>0)throw error(400,"全班还有"+remaining+"名待点名，不能只按本页完成或自动当作旷课");
        boolean finalized=(b.lesson.finalized || in.finish) && remaining==0;
        changed|=finalized!=b.lesson.finalized;if(!changed)return;
        for(Mark m:in.marks) if(!m.status.equals(previous.get(m.studentId))) {
            db.update("UPDATE teaching_attendance SET status=? WHERE lesson_id=? AND student_id=?",m.status,id,m.studentId);
            db.update("INSERT INTO teaching_attendance_audit VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),p.school,id,m.studentId,user,previous.get(m.studentId),m.status,in.reason.trim(),Timestamp.from(clock.instant()));
        }
        if(db.update("UPDATE teaching_lessons SET revision=revision+1,finalized=? WHERE id=? AND revision=?",finalized,id,in.revision)!=1) throw error(409,"点名已在其他页面更新");
    }
    @Transactional public void cancel(long actor,String id,int revision) {
        Principal p=admin(actor); uuid(id);
        if(lessonChangesEnabled)throw error(409,"受控调停课已启用，请使用带原因、版本和预览的新入口；旧入口未取消课程");
        if(db.update("UPDATE teaching_lessons SET cancelled=TRUE,revision=revision+1 WHERE id=? AND school_id=? AND revision=? AND cancelled=FALSE",id,p.school,revision)!=1) throw error(409,"课程已变化或不在本校范围");
    }
    /** Shared by controlled lesson changes and course creation. Caller already holds a write transaction. */
    void scheduleWriteLock(long school){
        db.update("INSERT IGNORE INTO teaching_schedule_locks(school_id) VALUES(?)",school);
        db.queryForObject("SELECT school_id FROM teaching_schedule_locks WHERE school_id=? FOR UPDATE",Long.class,school);
    }
    /** Withdraw only future unrecorded rows; historical evidence is retained. */
    @Transactional(timeout=15,isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) public int withdrawMember(long actor,String courseId,String studentId,WithdrawInput in) {
        Principal p=admin(actor);uuid(courseId);uuid(studentId);
        if(!rostersEnabled) throw error(503,"独立教学名单尚未启用");
        if(in==null) throw error(400,"退课资料缺失");text(in.reason,300,true);
        var revisions=db.queryForList("SELECT revision FROM teaching_course_rosters WHERE course_id=? AND school_id=? FOR UPDATE",Integer.class,courseId,p.school);
        if(revisions.isEmpty()) throw error(404,"课程不在本校范围");
        if(revisions.get(0)!=in.revision) throw error(409,"课程名单已变化，请重新核对");
        var members=db.queryForList("SELECT active FROM teaching_course_members WHERE course_id=? AND student_id=? AND school_id=?",Boolean.class,courseId,studentId,p.school);
        if(members.isEmpty()) throw error(404,"学生不在该课程名单");
        if(!members.get(0)) return in.revision;
        var ids=db.queryForList("SELECT id FROM teaching_lessons WHERE course_id=? AND school_id=? AND starts_at>? ORDER BY starts_at,id LIMIT 31 FOR UPDATE",String.class,courseId,p.school,Timestamp.from(clock.instant()));
        if(ids.size()>30) throw error(400,"未来课程过多，需要分批核对");
        if(!ids.isEmpty()) {
            String placeholders=String.join(",",Collections.nCopies(ids.size(),"?"));var args=new ArrayList<Object>(List.of(studentId));args.addAll(ids);
            if(db.queryForObject("SELECT COUNT(*) FROM teaching_attendance WHERE student_id=? AND lesson_id IN ("+placeholders+") AND status<>'UNKNOWN'",Integer.class,args.toArray())>0) throw error(409,"未来课程已有点名记录，需要先核对，不自动退课覆盖");
            db.update("UPDATE teaching_attendance_scopes SET withdrawn=TRUE WHERE student_id=? AND lesson_id IN ("+placeholders+")",args.toArray());
            db.update("UPDATE teaching_lessons SET revision=revision+1,finalized=FALSE WHERE id IN ("+placeholders+")",ids.toArray());
        }
        db.update("UPDATE teaching_course_members SET active=FALSE WHERE course_id=? AND student_id=? AND school_id=?",courseId,studentId,p.school);
        int revision=in.revision+1;
        if(db.update("UPDATE teaching_course_rosters SET revision=? WHERE course_id=? AND school_id=? AND revision=?",revision,courseId,p.school,in.revision)!=1) throw error(409,"课程名单已变化");
        db.update("INSERT INTO teaching_enrollment_audit VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),p.school,courseId,studentId,actor,"WITHDRAW",in.reason.trim(),revision,Timestamp.from(clock.instant()));
        return revision;
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CourseRoster courseRoster(long actor,String courseId) {
        Principal p=admin(actor);uuid(courseId);
        if(!rostersEnabled) throw error(503,"独立教学名单尚未启用");
        var h=courseRosterHeader(p,courseId);
        var members=db.query("SELECT s.id,s.student_number,s.name,s.class_id,b.college,m.active FROM teaching_course_members m JOIN teaching_students s ON s.id=m.student_id AND s.school_id=m.school_id JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=s.school_id WHERE m.course_id=? AND m.school_id=? ORDER BY s.student_number,s.id LIMIT 301",(r,n)->new Enrollment(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getBoolean(6)),courseId,p.school);
        if(members.size()>300) throw error(400,"课程名单超过300人，需要分页核对");
        return new CourseRoster(h.courseId,h.groupName,h.revision,members,h.target);
    }
    private CourseRoster courseRosterHeader(Principal p,String courseId) {
        var headers=db.query("SELECT r.group_name,r.revision,c.name,c.semester,c.weekday,c.start_time,c.end_time,c.room,COALESCE(NULLIF(u.nickname,''),u.username,'任课教师未绑定') AS teacher FROM teaching_course_rosters r JOIN teaching_courses c ON c.id=r.course_id AND c.school_id=r.school_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=c.school_id WHERE r.course_id=? AND r.school_id=?",(r,n)->new CourseRoster(courseId,r.getString("group_name"),r.getInt("revision"),List.of(),new CourseTarget(r.getString("name"),r.getString("semester"),r.getString("teacher"),r.getInt("weekday"),r.getString("start_time"),r.getString("end_time"),r.getString("room"))),courseId,p.school);
        if(headers.isEmpty()) throw error(404,"课程不在本校范围");
        return headers.get(0);
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CourseRosterPage courseRosterPage(long actor,String courseId,int page,int size,String search,boolean activeOnly) {
        Principal p=admin(actor);uuid(courseId);pageBounds(page,size);if(!rostersEnabled)throw error(503,"独立教学名单尚未启用");
        var h=courseRosterHeader(p,courseId);String q=search==null?"":search.trim();text(q,100,false);
        String from=" FROM teaching_course_members m JOIN teaching_students s ON s.id=m.student_id AND s.school_id=m.school_id JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=s.school_id WHERE m.course_id=? AND m.school_id=?";
        int active=db.queryForObject("SELECT COUNT(*)"+from+" AND m.active=TRUE",Integer.class,courseId,p.school);var args=new ArrayList<Object>(List.of(courseId,p.school));
        String filter=activeOnly?" AND m.active=TRUE":"";if(!q.isEmpty()){String like="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";filter+=" AND (s.name LIKE ? ESCAPE '!' OR s.student_number LIKE ? ESCAPE '!')";args.add(like);args.add(like);}
        int total=db.queryForObject("SELECT COUNT(*)"+from+filter,Integer.class,args.toArray()),pages=(total+size-1)/size;if(page>0&&page>=pages)throw error(400,"名单页面已变化，请返回第一页");
        args.add(size);args.add(page*size);var members=db.query("SELECT s.id,s.student_number,s.name,s.class_id,b.college,m.active"+from+filter+" ORDER BY s.student_number,s.id LIMIT ? OFFSET ?",(r,n)->new Enrollment(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getBoolean(6)),args.toArray());
        return new CourseRosterPage(new CourseRoster(h.courseId,h.groupName,h.revision,members,h.target),page,size,total,pages,active,q,activeOnly);
    }
    @Transactional(timeout=15,isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) public int dispatchDueNotices() {
        if(!enabled)return 0;
        Instant now=clock.instant(),studentWindow=now.plusSeconds(3600L+prepareSeconds),teacherWindow=now.plusSeconds(300L+prepareSeconds);
        String identityCheck=identities!=null && identities.enabled()?" AND EXISTS(SELECT 1 FROM teaching_identities ti WHERE ti.user_id=c.teacher_id AND ti.school_id=l.school_id AND ti.requested_role='TEACHER' AND ti.status='APPROVED')":"";
        String studentFrom=rostersEnabled?"teaching_attendance_scopes rs JOIN teaching_students s ON s.id=rs.student_id AND s.school_id=rs.school_id":"teaching_students s";
        String membership=rostersEnabled?"rs.lesson_id=l.id AND rs.school_id=l.school_id AND rs.withdrawn=FALSE":"s.class_id=l.class_id AND s.school_id=l.school_id";
        String pending=" AND ((u.status=1"+identityCheck+" AND l.starts_at<=? AND NOT EXISTS(SELECT 1 FROM teaching_notices n WHERE n.lesson_id=l.id AND n.user_id=c.teacher_id AND n.kind='TEACHER_ROSTER')) "
                +"OR EXISTS(SELECT 1 FROM "+studentFrom+" JOIN users su ON su.id=s.user_id AND su.school_id=s.school_id AND su.status=1 WHERE "+membership+" AND NOT EXISTS(SELECT 1 FROM teaching_notices n WHERE n.lesson_id=l.id AND n.user_id=s.user_id AND n.kind='STUDENT_CLASS'))) ";
        // Lock candidate lessons before reading recipients. Competing transactions then
        // see committed receipts rather than racing a whole multi-row insert.
        var ids=db.queryForList("SELECT l.id "+LESSON_FROM+"WHERE l.cancelled=FALSE AND l.starts_at>? AND l.starts_at<=?"+pending+"ORDER BY l.starts_at,l.id LIMIT ? FOR UPDATE",String.class,
                Timestamp.from(now),Timestamp.from(studentWindow),Timestamp.from(teacherWindow),reminderLessons);
        if(ids.isEmpty())return 0;
        String selected="l.id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+") AND l.cancelled=FALSE AND l.starts_at>? AND l.starts_at<=? ";
        var teacherArgs=new ArrayList<Object>(ids);teacherArgs.add(Timestamp.from(now));teacherArgs.add(Timestamp.from(teacherWindow));teacherArgs.add(reminderNotices);
        // Teacher targets get first use of this bounded pass; no per-lesson roster/identity reads.
        List<NoticeTarget> targets=new ArrayList<>(db.query("SELECT l.id,c.teacher_id AS user_id,l.starts_at "+LESSON_FROM+"WHERE "+selected+"AND u.status=1"+identityCheck+" AND NOT EXISTS(SELECT 1 FROM teaching_notices n WHERE n.user_id=c.teacher_id AND n.lesson_id=l.id AND n.kind='TEACHER_ROSTER') ORDER BY l.starts_at,l.id LIMIT ?",
                (r,n)->target(r,"TEACHER_ROSTER",300),teacherArgs.toArray()));
        int remaining=reminderNotices-targets.size();
        if(remaining>0) {
            var studentArgs=new ArrayList<Object>(ids);studentArgs.add(Timestamp.from(now));studentArgs.add(Timestamp.from(studentWindow));studentArgs.add(remaining);
            String join=rostersEnabled?"JOIN teaching_attendance_scopes rs ON rs.lesson_id=l.id AND rs.school_id=l.school_id AND rs.withdrawn=FALSE JOIN teaching_students s ON s.id=rs.student_id AND s.school_id=rs.school_id":"JOIN teaching_students s ON s.class_id=l.class_id AND s.school_id=l.school_id";
            targets.addAll(db.query("SELECT l.id,s.user_id,l.starts_at FROM teaching_lessons l "+join+" JOIN users su ON su.id=s.user_id AND su.school_id=s.school_id AND su.status=1 WHERE "+selected+
                    "AND NOT EXISTS(SELECT 1 FROM teaching_notices n WHERE n.user_id=s.user_id AND n.lesson_id=l.id AND n.kind='STUDENT_CLASS') ORDER BY l.starts_at,l.id,s.user_id LIMIT ?",(r,n)->target(r,"STUDENT_CLASS",3600),studentArgs.toArray()));
        }
        targets.removeIf(t->!clock.instant().isBefore(t.startsAt));
        int added=0;
        for(int offset=0;offset<targets.size();offset+=100) {
            var batch=targets.subList(offset,Math.min(offset+100,targets.size()));List<Object> args=new ArrayList<>();
            for(var t:batch)Collections.addAll(args,noticeId(t.user,t.lesson,t.kind),t.user,t.lesson,t.kind,Timestamp.from(t.due));
            int rows=db.update("INSERT INTO teaching_notices(id,user_id,lesson_id,kind,due_at) VALUES "+String.join(",",Collections.nCopies(batch.size(),"(?,?,?,?,?)")),args.toArray());
            if(rows!=batch.size())throw new IllegalStateException("提醒批次回执数量不一致");
            added+=rows;
        }
        return added;
    }
    private NoticeTarget target(java.sql.ResultSet r,String kind,int before) throws java.sql.SQLException {
        Instant start=r.getTimestamp("starts_at").toInstant();return new NoticeTarget(r.getLong("user_id"),r.getString("id"),kind,start.minusSeconds(before),start);
    }
    private record NoticeTarget(long user,String lesson,String kind,Instant due,Instant startsAt) {}
    private static String noticeId(long user,String lesson,String kind) { return UUID.nameUUIDFromBytes((user+":"+lesson+":"+kind).getBytes(StandardCharsets.UTF_8)).toString(); }
    public List<Notice> notices(long user) {
        return visibleNotices(user,null);
    }
    private List<Notice> visibleNotices(long user,String exactId){
        Principal p=principal(user);
        boolean teacherAllowed=identities==null || identities.approvedRoles(user).contains("TEACHER");
        String member=rostersEnabled?"EXISTS(SELECT 1 FROM teaching_attendance_scopes rs JOIN teaching_students s ON s.id=rs.student_id AND s.school_id=rs.school_id WHERE rs.lesson_id=l.id AND rs.school_id=l.school_id AND rs.withdrawn=FALSE AND s.user_id=?)":"EXISTS(SELECT 1 FROM teaching_students s WHERE s.class_id=l.class_id AND s.school_id=l.school_id AND s.user_id=?)";
        var args=new ArrayList<Object>(List.of(user,p.school,Timestamp.from(clock.instant()),user,teacherAllowed,user));if(exactId!=null)args.add(exactId);
        return db.query("SELECT n.*,c.name,c.room,COALESCE(NULLIF(u.nickname,''),u.username,'教师账号未绑定') AS teacher_name,l.starts_at FROM teaching_notices n JOIN teaching_lessons l ON l.id=n.lesson_id JOIN teaching_courses c ON c.id=l.course_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=l.school_id WHERE n.user_id=? AND l.school_id=? AND l.cancelled=FALSE AND n.due_at<=? AND ((n.kind='TEACHER_ROSTER' AND c.teacher_id=? AND ?=TRUE) OR (n.kind='STUDENT_CLASS' AND "+member+"))"+(exactId==null?"":" AND n.id=?")+" ORDER BY n.due_at DESC,n.id LIMIT "+(exactId==null?100:1),
                (r,n)->new Notice(r.getString("id"),r.getString("lesson_id"),r.getString("kind"),r.getString("name"),r.getString("room"),r.getString("teacher_name"),r.getTimestamp("starts_at").toInstant(),r.getTimestamp("due_at").toInstant(),r.getTimestamp("read_at")==null?null:r.getTimestamp("read_at").toInstant()),args.toArray());
    }
    public void readNotice(long user,String id) {
        principal(user); uuid(id);
        if(visibleNotices(user,id).isEmpty()) throw error(404,"通知不存在或无权查看");
        db.update("UPDATE teaching_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",Timestamp.from(clock.instant()),id,user);
    }
    public DayAnswer myDay(long user,LocalDate date) {
        Principal p=principal(user);
        if(date==null) date=LocalDate.now(clock.withZone(ZONE));
        List<String> views=access(p.id).views;
        String view=views.contains("STUDENT")?"STUDENT":views.contains("TEACHER")?"TEACHER":null;
        if(view==null) return new DayAnswer("还没有绑定你的班级课表。请联系教学管理员绑定本人账号；不会按姓名自动认领。","本人的教学课程安排",date);
        var list=lessons(user,view,date,date).stream().filter(l->!l.cancelled).toList();
        if(list.isEmpty()) return new DayAnswer(date+"没有已配置课程。这里不是实时教务同步，临时调课仍需核对教务通知。","本人的教学课程安排",date);
        StringBuilder answer=new StringBuilder(date+"的课程：\n");
        for(Lesson l:list) {
            BoundLesson b=authorized(p,view,l.id,false);
            answer.append("\n- ").append(l.startsAt.atZone(ZONE).toLocalTime()).append("—").append(l.endsAt.atZone(ZONE).toLocalTime()).append(" ").append(l.course).append("；").append(b.room).append("；任课教师：").append(l.teacher);
        }
        answer.append("\n\n来源：本人的教学课程安排；不是实时教务同步。考勤不自动推断。");
        return new DayAnswer(answer.toString(),"本人的教学课程安排",date);
    }
    public static boolean isMyDayQuestion(String text) {
        return text!=null && text.length()<=100 && text.matches(".*(?:我|我的).*(?:今天|明天).*(?:课|上课|教室|老师).*|.*(?:今天|明天).*(?:我|我的).*(?:课|上课|教室|老师).*");
    }
    public String localAnswer(long user,String question) {
        if(!isMyDayQuestion(question)) return null;
        if(!enabled) return "教学课表尚未启用或绑定。可在‘我的课表’导入个人课表；我不会猜测你今天上什么课，也不会把私人课表发给模型。";
        return myDay(user,LocalDate.now(clock.withZone(ZONE)).plusDays(question.contains("明天")?1:0)).answer;
    }
    private String hash(Object value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(value))); }
        catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static void uuid(String value) { if(value==null || !value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw error(400,"记录编号无效"); }
    private static void text(String value,int max,boolean required) { if(value==null || value.length()>max || (required && value.isBlank()) || value.chars().anyMatch(c->c<32 || c==127)) throw error(400,"字段为空、过长或包含控制字符"); }
    private static boolean time(String value) { return value!=null && value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"); }
    private static ResponseStatusException error(int status,String message) { return new ResponseStatusException(HttpStatus.valueOf(status),message); }
}
