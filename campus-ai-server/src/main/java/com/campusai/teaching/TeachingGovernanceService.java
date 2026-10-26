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

/** Authorized attendance evidence, not a public knowledge feed or a destructive retention job. */
@Service
public class TeachingGovernanceService {
    public static final int EXPORT_LIMIT=2000;
    private final JdbcTemplate db;private final TeachingService teaching;private final Clock clock;
    private final Map<String,Prepared> previews=new LinkedHashMap<>();
    @Autowired public TeachingGovernanceService(JdbcTemplate db,TeachingService teaching){this(db,teaching,Clock.systemUTC());}
    public TeachingGovernanceService(JdbcTemplate db,TeachingService teaching,Clock clock){this.db=db;this.teaching=teaching;this.clock=clock;}
    public record Filter(String view,LocalDate from,LocalDate to,String classId,String kind,boolean expiredOnly){}
    public record Row(String id,String lessonId,String studentId,String studentNumber,String studentName,String course,String teacher,String className,String college,
            Instant startsAt,Instant endsAt,String status,String oldStatus,String newStatus,String reason,String actorName,Instant retentionBaseAt,Instant retainedUntil,boolean eligible,boolean withdrawn,boolean cancelled,String scopeSource){}
    public record Page(Filter filter,List<Row> items,int page,int size,int total,int totalPages,int rangeTotal,int expiredWithinScope,int retentionYears,boolean deletionEnabled){}
    public record Preview(String token,Filter filter,int count,int maxRows,String sha256,Instant expiresAt,int retentionYears,boolean deletionEnabled){}
    public record ExportRequest(String token){}
    public record Artifact(byte[] bytes,String sha256,String filename){}
    public record Access(boolean enabled,List<String> views,int maxDays,int maxExportRows,int retentionYears,boolean deletionEnabled){}
    private record Prepared(long owner,Filter filter,String sha256,int count,Instant expires){}
    private record Relation(String from,String where,List<Object> args,String base){}
    private static ResponseStatusException error(int status,String message){return new ResponseStatusException(HttpStatus.valueOf(status),message);}
    public Access access(long user){
        var existing=teaching.access(user);var views=new ArrayList<>(existing.views());
        if(existing.enabled() && db.queryForObject("SELECT COUNT(*) FROM users WHERE id=? AND role='ADMIN' AND status=1",Integer.class,user)==1)views.add("ADMIN");
        return new Access(existing.enabled(),List.copyOf(views),31,EXPORT_LIMIT,1,false);
    }
    private Filter normalized(Filter f){
        if(f==null || !Set.of("ATTENDANCE","AUDIT").contains(f.kind()==null?"":f.kind()))throw error(400,"请选择考勤记录或变更审计");
        return new Filter(f.view(),f.from(),f.to(),f.classId()==null?"":f.classId().trim(),f.kind(),f.expiredOnly());
    }
    private Relation relation(long user,Filter f){
        var authorized=teaching.governanceRelation(user,f.view(),f.from(),f.to(),f.classId());
        String source=authorized.from(),where=authorized.where(),base;
        if("AUDIT".equals(f.kind())) {
            source+=" JOIN teaching_attendance_audit h ON h.lesson_id=a.lesson_id AND h.student_id=a.student_id AND h.school_id=l.school_id LEFT JOIN users actor ON actor.id=h.actor_id AND actor.school_id=h.school_id ";
            base="h.recorded_at";
            String statuses=TeachingService.STATUSES.stream().sorted().map(s->"'"+s+"'").collect(java.util.stream.Collectors.joining(","));
            if(!db.queryForList("SELECT h.id"+source+where+" AND (h.old_status IS NULL OR h.new_status IS NULL OR h.old_status NOT IN ("+statuses+") OR h.new_status NOT IN ("+statuses+")) LIMIT 1",String.class,authorized.args().toArray()).isEmpty())throw error(503,"审计存在未识别状态，未返回部分记录");
        } else base="GREATEST(l.ends_at,COALESCE((SELECT MAX(change_record.recorded_at) FROM teaching_attendance_audit change_record WHERE change_record.school_id=l.school_id AND change_record.lesson_id=a.lesson_id AND change_record.student_id=a.student_id),l.ends_at))";
        return new Relation(source,where,authorized.args(),base);
    }
    private List<Object> parameters(Relation r){return new ArrayList<>(r.args());}
    private String expiredClause(Relation r){return " AND TIMESTAMPADD(YEAR,1,"+r.base()+")<=?";}
    private List<Row> rows(Relation r,Filter f,int limit,int offset){
        boolean history="AUDIT".equals(f.kind());var args=parameters(r);String where=r.where();
        if(f.expiredOnly()){where+=expiredClause(r);args.add(Timestamp.from(clock.instant()));}
        boolean rosters=teaching.rostersEnabled();
        String captured=rosters?"captured.name AS captured_class,r.college AS captured_college,r.withdrawn,r.source AS scope_source":"b.name AS captured_class,b.college AS captured_college,FALSE AS withdrawn,'LEGACY_CLASS' AS scope_source";
        String columns="SELECT a.lesson_id,a.student_id,a.student_number,a.student_name,a.status,c.name AS course_name,l.starts_at,l.ends_at,l.cancelled,COALESCE(NULLIF(teacher.nickname,''),teacher.username,'教师账号未绑定') AS teacher_name,"+captured+","+r.base()+" AS retention_base,";
        columns+=history?"h.id AS row_id,h.old_status,h.new_status,h.reason,COALESCE(NULLIF(actor.nickname,''),actor.username,'历史操作账号') AS actor_name":"'' AS row_id,'' AS old_status,'' AS new_status,'' AS reason,'' AS actor_name";
        String order=history?"h.recorded_at DESC,h.id DESC":"l.starts_at,a.lesson_id,a.student_number,a.student_id";
        args.add(limit);args.add(offset);
        return db.query(columns+r.from()+where+" ORDER BY "+order+" LIMIT ? OFFSET ?",(result,n)->{
            Instant start=result.getTimestamp("starts_at").toInstant(),end=result.getTimestamp("ends_at").toInstant(),base=result.getTimestamp("retention_base").toInstant(),until=base.atZone(TeachingService.ZONE).plusYears(1).toInstant();
            String lesson=result.getString("lesson_id"),student=result.getString("student_id");
            return new Row(history?result.getString("row_id"):lesson+":"+student,lesson,student,result.getString("student_number"),result.getString("student_name"),result.getString("course_name"),result.getString("teacher_name"),result.getString("captured_class"),result.getString("captured_college"),start,end,result.getString("status"),result.getString("old_status"),result.getString("new_status"),result.getString("reason"),result.getString("actor_name"),base,until,!until.isAfter(clock.instant()),result.getBoolean("withdrawn"),result.getBoolean("cancelled"),result.getString("scope_source"));
        },args.toArray());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Page page(long user,Filter input,int page,int size){
        if(page<0 || page>10000 || size<1 || size>100)throw error(400,"页码无效，每页限1至100条");
        Filter f=normalized(input);Relation r=relation(user,f);
        int all=db.queryForObject("SELECT COUNT(*)"+r.from()+r.where(),Integer.class,r.args().toArray());
        var args=parameters(r);args.add(Timestamp.from(clock.instant()));
        int due=db.queryForObject("SELECT COUNT(*)"+r.from()+r.where()+expiredClause(r),Integer.class,args.toArray());
        int total=f.expiredOnly()?due:all,pages=(total+size-1)/size;
        if(page>0 && page>=pages)throw error(400,"这一页已变化，请从第一页重新读取");
        return new Page(f,rows(r,f,size,page*size),page,size,total,pages,all,due,1,false);
    }
    private byte[] csv(long user,Filter f){
        Relation r=relation(user,f);var values=rows(r,f,EXPORT_LIMIT+1,0);
        if(values.size()>EXPORT_LIMIT)throw error(400,"导出超过2000条，请缩小日期或班级范围；未截断导出");
        if(values.isEmpty())throw error(400,"当前范围没有可导出记录");
        var out=new StringBuilder("\uFEFF");
        line(out,List.of("Campthink 授权考勤证据",f.kind(),f.view(),f.from().toString(),f.to().toString(),f.classId(),f.expiredOnly()?"仅到期候选":"完整选定范围"));
        line(out,List.of("学校保留期：一年","到期仅待归档核验，不表示已归档或已删除","考勤保留截止按下课与最后变更的较晚时间计算"));
        line(out,List.of("记录编号","安排编号","人员编号","学号（文本）","姓名","课程","任课教师","历史行政班","历史学院","上课时间","下课时间","当前状态","原状态","新状态","原因","操作人","保留计算起点","保留至","到期候选","已撤未来名单","安排已取消","归属来源"));
        for(Row row:values)line(out,List.of(row.id(),row.lessonId(),row.studentId(),"'"+row.studentNumber(),row.studentName(),row.course(),row.teacher(),row.className(),row.college(),row.startsAt().toString(),row.endsAt().toString(),row.status(),row.oldStatus(),row.newStatus(),row.reason(),row.actorName(),row.retentionBaseAt().toString(),row.retainedUntil().toString(),row.eligible()?"待归档核验":"保留中",row.withdrawn()?"是":"否",row.cancelled()?"是":"否",row.scopeSource()));
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }
    private static void line(StringBuilder out,List<String> cells){
        var encoded=new ArrayList<String>();for(String value:cells){String v=value.replaceAll("[\\r\\n\\t]"," ");if(v.matches("^[\\s\\uFEFF]*[=+@-].*"))v="'"+v;encoded.add("\""+v.replace("\"","\"\"")+"\"");}out.append(String.join(",",encoded)).append("\r\n");
    }
    private static String hash(byte[] value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Preview preview(long user,Filter input){
        Filter f=normalized(input);byte[] bytes=csv(user,f);String sha=hash(bytes),token=UUID.randomUUID().toString();
        int count=new String(bytes,StandardCharsets.UTF_8).split("\r\n").length-3;Instant expires=clock.instant().plusSeconds(300);
        synchronized(previews){
            previews.entrySet().removeIf(e->!e.getValue().expires().isAfter(clock.instant()));
            while(previews.values().stream().filter(p->p.owner()==user).count()>=4){String oldest=previews.entrySet().stream().filter(e->e.getValue().owner()==user).findFirst().orElseThrow().getKey();previews.remove(oldest);}
            if(previews.size()>=1000)throw error(429,"当前导出准备较多，请稍后重试");
            previews.put(token,new Prepared(user,f,sha,count,expires));
        }
        return new Preview(token,f,count,EXPORT_LIMIT,sha,expires,1,false);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public Artifact download(long user,ExportRequest input){
        if(input==null || input.token()==null || !input.token().matches("[a-f0-9-]{36}"))throw error(400,"请先准备并核对导出范围");
        Prepared prepared;
        synchronized(previews){prepared=previews.get(input.token());}
        if(prepared==null || prepared.owner()!=user || !prepared.expires().isAfter(clock.instant()))throw error(410,"导出预览已失效，请重新准备；未下载旧范围");
        // Fresh normal authorization and evidence are read again; a preview never grants access.
        byte[] bytes=csv(user,prepared.filter());String actual=hash(bytes);
        if(!actual.equals(prepared.sha256()))throw error(409,"考勤或授权范围已变化，请重新核对导出；未返回旧文件");
        if(!prepared.expires().isAfter(clock.instant()))throw error(410,"导出准备已到期，请重新核对");
        return new Artifact(bytes,actual,"考勤证据-"+prepared.filter().from()+"-"+prepared.filter().to()+".csv");
    }
}
