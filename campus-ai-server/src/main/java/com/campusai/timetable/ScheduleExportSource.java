package com.campusai.timetable;

import com.campusai.teaching.TeachingService;
import org.springframework.beans.factory.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.time.temporal.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** A bounded, authenticated read model. No student roster, attendance or account identifier enters a file. */
@Service
public class ScheduleExportSource {
    public static final int MAX_ROWS=2000,MAX_DAYS=210;
    private final JdbcTemplate db;private final CourseScheduleService personal;private final UnifiedTimetableService unified;private final TeachingService teaching;private final long bellSchool;
    public ScheduleExportSource(JdbcTemplate db,CourseScheduleService personal,UnifiedTimetableService unified,TeachingService teaching,@Value("${app.timetable.bell-school-id:1}") long bellSchool){this.db=db;this.personal=personal;this.unified=unified;this.teaching=teaching;this.bellSchool=bellSchool;}
    public record Filter(String source,String view,LocalDate from,LocalDate to,String classId,String period,String format,String search,boolean includeCancelled){}
    public record Row(String id,LocalDate date,String name,String room,String teacher,String className,String startTime,String endTime,String timeLabel,List<String> sources,boolean cancelled){}
    public record Access(List<String> sources,List<String> teachingViews,List<String> personalViews,List<String> formats,LocalDate defaultFrom,LocalDate defaultTo,int maxDays,int maxRows,int expiresSeconds){}
    public record Snapshot(Filter filter,String scopeLabel,List<Row> entries,List<String> warnings){}
    static ResponseStatusException error(int code,String message){return new ResponseStatusException(HttpStatus.valueOf(code),message);}
    private long school(long user){var rows=db.queryForList("SELECT school_id FROM users WHERE id=? AND status=1",Long.class,user);if(rows.isEmpty()||rows.get(0)==null||rows.get(0)<1)throw error(403,"账号不可用，未导出课表");return rows.get(0);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Access access(long user){
        school(user);var allowed=teaching.access(user);var views=new ArrayList<>(allowed.views());String platform=db.queryForObject("SELECT role FROM users WHERE id=?",String.class,user);
        if(allowed.enabled()&&"ADMIN".equals(platform))views.add("ADMIN");var sources=new ArrayList<>(List.of("MY","PERSONAL"));if(!views.isEmpty())sources.add("TEACHING");
        var personalViews=new ArrayList<>(List.of("STUDENT"));if(views.contains("TEACHER"))personalViews.add("TEACHER");var from=LocalDate.now(TeachingService.ZONE).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return new Access(List.copyOf(sources),List.copyOf(views),List.copyOf(personalViews),List.of("JSON","CSV","XLSX","PDF","ICS"),from,from.plusDays(6),MAX_DAYS,MAX_ROWS,300);
    }
    public static Filter normalize(Filter f){
        if(f==null||!Set.of("MY","PERSONAL","TEACHING").contains(f.source==null?"":f.source)||!Set.of("STUDENT","TEACHER","COUNSELOR","SECRETARY","ADMIN").contains(f.view==null?"":f.view)||!Set.of("JSON","CSV","XLSX","PDF","ICS").contains(f.format==null?"":f.format)||!Set.of("ALL","MORNING","AFTERNOON","EVENING").contains(f.period==null?"":f.period))throw error(400,"请选择课表来源、身份、时段和文件格式");
        if(f.from==null||f.to==null||f.from.getYear()<2000||f.to.getYear()>2100||f.to.isBefore(f.from)||ChronoUnit.DAYS.between(f.from,f.to)>=MAX_DAYS)throw error(400,"请选择2000至2100年的明确日期，每份最多210天");
        String chosen=f.classId==null?"":f.classId,q=f.search==null?"":f.search.trim();if(!chosen.isEmpty()&&!chosen.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")||q.length()>100||q.chars().anyMatch(Character::isISOControl))throw error(400,"班级或课程筛选条件无效");
        if(!"TEACHING".equals(f.source)&&(!chosen.isEmpty()||!Set.of("STUDENT","TEACHER").contains(f.view)))throw error(400,"本人课表不接受其他班级或领导身份");
        return new Filter(f.source,f.view,f.from,f.to,chosen,f.period,f.format,q,f.includeCancelled);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=25)
    public Snapshot read(long user,Filter raw){
        var f=normalize(raw);long school=school(user);var rights=access(user);String label;
        if("TEACHING".equals(f.source)){
            if(!rights.teachingViews.contains(f.view))throw error(403,"当前账号没有这个教学范围，未导出");label=Map.of("STUDENT","本人教学课程","TEACHER","本人任课课程","COUNSELOR","负责班级课程","SECRETARY","负责学院课程","ADMIN","本校教学安排").get(f.view);
            if(!f.classId.isEmpty()){var choice=teaching.governanceClasses(user,f.view,0,1,"",f.classId).selected();if(choice==null)throw error(403,"所选班级不在当前授权范围");label+=" · "+choice.description()+" · "+choice.label();}
        }else{if(!rights.personalViews.contains(f.view))throw error(403,"没有此本人课表身份");label="PERSONAL".equals(f.source)?"本人已保存的个人导入":"本人统一课表（个人导入与已授权教学合并）";}
        var rows=new ArrayList<Row>();var seen=new HashSet<String>();var warnings=new LinkedHashSet<String>();int scanned=0;
        if("PERSONAL".equals(f.source)){
            var saved=personal.get(user).schedule();if(saved!=null){label+=" · "+saved.semester();var courses=CourseScheduleService.validate(new CourseScheduleService.Input(saved.revision(),saved.semester(),saved.firstMonday(),saved.remindDays(),saved.courses()));int index=0;
                for(var c:courses){var span=school==bellSchool?CampusBellSchedule.span(c.startPeriod(),c.endPeriod()):null;String start=c.startPeriod()==null?c.startTime():span==null?null:span.start(),end=c.startPeriod()==null?c.endTime():span==null?null:span.end(),time=start==null?"第"+c.startPeriod()+"-"+c.endPeriod()+"节（钟点待配置）":start+"-"+end;
                    for(int week:c.weeks()){var date=saved.firstMonday().plusWeeks(week-1).plusDays(c.weekday()-1);String id=UUID.nameUUIDFromBytes((user+":"+saved.revision()+":"+index+":"+date).getBytes(StandardCharsets.UTF_8)).toString();add(rows,seen,new Row(id,date,c.name(),c.room(),c.teacher(),"",start,end,time,List.of("PERSONAL"),false),f);}index++;}
            }
        }else if("MY".equals(f.source)){
            var mine=personal.get(user).schedule();if(mine!=null)label+=" · 个人导入学期："+mine.semester();
            for(LocalDate monday=f.from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));!monday.isAfter(f.to);monday=monday.plusWeeks(1)){
                int page=0,pages;do{var result=unified.page(user,f.view,monday,null,page,100);if(result.total()>12000)throw error(400,"该周范围过大，请选择更小的课程范围；未截断导出");pages=result.totalPages();
                    for(var e:result.week().entries()){if(++scanned>12000)throw error(400,"读取范围过大，请缩小日期或改用班级筛选，未截断导出");add(rows,seen,new Row(e.id(),e.date(),e.name(),e.room(),e.teacher(),e.className(),e.startTime(),e.endTime(),e.timeLabel(),e.sources(),e.cancelled()),f);}warnings.addAll(result.week().warnings());page++;}while(page<pages);
            }
        }else{
            for(LocalDate start=f.from;!start.isAfter(f.to);start=start.plusDays(31)){var end=start.plusDays(30).isAfter(f.to)?f.to:start.plusDays(30);int page=0,total;
                do{var result=teaching.scheduleExportPage(user,f.view,start,end,f.classId,page);total=result.total();for(var e:result.items()){if(++scanned>12000)throw error(400,"完整读取超过12000项，请缩小日期或班级；未返回部分文件");add(rows,seen,lesson(e.id(),e.course(),e.room(),e.teacher(),e.className(),e.startsAt(),e.endsAt(),e.cancelled()),f);}
                    if(total>12000)throw error(400,"该期范围过大，请缩小日期或班级；未截断导出");page++;}while(page*100<total);
            }
        }
        rows.sort(Comparator.comparing(Row::date).thenComparing(Row::startTime,Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(Row::id));
        warnings.add("按所选日期生成的已保存安排快照，不代表教务整学期已齐或实时订阅；不包含学生名单、考勤、账号或登录信息。");
        if(rows.stream().anyMatch(r->r.startTime==null))warnings.add("部分节次没有核定钟点：可查看与导出表格，不能冒充已知时间生成ICS。");
        return new Snapshot(f,label,List.copyOf(rows),List.copyOf(warnings));
    }
    private static Row lesson(String id,String name,String room,String teacher,String group,Instant start,Instant end,boolean cancelled){var a=start.atZone(TeachingService.ZONE);var b=end.atZone(TeachingService.ZONE);return new Row(id,a.toLocalDate(),name,room,teacher,group,a.toLocalTime().toString(),b.toLocalTime().toString(),a.toLocalTime()+"-"+b.toLocalTime(),List.of("TEACHING"),cancelled);}
    private static void add(List<Row> out,Set<String> seen,Row row,Filter f){
        if(row.date.isBefore(f.from)||row.date.isAfter(f.to)||!f.includeCancelled&&row.cancelled)return;
        if(!"ALL".equals(f.period)){if(row.startTime==null)throw error(400,"此范围含未核定钟点，无法准确筛选上午或下午；请先配置作息或选择全天");int hour=LocalTime.parse(row.startTime).getHour();if(!switch(f.period){case"MORNING"->hour<12;case"AFTERNOON"->hour>=12&&hour<18;default->hour>=18;})return;}
        if(!f.search.isEmpty()&&!String.join(" ",row.name,row.room,row.teacher,row.className).toLowerCase(Locale.ROOT).contains(f.search.toLowerCase(Locale.ROOT)))return;
        if(!seen.add(row.id))throw error(503,"课表分页出现重复记录，未生成部分文件");out.add(row);if(out.size()>MAX_ROWS)throw error(400,"超过2000项课程，请缩小日期、课程或班级；未截断文件");
    }
}
