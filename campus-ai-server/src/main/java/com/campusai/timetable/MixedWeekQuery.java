package com.campusai.timetable;

import com.campusai.teaching.TeachingService;
import org.springframework.jdbc.core.JdbcTemplate;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Bounded imported rows form a parameterized relation. Teaching rows stay in SQL until LIMIT. */
final class MixedWeekQuery {
    record Result(List<UnifiedTimetableService.Entry> entries,int total,int planned,int today,int conflicts,int merged,TeachingService.ScopeSummary attendance) {}
    private final JdbcTemplate db;private final TeachingService teaching;
    MixedWeekQuery(JdbcTemplate db,TeachingService teaching){this.db=db;this.teaching=teaching;}
    private static String exact(String a,String b){return "CAST("+a+".course_name AS BINARY(400))=CAST("+b+".course_name AS BINARY(400)) AND CAST("+a+".room AS BINARY(400))=CAST("+b+".room AS BINARY(400)) AND "+a+".starts_at="+b+".starts_at AND "+a+".ends_at="+b+".ends_at";}
    private static String teacherMatch(String formal,String personal){return "("+personal+".teacher_name='' OR CAST(TRIM("+formal+".teacher_name) AS BINARY(400))=CAST(TRIM("+personal+".teacher_name) AS BINARY(400)))";}
    private static String overlap(String a,String b){return a+".day_key="+b+".day_key AND "+a+".id<>"+b+".id AND "+a+".cancelled=FALSE AND "+b+".cancelled=FALSE AND (("+a+".starts_at IS NOT NULL AND "+b+".starts_at IS NOT NULL AND "+a+".starts_at<"+b+".ends_at AND "+b+".starts_at<"+a+".ends_at) OR (("+a+".starts_at IS NULL OR "+b+".starts_at IS NULL) AND "+a+".sp IS NOT NULL AND "+b+".sp IS NOT NULL AND "+a+".sp<="+b+".ep AND "+b+".sp<="+a+".ep))";}
    private static String slot(boolean useBell,boolean end){
        if(!useBell)return "CAST(NULL AS SIGNED)";
        var sql=new StringBuilder("CASE");
        for(var bell:CampusBellSchedule.SLOTS){String time=end?bell.end():bell.start();int minutes=LocalTime.parse(time).getHour()*60+LocalTime.parse(time).getMinute();sql.append(" WHEN t.").append(end?"ends_at":"starts_at").append("=TIMESTAMPADD(MINUTE,").append(minutes).append(",d.lo) THEN ").append(bell.period());}
        return sql.append(" ELSE NULL END").toString();
    }
    Result read(long user,String view,LocalDate monday,String classId,CourseScheduleService.Snapshot snapshot,boolean useBell,Clock clock,int page,int size) {
        var relation=teaching.ownLessonRelation(user,view,monday,monday.plusDays(6),classId);
        var personal=new LinkedHashMap<String,UnifiedTimetableService.Entry>();int internalDuplicates=0;
        boolean review=teaching.privateCopyNeedsReview(user,snapshot.checkedAt());
        for(int day=0;day<7;day++) {
            LocalDate date=monday.plusDays(day);int week=(int)Math.floorDiv(ChronoUnit.DAYS.between(snapshot.firstMonday(),date),7)+1;
            for(var course:snapshot.courses())if(course.weekday()==date.getDayOfWeek().getValue() && course.weeks().contains(week)) {
                var span=useBell?CampusBellSchedule.span(course.startPeriod(),course.endPeriod()):null;
                String a=course.startPeriod()==null?course.startTime():span==null?null:span.start(),b=course.startPeriod()==null?course.endTime():span==null?null:span.end();
                var mapped=useBell?CampusBellSchedule.exact(a,b):null;
                Integer sp=course.startPeriod()!=null?course.startPeriod():mapped==null?null:mapped.startPeriod(),ep=course.endPeriod()!=null?course.endPeriod():mapped==null?null:mapped.endPeriod();
                String key=course.name().trim()+"\u0000"+date+"\u0000"+(a==null?"period:"+sp:a)+"\u0000"+(b==null?"period:"+ep:b)+"\u0000"+course.room().trim()+"\u0000"+course.teacher().strip();
                String id=UUID.nameUUIDFromBytes((user+":"+snapshot.revision()+":"+date+":"+course).getBytes(StandardCharsets.UTF_8)).toString();
                var old=personal.get(key);var origins=new ArrayList<String>();if(old!=null){origins.addAll(old.originIds());internalDuplicates++;}origins.add(id);
                boolean pending=review && (a==null?!date.isBefore(LocalDate.now(clock.withZone(TeachingService.ZONE))):date.atTime(LocalTime.parse(a)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant()));
                personal.put(key,new UnifiedTimetableService.Entry(old==null?id:old.id(),null,date,course.weekday(),course.name(),course.room(),course.teacher(),"",a,b,sp,ep,a==null?"第"+sp+(Objects.equals(sp,ep)?"":"—"+ep)+"节（钟点待配置）":a+"—"+b,List.of("PERSONAL"),List.copyOf(origins),pending,false,false,null,null));
            }
        }
        var byId=new HashMap<String,UnifiedTimetableService.Entry>();personal.values().forEach(e->byId.put(e.id(),e));
        var args=new ArrayList<Object>();var days=new ArrayList<String>();
        for(int i=0;i<7;i++){var date=monday.plusDays(i);days.add("SELECT CAST(? AS DATE) AS day_key,CAST(? AS DATETIME) AS lo,CAST(? AS DATETIME) AS hi");Collections.addAll(args,java.sql.Date.valueOf(date),Timestamp.from(date.atStartOfDay(TeachingService.ZONE).toInstant()),Timestamp.from(date.plusDays(1).atStartOfDay(TeachingService.ZONE).toInstant()));}
        args.addAll(relation.args());var imports=new ArrayList<String>();
        Collection<UnifiedTimetableService.Entry> values=personal.values();
        for(var e:values){imports.add("SELECT CAST(? AS CHAR(36)) AS id,TRIM(CAST(? AS CHAR(100))) AS course_name,TRIM(CAST(? AS CHAR(100))) AS room,TRIM(CAST(? AS CHAR(100))) AS teacher_name,CAST(? AS DATE) AS day_key,CAST(? AS DATETIME) AS starts_at,CAST(? AS DATETIME) AS ends_at,CAST(? AS SIGNED) AS sp,CAST(? AS SIGNED) AS ep,CAST(? AS SIGNED) AS cancelled");Collections.addAll(args,e.id(),e.name(),e.room(),e.teacher(),java.sql.Date.valueOf(e.date()),e.startTime()==null?null:Timestamp.from(e.date().atTime(LocalTime.parse(e.startTime())).atZone(TeachingService.ZONE).toInstant()),e.endTime()==null?null:Timestamp.from(e.date().atTime(LocalTime.parse(e.endTime())).atZone(TeachingService.ZONE).toInstant()),e.startPeriod(),e.endPeriod(),e.cancelled()?1:0);}
        if(imports.isEmpty())imports.add("SELECT CAST(NULL AS CHAR(36)) AS id,CAST(NULL AS CHAR(100)) AS course_name,CAST(NULL AS CHAR(100)) AS room,CAST(NULL AS CHAR(100)) AS teacher_name,CAST(NULL AS DATE) AS day_key,CAST(NULL AS DATETIME) AS starts_at,CAST(NULL AS DATETIME) AS ends_at,CAST(NULL AS SIGNED) AS sp,CAST(NULL AS SIGNED) AS ep,0 AS cancelled WHERE 1=0");
        String cte="WITH d AS ("+String.join(" UNION ALL ",days)+"),raw_t AS ("+relation.sql()+"),t AS (SELECT t.id,t.course_name,t.room,t.teacher_name,d.day_key,t.starts_at,t.ends_at,t.cancelled,"+slot(useBell,false)+" AS sp,"+slot(useBell,true)+" AS ep FROM raw_t t JOIN d ON t.starts_at>=d.lo AND t.starts_at<d.hi),p AS ("+String.join(" UNION ALL ",imports)+"),matched AS (SELECT t.id AS tid,p.id AS pid FROM t JOIN p ON "+exact("t","p")+" AND "+teacherMatch("t","p")+" WHERE (SELECT COUNT(*) FROM t twin WHERE "+exact("twin","p")+")=1 AND (SELECT COUNT(*) FROM p peer WHERE "+exact("t","peer")+" AND "+teacherMatch("t","peer")+")=1),m AS (SELECT t.id,t.day_key,t.starts_at,t.ends_at,t.sp,t.ep,t.cancelled,matched.pid FROM t LEFT JOIN matched ON matched.tid=t.id UNION ALL SELECT p.id,p.day_key,p.starts_at,p.ends_at,p.sp,p.ep,p.cancelled,p.id AS pid FROM p WHERE NOT EXISTS(SELECT 1 FROM matched WHERE matched.pid=p.id)) ";
        int total=db.queryForObject(cte+"SELECT COUNT(*) FROM m",Integer.class,args.toArray());int pages=(total+size-1)/size;
        if(page>0 && page>=pages)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"这一页已变化，请返回第一页");
        var statsArgs=new ArrayList<>(args);statsArgs.add(java.sql.Date.valueOf(LocalDate.now(clock.withZone(TeachingService.ZONE))));
        var stats=db.queryForMap(cte+"SELECT COALESCE(SUM(CASE WHEN cancelled=FALSE THEN 1 ELSE 0 END),0) AS planned,COALESCE(SUM(CASE WHEN cancelled=FALSE AND day_key=? THEN 1 ELSE 0 END),0) AS today,(SELECT COUNT(*) FROM matched) AS merged,(SELECT COUNT(*) FROM m a WHERE EXISTS(SELECT 1 FROM m b WHERE "+overlap("a","b")+")) AS conflicts FROM m",statsArgs.toArray());
        var pageArgs=new ArrayList<>(args);pageArgs.add(size);pageArgs.add(page*size);
        record Located(String id,String personalId,boolean conflict) {}
        var located=db.query(cte+"SELECT a.id,a.pid,EXISTS(SELECT 1 FROM m b WHERE "+overlap("a","b")+") AS conflict FROM m a ORDER BY a.day_key,CASE WHEN a.starts_at IS NULL THEN 1 ELSE 0 END,a.starts_at,a.id LIMIT ? OFFSET ?",(r,n)->new Located(r.getString(1),r.getString(2),r.getBoolean(3)),pageArgs.toArray());
        var ids=located.stream().filter(r->!byId.containsKey(r.id())).map(Located::id).toList();
        var lessons=new HashMap<String,TeachingService.Lesson>();teaching.ownLessonsByIds(user,view,monday,monday.plusDays(6),classId,ids).forEach(l->lessons.put(l.id(),l));
        var entries=new ArrayList<UnifiedTimetableService.Entry>();
        for(var row:located) {
            var p=byId.get(row.personalId());var l=lessons.get(row.id());
            if(l==null){var e=byId.get(row.id());entries.add(new UnifiedTimetableService.Entry(e.id(),null,e.date(),e.weekday(),e.name(),e.room(),e.teacher(),"",e.startTime(),e.endTime(),e.startPeriod(),e.endPeriod(),e.timeLabel(),e.sources(),e.originIds(),e.cancelled(),row.conflict(),false,null,null));continue;}
            var a=l.startsAt().atZone(TeachingService.ZONE);var b=l.endsAt().atZone(TeachingService.ZONE);String start=a.toLocalTime().toString(),end=b.toLocalTime().toString();var mapped=useBell?CampusBellSchedule.exact(start,end):null;
            var origins=new ArrayList<String>();if(p!=null)origins.addAll(p.originIds());origins.add(l.id());var counts=l.counts();String attendance=counts.onTime()>0?"ON_TIME":counts.late()>0?"LATE":counts.absent()>0?"ABSENT":counts.excused()>0?"EXCUSED":counts.earlyLeave()>0?"EARLY_LEAVE":counts.total()==0?null:"UNKNOWN";
            entries.add(new UnifiedTimetableService.Entry(l.id(),l.id(),a.toLocalDate(),a.getDayOfWeek().getValue(),l.course(),l.room(),l.teacher(),l.className(),start,end,mapped==null?null:mapped.startPeriod(),mapped==null?null:mapped.endPeriod(),start+"—"+end,p==null?List.of("TEACHING"):List.of("PERSONAL","TEACHING"),List.copyOf(origins),l.cancelled(),row.conflict(),"TEACHER".equals(view)&&!l.cancelled()&&!clock.instant().isBefore(l.startsAt().minusSeconds(300)),"STUDENT".equals(view)?attendance:null,counts));
        }
        var full=teaching.lessonPage(user,view,monday,monday.plusDays(6),classId,0,1);
        return new Result(List.copyOf(entries),total,((Number)stats.get("planned")).intValue(),((Number)stats.get("today")).intValue(),((Number)stats.get("conflicts")).intValue(),internalDuplicates+((Number)stats.get("merged")).intValue(),full.summary());
    }
}
