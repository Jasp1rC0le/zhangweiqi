package com.campusai.teaching;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import tools.jackson.databind.ObjectMapper;

/** Read-only administrative evidence. Current labels are not historical affiliation snapshots. */
@Service
public class TeachingAdministrativeAuditService {
    public static final int EXPORT_LIMIT=2000;
    private final JdbcTemplate db;
    private final TeachingService teaching;
    private final TeachingIdentityService identities;
    private final Clock clock;
    private final ObjectMapper json;
    @org.springframework.beans.factory.annotation.Value("${app.teaching.responsibility-enabled:false}") private boolean responsibilityEnabled;
    @org.springframework.beans.factory.annotation.Value("${app.teaching.lesson-change-enabled:false}") private boolean lessonChangesEnabled;
    private final Map<String,Prepared> exports=new LinkedHashMap<>();
    @Autowired public TeachingAdministrativeAuditService(JdbcTemplate db,TeachingService teaching,TeachingIdentityService identities,ObjectMapper json){this(db,teaching,identities,Clock.systemUTC(),json);}
    public TeachingAdministrativeAuditService(JdbcTemplate db,TeachingService teaching,TeachingIdentityService identities){this(db,teaching,identities,Clock.systemUTC(),new ObjectMapper());}
    public TeachingAdministrativeAuditService(JdbcTemplate db,TeachingService teaching,TeachingIdentityService identities,Clock clock){this(db,teaching,identities,clock,new ObjectMapper());}
    public TeachingAdministrativeAuditService(JdbcTemplate db,TeachingService teaching,TeachingIdentityService identities,Clock clock,ObjectMapper json){this.db=db;this.teaching=teaching;this.identities=identities;this.clock=clock;this.json=json;}
    public record Category(String key,String label,boolean enabled,String detail){}
    public record Access(List<Category> categories,int maxDays,int retentionYears,boolean deletionEnabled,boolean exportEnabled,int maxExportRows,int exportSeconds){}
    public record Filter(String kind,LocalDate from,LocalDate to,String search){}
    public record Row(String id,String kind,String eventId,String subjectId,String target,String context,String action,String beforeValue,String afterValue,String reason,Integer revision,Integer affectedLessons,long actorId,String actorName,Instant recordedAt,String historyNote){}
    public record Page(Filter filter,List<Row> items,int page,int size,int total,int totalPages){}
    public record Preview(String token,Filter filter,int count,int maxRows,String sha256,Instant expiresAt,int retentionYears,boolean deletionEnabled){}
    public record ExportRequest(String token){}
    public record Artifact(byte[] bytes,String sha256,String filename){}
    private record Prepared(long actor,long school,Filter filter,int count,String sha256,Instant expires){}
    private record Authorized(long school,TeachingService.Capabilities capabilities){}
    private record Query(String sql,List<Object> args){}
    private static ResponseStatusException error(int status,String message){return new ResponseStatusException(HttpStatus.valueOf(status),message);}
    private Authorized authorize(long actor){
        // This performs the existing enabled/account/normal platform ADMIN checks, not a teaching-view grant.
        var capabilities=teaching.capabilities(actor);
        Long school=db.queryForObject("SELECT school_id FROM users WHERE id=? AND status=1 AND role='ADMIN'",Long.class,actor);
        if(school==null || school<1)throw error(403,"需要本校正常管理员权限");
        return new Authorized(school,capabilities);
    }
    private List<Category> categories(Authorized p){var values=new ArrayList<>(List.of(
            new Category("STUDENT_TRANSITION","学籍变更",p.capabilities().lifecycleEnabled(),"转班、离校与复学的原状态和目标班级"),
            new Category("ACCOUNT_BINDING","账号绑定",true,"保留旧、新账号编号；原表未保存绑定时行政班快照"),
            new Category("IDENTITY_REVIEW","身份审核",identities!=null && identities.enabled(),"申请、审核、撤销与恢复；不等于课程范围授权"),
            new Category("COURSE_ENROLLMENT","选课变更",p.capabilities().rosterEnabled(),"创建、退课及重新选课；不以当前班级推断过去归属"),
            new Category("COURSE_SOURCE","课程来源核定",p.capabilities().enrollmentModeReviewEnabled(),"历史课程整班或逐人来源的明确核定")));
        if(responsibilityEnabled)values.add(new Category("RESPONSIBILITY","负责范围变更",true,"授予与撤销的目标、范围快照、原因和版本；迁移前历史不补造"));
        if(lessonChangesEnabled)values.add(new Category("LESSON_CHANGE","单次调停课",true,"原/替代节次及课程、教师、教室来自当次不可变回执；操作人原显示名未捕获，不补造"));
        return List.copyOf(values);}
    public Access access(long actor){var p=authorize(actor);return new Access(categories(p),31,1,false,true,EXPORT_LIMIT,300);}
    private Filter normalize(Filter f,List<Category> categories){
        if(f==null || f.from()==null || f.to()==null || f.from().isAfter(f.to()) || java.time.temporal.ChronoUnit.DAYS.between(f.from(),f.to())>30)throw error(400,"按操作发生日期查询，每次最多31天");
        String kind=f.kind()==null?"ALL":f.kind(),search=f.search()==null?"":f.search().trim();
        if(search.length()>80 || search.chars().anyMatch(Character::isISOControl))throw error(400,"搜索限80字，不能包含控制字符");
        if(!"ALL".equals(kind)){
            var category=categories.stream().filter(c->c.key().equals(kind)).findFirst().orElseThrow(()->error(400,"请选择有效的管理记录类型"));
            if(!category.enabled())throw error(503,"这类管理记录尚未启用，未返回其他类型冒充结果");
        }
        return new Filter(kind,f.from(),f.to(),search);
    }
    private Query query(Authorized p,Filter filter,List<Category> available){
        var branches=new ArrayList<String>();var args=new ArrayList<Object>();
        for(var category:available){if(!category.enabled() || !("ALL".equals(filter.kind()) || category.key().equals(filter.kind())))continue;
            String kind=category.key(),select,from,invalid,actorName="COALESCE(NULLIF(actor.nickname,''),actor.username,'历史操作账号')",snapshot="NULL",originalCourse="NULL",originalClass="NULL",replacementCourse="NULL";
            switch(kind){
                case "STUDENT_TRANSITION" -> {
                    select="h.request_id AS event_id,h.student_id AS subject_id,s.name AS target,CONCAT('学号 ',s.student_number) AS context,h.action,h.old_status AS before_value,h.new_status AS after_value,h.reason,h.revision,h.affected_lessons,CONCAT('原行政班：',COALESCE(old_class.name,h.old_class_id),'；目标行政班：',COALESCE(new_class.name,h.new_class_id),'。班级编号来自当次记录，名称为当前对照。') AS history_note";
                    from="teaching_student_transition_audit h LEFT JOIN teaching_students s ON s.id=h.student_id AND s.school_id=h.school_id LEFT JOIN teaching_classes old_class ON old_class.id=h.old_class_id AND old_class.school_id=h.school_id LEFT JOIN teaching_classes new_class ON new_class.id=h.new_class_id AND new_class.school_id=h.school_id";
                    invalid="s.id IS NULL OR old_class.id IS NULL OR new_class.id IS NULL OR h.action NOT IN ('TRANSFER','LEAVE','RESTORE') OR h.old_status NOT IN ('ACTIVE','LEFT') OR h.new_status NOT IN ('ACTIVE','LEFT') OR h.revision<1 OR h.affected_lessons<0";
                }
                case "ACCOUNT_BINDING" -> {
                    select="h.id AS event_id,h.student_id AS subject_id,s.name AS target,CONCAT('学号 ',s.student_number) AS context,'BIND' AS action,COALESCE(CAST(h.old_user_id AS CHAR),'未绑定') AS before_value,COALESCE(CAST(h.new_user_id AS CHAR),'未绑定') AS after_value,'原绑定记录未保存原因' AS reason,NULL AS revision,NULL AS affected_lessons,'原、新账号编号来自当次记录；未保存当时行政班快照，不用当前班级补造。' AS history_note";
                    from="teaching_binding_audit h LEFT JOIN teaching_students s ON s.id=h.student_id AND s.school_id=h.school_id";invalid="s.id IS NULL OR h.old_user_id<1 OR h.new_user_id<1";
                }
                case "IDENTITY_REVIEW" -> {
                    select="h.id AS event_id,h.application_id AS subject_id,COALESCE(NULLIF(target_user.nickname,''),target_user.username,'已注销或解绑的历史申请') AS target,CONCAT('申请身份 ',application.requested_role) AS context,'REVIEW' AS action,h.old_status AS before_value,h.new_status AS after_value,h.reason,h.revision,NULL AS affected_lessons,'申请注销后仍保留审计；未保存的原账号显示名和班级不补造。身份通过不等于平台管理员或教学范围授权。' AS history_note";
                    from="teaching_identity_audit h LEFT JOIN teaching_identities application ON application.id=h.application_id AND application.school_id=h.school_id LEFT JOIN users target_user ON target_user.id=application.user_id AND target_user.school_id=h.school_id";
                    invalid="application.id IS NULL OR (application.user_id IS NOT NULL AND target_user.id IS NULL) OR h.old_status NOT IN ('NONE','PENDING','APPROVED','REJECTED','REVOKED') OR h.new_status NOT IN ('PENDING','APPROVED','REJECTED','REVOKED') OR h.revision<1";
                }
                case "COURSE_ENROLLMENT" -> {
                    select="h.id AS event_id,h.student_id AS subject_id,s.name AS target,CONCAT(c.name,' · ',c.semester,' · 学号 ',s.student_number) AS context,h.action,'' AS before_value,'' AS after_value,h.reason,h.revision,NULL AS affected_lessons,'变更行为和名单版本来自当次记录；原表未保存当时行政班，不按学生现班推断。' AS history_note";
                    from="teaching_enrollment_audit h LEFT JOIN teaching_students s ON s.id=h.student_id AND s.school_id=h.school_id LEFT JOIN teaching_courses c ON c.id=h.course_id AND c.school_id=h.school_id";invalid="s.id IS NULL OR c.id IS NULL OR h.action NOT IN ('CREATE','WITHDRAW','TRANSFER','LEAVE','RESTORE','REENROLL') OR h.revision<0";
                }
                case "COURSE_SOURCE" -> {
                    select="h.request_id AS event_id,h.course_id AS subject_id,c.name AS target,c.semester AS context,'SOURCE_REVIEW' AS action,'LEGACY' AS before_value,h.mode AS after_value,h.reason,h.revision,NULL AS affected_lessons,'来源核定不改写原成员、通知和过去考勤；课程名称与学期为当前对照。' AS history_note";
                    from="teaching_course_mode_reviews h LEFT JOIN teaching_courses c ON c.id=h.course_id AND c.school_id=h.school_id";invalid="c.id IS NULL OR h.mode NOT IN ('ADMIN_CLASS','EXPLICIT') OR h.old_revision<0 OR h.revision<>h.old_revision+1";
                }
                case "RESPONSIBILITY" -> {
                    select="h.request_id AS event_id,CAST(h.user_id AS CHAR) AS subject_id,h.target_label AS target,CONCAT(h.view_role,' · ',h.scope_label) AS context,h.action,CASE WHEN h.old_active THEN '有负责权限' ELSE '无负责权限' END AS before_value,CASE WHEN h.new_active THEN '有负责权限' ELSE '无负责权限' END AS after_value,h.reason,h.revision,NULL AS affected_lessons,'账号、范围与操作人显示名来自当次快照；权限撤销不删除考勤，迁移前原授权人和时间不补造。' AS history_note";
                    from="teaching_grant_audit h";actorName="h.actor_label";
                    invalid="h.user_id<1 OR h.actor_id<1 OR h.view_role NOT IN ('COUNSELOR','SECRETARY') OR h.action NOT IN ('GRANT','REVOKE') OR h.old_active=h.new_active OR h.revision<>h.old_revision+1 OR h.old_revision<0 OR h.target_label='' OR h.scope_label='' OR h.actor_label=''";
                }
                case "LESSON_CHANGE" -> {
                    // Search the captured receipt, not today's course/teacher labels. Decode only the
                    // requested page (or bounded complete CSV) and never return the raw JSON to UI.
                    select="h.request_id AS event_id,h.old_lesson_id AS subject_id,h.old_lesson_id AS target,h.receipt_json AS context,CASE WHEN h.new_lesson_id IS NULL THEN 'CANCEL' ELSE 'RESCHEDULE' END AS action,h.old_lesson_id AS before_value,COALESCE(h.new_lesson_id,'取消这一节') AS after_value,h.reason,h.revision,1 AS affected_lessons,'当次调停课回执；未保存的操作人原显示名不补造。' AS history_note";
                    from="teaching_lesson_changes h LEFT JOIN teaching_lessons original ON original.id=h.old_lesson_id AND original.school_id=h.school_id LEFT JOIN teaching_courses original_course ON original_course.id=original.course_id AND original_course.school_id=h.school_id LEFT JOIN teaching_lessons replacement ON replacement.id=h.new_lesson_id AND replacement.school_id=h.school_id LEFT JOIN teaching_courses replacement_course ON replacement_course.id=h.new_course_id AND replacement_course.school_id=h.school_id";
                    actorName="'历史操作账号（原回执未保存显示名）'";snapshot="h.receipt_json";originalCourse="original.course_id";originalClass="original.class_id";replacementCourse="h.new_course_id";
                    invalid="original.id IS NULL OR original_course.id IS NULL OR original.class_id<>original_course.class_id OR original.cancelled=FALSE OR h.actor_id<1 OR h.old_revision<0 OR h.revision<>h.old_revision+1 OR h.reason='' OR h.receipt_json IS NULL OR LENGTH(h.receipt_json)>16000 OR (h.new_lesson_id IS NULL AND h.new_course_id IS NOT NULL) OR (h.new_lesson_id IS NOT NULL AND (replacement.id IS NULL OR replacement_course.id IS NULL OR replacement.course_id<>h.new_course_id))";
                }
                default -> throw error(400,"管理记录类型无效");
            }
            branches.add("SELECT '"+kind+"' AS kind,"+select+",h.actor_id,"+actorName+" AS actor_name,h.recorded_at,"+snapshot+" AS snapshot_json,"+originalCourse+" AS original_course_id,"+originalClass+" AS original_class_id,"+replacementCourse+" AS replacement_course_id,CASE WHEN "+invalid+" THEN 1 ELSE 0 END AS invalid_target FROM "+from+" LEFT JOIN users actor ON actor.id=h.actor_id AND actor.school_id=h.school_id WHERE h.school_id=? AND h.recorded_at>=? AND h.recorded_at<?");
            args.add(p.school());args.add(Timestamp.from(filter.from().atStartOfDay(TeachingService.ZONE).toInstant()));args.add(Timestamp.from(filter.to().plusDays(1).atStartOfDay(TeachingService.ZONE).toInstant()));
        }
        String sql=" FROM ("+String.join(" UNION ALL ",branches)+") operation_rows WHERE 1=1";
        if(!filter.search().isEmpty()){
            String like="%"+filter.search().replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            sql+=" AND (target LIKE ? ESCAPE '!' OR context LIKE ? ESCAPE '!' OR reason LIKE ? ESCAPE '!' OR subject_id LIKE ? ESCAPE '!' OR event_id LIKE ? ESCAPE '!' OR actor_name LIKE ? ESCAPE '!')";
            for(int n=0;n<6;n++)args.add(like);
        }
        return new Query(sql,args);
    }
    private int completeCount(Query q){
        var count=db.queryForMap("SELECT COUNT(*) AS total,COALESCE(MAX(invalid_target),0) AS invalid_count"+q.sql(),q.args().toArray());
        if(((Number)count.get("invalid_count")).intValue()!=0)throw error(503,"管理历史存在不完整或跨校关联，请核对；未返回部分记录");
        return ((Number)count.get("total")).intValue();
    }
    private List<Row> rows(Query q,int limit,int offset){
        var args=new ArrayList<>(q.args());args.add(limit);args.add(offset);
        return List.copyOf(db.query("SELECT *"+q.sql()+" ORDER BY recorded_at DESC,kind,event_id DESC LIMIT ? OFFSET ?",(r,n)->{
            var row=new Row(r.getString("kind")+":"+r.getString("event_id"),r.getString("kind"),r.getString("event_id"),r.getString("subject_id"),r.getString("target"),r.getString("context"),r.getString("action"),r.getString("before_value"),r.getString("after_value"),r.getString("reason"),r.getObject("revision")==null?null:r.getInt("revision"),r.getObject("affected_lessons")==null?null:r.getInt("affected_lessons"),r.getLong("actor_id"),r.getString("actor_name"),r.getTimestamp("recorded_at").toInstant(),r.getString("history_note"));
            return "LESSON_CHANGE".equals(row.kind())?lessonSnapshot(row,r.getString("snapshot_json"),r.getString("original_course_id"),r.getString("original_class_id"),r.getString("replacement_course_id")):row;
        },args.toArray()));
    }
    private static boolean captured(String value,int max){return value!=null&&!value.isBlank()&&value.length()<=max&&value.chars().noneMatch(Character::isISOControl);}
    private static boolean clock(String value){return value!=null&&value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d");}
    private static String arrangement(LocalDate date,String start,String end,String teacher,String room){return date+" "+start+"—"+end+" · "+teacher+" · "+room;}
    private Row lessonSnapshot(Row row,String snapshot,String courseId,String classId,String replacementCourseId){
        try{
            var value=json.readValue(snapshot,TeachingLessonChangeService.Receipt.class);var old=value.original();var next=value.proposed();
            if(old==null||!Objects.equals(value.requestId(),row.eventId())||value.actorId()!=row.actorId()||!Objects.equals(value.action(),row.action())||!Objects.equals(old.lessonId(),row.subjectId())||!Objects.equals(old.courseId(),courseId)||!Objects.equals(old.classId(),classId)||value.revision()!=row.revision()||old.revision()+1!=value.revision()||!Objects.equals(value.reason(),row.reason())||!Objects.equals(value.recordedAt(),row.recordedAt())||!captured(old.name(),100)||!captured(old.semester(),100)||!captured(old.groupName(),100)||!captured(old.classLabel(),250)||!captured(old.teacherLabel(),150)||!captured(old.room(),100)||old.date()==null||!clock(old.startTime())||!clock(old.endTime())||old.startTime().compareTo(old.endTime())>=0)throw new IllegalStateException("invalid original receipt");
            String after;
            if("CANCEL".equals(value.action())){if(next!=null||value.replacementCourseId()!=null||value.replacementLessonId()!=null)throw new IllegalStateException("invalid cancel receipt");after="取消这一节，不改其他周次";}
            else{if(next==null||!Objects.equals(value.replacementLessonId(),row.afterValue())||!Objects.equals(value.replacementCourseId(),replacementCourseId)||replacementCourseId==null||!captured(next.teacherLabel(),150)||!captured(next.room(),100)||next.date()==null||!clock(next.startTime())||!clock(next.endTime())||next.startTime().compareTo(next.endTime())>=0)throw new IllegalStateException("invalid replacement receipt");after=arrangement(next.date(),next.startTime(),next.endTime(),next.teacherLabel(),next.room());}
            return new Row(row.id(),row.kind(),row.eventId(),row.subjectId(),old.name(),old.semester()+" · "+old.groupName(),row.action(),arrangement(old.date(),old.startTime(),old.endTime(),old.teacherLabel(),old.room()),after,row.reason(),row.revision(),1,row.actorId(),row.actorName(),row.recordedAt(),"课程、教师、教室与原行政归属来自当次不可变回执，不随现名改变。原行政班："+old.classLabel()+"。操作人原显示名未捕获，只保留账号编号，不补造；不广播变更原因给学生。");
        }catch(RuntimeException failure){throw error(503,"本页调停课原始回执不完整或目标不一致，整页未展示；请核对原请求");}
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Page page(long actor,Filter input,int page,int size){
        var p=authorize(actor);var available=categories(p);Filter filter=normalize(input,available);
        if(page<0 || page>10000 || size<1 || size>100)throw error(400,"页码无效，每页限1至100条");
        Query q=query(p,filter,available);int total=completeCount(q),pages=(total+size-1)/size;
        if(page>0 && page>=pages)throw error(400,"这一页已变化，请从第一页重新读取");
        return new Page(filter,rows(q,size,page*size),page,size,total,pages);
    }
    private record ExportBytes(byte[] bytes,int count){}
    private ExportBytes csv(Authorized p,Filter filter){
        Query query=query(p,filter,categories(p));int count=completeCount(query);
        if(count==0)throw error(400,"当前范围没有可导出管理记录");
        if(count>EXPORT_LIMIT)throw error(400,"管理历史超过2000条，请缩小操作日期、类型或搜索条件；未截断导出");
        var values=rows(query,EXPORT_LIMIT+1,0);if(values.size()!=count)throw error(503,"管理历史范围读取不完整，请重新核对；没有生成部分文件");
        var out=new StringBuilder("\uFEFF");
        line(out,List.of("Campthink 本校管理操作历史",filter.from(),filter.to(),filter.kind(),filter.search()));
        line(out,List.of("学校保留策略：一年","这是完整选定范围下载，不表示已归档、恢复或删除",responsibilityEnabled||lessonChangesEnabled?"已开放的负责范围使用当次快照，调停课使用当次回执；其他名称见逐条历史依据，缺失快照不补造":"显示名为当前对照，缺历史快照不补造"));
        String provenance=responsibilityEnabled||lessonChangesEnabled?"（见历史依据）":"（当前对照）";
        line(out,List.of("记录编号","类型","事件编号","对象编号","对象"+provenance,"上下文"+provenance,"行为","原值","新值","原因或依据","版本","影响安排项数","操作账号编号（文本）","操作人"+provenance,"操作时间（北京时间）","历史依据说明"));
        for(Row row:values)line(out,Arrays.asList(row.id(),row.kind(),row.eventId(),row.subjectId(),row.target(),row.context(),row.action(),row.beforeValue(),row.afterValue(),row.reason(),row.revision(),row.affectedLessons(),"'"+row.actorId(),row.actorName(),row.recordedAt().atZone(TeachingService.ZONE).toOffsetDateTime(),row.historyNote()));
        byte[] bytes=out.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>12*1024*1024)throw error(400,"导出文件超过12MB，请缩小范围；未截断导出");return new ExportBytes(bytes,count);
    }
    private static void line(StringBuilder out,List<?> cells){
        var values=new ArrayList<String>();for(Object cell:cells){String value=cell==null?"":cell.toString().replaceAll("[\\p{Cntrl}]"," ");if(value.matches("(?U)^[\\s\\uFEFF]*[=+@-].*"))value="'"+value;values.add("\""+value.replace("\"","\"\"")+"\"");}out.append(String.join(",",values)).append("\r\n");
    }
    private static String sha(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(java.security.NoSuchAlgorithmException failure){throw new IllegalStateException(failure);}}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Preview preview(long actor,Filter input){
        var p=authorize(actor);Filter filter=normalize(input,categories(p));var csv=csv(p,filter);String sha=sha(csv.bytes()),token=UUID.randomUUID().toString();Instant expires=clock.instant().plusSeconds(300);
        synchronized(exports){exports.entrySet().removeIf(e->!e.getValue().expires().isAfter(clock.instant()));while(exports.values().stream().filter(e->e.actor()==actor).count()>=4){String oldest=exports.entrySet().stream().filter(e->e.getValue().actor()==actor).findFirst().orElseThrow().getKey();exports.remove(oldest);}if(exports.size()>=1000)throw error(429,"当前导出准备较多，请稍后重试");exports.put(token,new Prepared(actor,p.school(),filter,csv.count(),sha,expires));}
        return new Preview(token,filter,csv.count(),EXPORT_LIMIT,sha,expires,1,false);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Artifact download(long actor,ExportRequest input){
        if(input==null||input.token()==null||!input.token().matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw error(400,"先准备并核对管理历史导出范围");
        Prepared prepared;synchronized(exports){prepared=exports.get(input.token());}
        if(prepared==null||prepared.actor()!=actor||!prepared.expires().isAfter(clock.instant()))throw error(410,"管理历史导出预览已失效，请重新准备");
        var p=authorize(actor);if(p.school()!=prepared.school())throw error(403,"管理员学校范围已变化，请重新核对");
        Filter filter=normalize(prepared.filter(),categories(p));var csv=csv(p,filter);String actual=sha(csv.bytes());
        if(csv.count()!=prepared.count()||!actual.equals(prepared.sha256()))throw error(409,"管理历史或授权范围已变化，请重新读取并准备；没有返回旧文件");
        if(!prepared.expires().isAfter(clock.instant()))throw error(410,"管理历史导出准备已过期，请重新核对");
        return new Artifact(csv.bytes(),actual,"管理操作历史-"+filter.from()+"-"+filter.to()+".csv");
    }
}
