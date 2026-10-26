package com.campusai.timetable;

import com.campusai.teaching.TeachingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Read model. Joining sources never writes/deletes personal imports or changes teaching membership. */
@Service
public class UnifiedTimetableService {
    private final JdbcTemplate db;
    private final CourseScheduleService personal;
    private final TeachingService teaching;
    private final long bellSchool;
    private final Clock clock;
    @Autowired public UnifiedTimetableService(JdbcTemplate db,CourseScheduleService personal,TeachingService teaching,@Value("${app.timetable.bell-school-id:1}") long bellSchool) {
        this(db,personal,teaching,bellSchool,Clock.systemUTC());
    }
    public UnifiedTimetableService(JdbcTemplate db,CourseScheduleService personal,TeachingService teaching,long bellSchool,Clock clock) {
        this.db=db; this.personal=personal; this.teaching=teaching; this.bellSchool=bellSchool; this.clock=clock;
    }
    public record Entry(String id,String lessonId,LocalDate date,int weekday,String name,String room,String teacher,String className,
            String startTime,String endTime,Integer startPeriod,Integer endPeriod,String timeLabel,List<String> sources,List<String> originIds,
            boolean cancelled,boolean conflict,boolean canMark,String attendance,TeachingService.Counts counts) {}
    public record Summary(int plannedClasses,int todayClasses,int conflicts,int mergedDuplicates,int personalRevision,int absentStudents,TeachingService.Counts attendance) {}
    public record Week(int version,LocalDate monday,LocalDate sunday,LocalDate today,Instant now,String view,List<String> views,
            List<TeachingService.ClassOption> classes,List<CampusBellSchedule.Slot> bells,String clockSource,boolean teachingEnabled,
            List<Entry> entries,Summary summary,Entry next,Entry attention,String focusLabel,boolean gridSafe,List<TeachingService.Notice> notices,List<String> warnings) {}
    public record DayAnswer(LocalDate date,String source,String answer) {}
    /** Bootstrap authorization without reading any private schedule, roster, lesson or statistic. */
    public record Scopes(int version,String view,List<String> views,List<TeachingService.ClassOption> classes,
            boolean teachingEnabled,boolean viewHasTeaching) {}
    public record ScopePage(Scopes scopes,int page,int size,int total,int totalPages) {}
    public record WeekPage(Week week,int page,int size,int total,int totalPages,String summaryScope) {}
    private record ScopeContext(long school,Scopes scopes) {}

    private ScopeContext scopeContext(long user,String requestedView) {
        return scopeContext(user,requestedView,false);
    }
    private ScopeContext scopeContext(long user,String requestedView,boolean paged) {
        var schools=db.queryForList("SELECT school_id FROM users WHERE id=? AND status=1",Long.class,user);
        if(schools.isEmpty() || schools.get(0)==null || schools.get(0)<=0) throw error(403,"账号不可用");
        var access=teaching.access(user); List<String> views=new ArrayList<>(); views.add("STUDENT");
        for(String v:access.views()) if(!views.contains(v)) views.add(v);
        String preferred=access.views().contains("STUDENT")?"STUDENT":access.views().isEmpty()?"STUDENT":access.views().get(0);
        String view=requestedView==null || requestedView.isBlank()?preferred:requestedView;
        if(!views.contains(view)) throw error(403,"没有此教学视图权限");
        boolean hasTeaching=access.enabled() && access.views().contains(view);
        // The legacy API remains complete-or-error. New endpoints obtain navigation through its own page.
        var classes=hasTeaching && !paged?teaching.classesForView(user,view):List.<TeachingService.ClassOption>of();
        return new ScopeContext(schools.get(0),new Scopes(1,view,List.copyOf(views),List.copyOf(classes),access.enabled(),hasTeaching));
    }
    public Scopes scopes(long user,String requestedView) { return scopeContext(user,requestedView).scopes(); }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ScopePage scopePage(long user,String view,int page,int size,String search) {
        var context=scopeContext(user,view,true);var scope=context.scopes();
        if(page<0 || page>10000 || size<1 || size>100) throw error(400,"页码无效，每页限1至100条");
        var classes=scope.viewHasTeaching()?teaching.classPage(user,scope.view(),page,size,search):new TeachingService.ClassPage(List.of(),0,size,0,0);
        if(!scope.viewHasTeaching() && page!=0) throw error(400,"没有可翻页的教学班级");
        return new ScopePage(new Scopes(1,scope.view(),scope.views(),classes.items(),scope.teachingEnabled(),scope.viewHasTeaching()),page,size,classes.total(),classes.totalPages());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public WeekPage page(long user,String view,LocalDate monday,String classId,int page,int size) {
        if(page<0 || page>10000 || size<1 || size>100) throw error(400,"页码无效，每页限1至100条");
        var context=scopeContext(user,view,true);var scope=context.scopes();
        if(monday==null) monday=LocalDate.now(clock.withZone(TeachingService.ZONE)).with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        if(monday.getDayOfWeek()!=DayOfWeek.MONDAY || monday.getYear()<2000 || monday.getYear()>2100) throw error(400,"请选择2000至2100年的周一");
        var snapshot=scope.viewHasTeaching() && Set.of("STUDENT","TEACHER").contains(scope.view())?personal.forWeek(user,monday).schedule():null;
        if(snapshot!=null) {
            boolean useBell=context.school()==bellSchool;var result=new MixedWeekQuery(db,teaching).read(user,scope.view(),monday,classId,snapshot,useBell,clock,page,size);
            int pages=(result.total()+size-1)/size;var entries=result.entries();LocalDate today=LocalDate.now(clock.withZone(TeachingService.ZONE));
            Entry next=pages<=1?entries.stream().filter(e->!e.cancelled && e.endTime!=null && (!"TEACHER".equals(scope.view()) || e.lessonId!=null) && e.date.atTime(LocalTime.parse(e.endTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())).findFirst().orElse(null):null;
            var pending=pages<=1 && "TEACHER".equals(scope.view())?entries.stream().filter(e->e.canMark && e.date.equals(today) && e.counts!=null && e.counts.unknown()>0).toList():List.<Entry>of();
            Entry attention=pending.stream().filter(e->e.endTime!=null && e.date.atTime(LocalTime.parse(e.endTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())).findFirst().orElse(pending.isEmpty()?null:pending.get(0));
            var warnings=new ArrayList<String>();if(result.conflicts()>0)warnings.add("有"+result.conflicts()+"项时间重叠；统计覆盖全部来源与分页，没有自动删课。");
            if(teaching.privateCopyNeedsReview(user,snapshot.checkedAt()))warnings.add("学籍变动后的旧个人副本待核对，不作为未来有效安排；原件与历史保留。重新核对不恢复教学选课权限。");
            if(entries.stream().anyMatch(e->e.cancelled() && e.sources().size()>1))warnings.add("教学取消的课程已标记；原个人导入没有修改，需重新核对。");
            Week week=new Week(1,monday,monday.plusDays(6),today,clock.instant(),scope.view(),scope.views(),List.of(),useBell?CampusBellSchedule.SLOTS:List.of(),useBell?"用户提供的作息，2026-10-14；第5—8节按下午":"本校作息尚未配置",scope.teachingEnabled(),entries,
                    new Summary(result.planned(),result.today(),result.conflicts(),result.merged(),snapshot.revision(),result.attendance().absentStudents(),result.attendance().counts()),next,attention,attention!=null?"今天待完成点名":next==null?"":!next.date.atTime(LocalTime.parse(next.startTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())?"正在上课":"下一节安排",pages<=1 && gridSafe(entries,result.planned(),useBell),teaching.notices(user),List.copyOf(warnings));
            return new WeekPage(week,page,size,result.total(),pages,"本人完整混合来源；SQL合并去重后分页，统计不是本页小计");
        }
        boolean ownTeaching=scope.viewHasTeaching() && Set.of("STUDENT","TEACHER").contains(scope.view());
        if(Set.of("COUNSELOR","SECRETARY").contains(scope.view()) || ownTeaching) {
            var lessons=teaching.lessonPage(user,scope.view(),monday,monday.plusDays(6),classId,page,size);
            boolean useBell=context.school()==bellSchool;List<Entry> entries=new ArrayList<>();
            for(var l:lessons.items()) {
                var start=l.startsAt().atZone(TeachingService.ZONE);var end=l.endsAt().atZone(TeachingService.ZONE);
                String a=start.toLocalTime().toString(),b=end.toLocalTime().toString();var slot=useBell?CampusBellSchedule.exact(a,b):null;
                entries.add(new Entry(l.id(),l.id(),start.toLocalDate(),start.getDayOfWeek().getValue(),l.course(),l.room(),l.teacher(),l.className(),a,b,
                        slot==null?null:slot.startPeriod(),slot==null?null:slot.endPeriod(),a+"—"+b,List.of("TEACHING"),List.of(l.id()),l.cancelled(),lessons.conflictIds().contains(l.id()),
                        "TEACHER".equals(scope.view()) && !l.cancelled() && !clock.instant().isBefore(l.startsAt().minusSeconds(300)),"STUDENT".equals(scope.view())?ownStatus(l.counts()):null,l.counts()));
            }
            boolean completeOwn=ownTeaching && lessons.totalPages()<=1;
            LocalDate today=LocalDate.now(clock.withZone(TeachingService.ZONE));
            Entry next=completeOwn?entries.stream().filter(e->!e.cancelled && e.endTime!=null && e.date.atTime(LocalTime.parse(e.endTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())).findFirst().orElse(null):null;
            var pending=completeOwn && "TEACHER".equals(scope.view())?entries.stream().filter(e->e.canMark && e.date.equals(today) && e.counts.unknown()>0).toList():List.<Entry>of();
            Entry attention=pending.stream().filter(e->e.date.atTime(LocalTime.parse(e.endTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())).findFirst().orElse(pending.isEmpty()?null:pending.get(0));
            String label=attention!=null?"今天待完成点名":next==null?"":!next.date.atTime(LocalTime.parse(next.startTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())?"正在上课":"下一节安排";
            Week week=new Week(1,monday,monday.plusDays(6),LocalDate.now(clock.withZone(TeachingService.ZONE)),clock.instant(),scope.view(),scope.views(),scope.classes(),
                    useBell?CampusBellSchedule.SLOTS:List.of(),useBell?"用户提供的作息，2026-10-14；第5—8节按下午":"本校作息尚未配置",scope.teachingEnabled(),List.copyOf(entries),
                    new Summary(lessons.planned(),lessons.today(),lessons.conflicts(),0,0,lessons.summary().absentStudents(),lessons.summary().counts()),next,attention,label,completeOwn && gridSafe(entries,lessons.planned(),useBell),ownTeaching?teaching.notices(user):List.of(),
                    lessons.conflicts()>0?List.of("有"+lessons.conflicts()+"项时间冲突，请按班级核对；汇总覆盖完整筛选范围。"):List.of());
            return new WeekPage(week,page,size,lessons.total(),lessons.totalPages(),ownTeaching?"本人完整筛选范围；不是本页小计":"全部已授权筛选范围；不是本页小计");
        }
        // Private/student and teacher calendars retain their exact merge/conflict semantics.
        Week whole=week(user,scope.view(),monday,classId);int total=whole.entries().size(),pages=(total+size-1)/size;
        if(page>0 && page>=pages) throw error(400,"这一页已不存在，请返回第一页重新读取");
        var entries=whole.entries().subList(Math.min(page*size,total),Math.min((page+1)*size,total));
        Set<String> ids=new HashSet<>(entries.stream().map(Entry::id).toList());
        var next=whole.next()!=null && ids.contains(whole.next().id())?whole.next():null;
        var attention=whole.attention()!=null && ids.contains(whole.attention().id())?whole.attention():null;
        Week partial=new Week(whole.version(),whole.monday(),whole.sunday(),whole.today(),whole.now(),whole.view(),whole.views(),whole.classes(),whole.bells(),whole.clockSource(),whole.teachingEnabled(),List.copyOf(entries),whole.summary(),next,attention,next==null && attention==null?"":whole.focusLabel(),pages<=1 && whole.gridSafe(),whole.notices(),whole.warnings());
        return new WeekPage(partial,page,size,total,pages,"本人完整筛选范围；不是本页小计");
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Week week(long user,String requestedView,LocalDate monday,String classId) {
        ScopeContext context=scopeContext(user,requestedView); Scopes scope=context.scopes();
        if(monday==null) monday=LocalDate.now(clock.withZone(TeachingService.ZONE)).with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        if(monday.getDayOfWeek()!=DayOfWeek.MONDAY || monday.getYear()<2000 || monday.getYear()>2100) throw error(400,"请选择2000至2100年的周一");
        LocalDate sunday=monday.plusDays(6),today=LocalDate.now(clock.withZone(TeachingService.ZONE));
        List<String> views=scope.views(); String view=scope.view(); boolean hasTeaching=scope.viewHasTeaching();
        if(classId!=null && !classId.isBlank() && !hasTeaching) throw error(403,"未绑定教学班级，不能筛选其他班级");
        List<TeachingService.Lesson> lessons=hasTeaching?teaching.lessons(user,view,monday,sunday,classId):List.of();
        List<TeachingService.ClassOption> classes=scope.classes();
        boolean useBell=context.school()==bellSchool;
        List<Entry> entries=new ArrayList<>(); List<String> warnings=new ArrayList<>();
        CourseScheduleService.Snapshot snapshot=Set.of("STUDENT","TEACHER").contains(view)?personal.forWeek(user,monday).schedule():null;
        boolean review=snapshot!=null && teaching.privateCopyNeedsReview(user,snapshot.checkedAt());
        if(review)warnings.add("学籍变动后的旧个人副本待核对，不作为未来有效安排；原件与历史保留。重新核对不恢复教学选课权限。");
        if(snapshot!=null) for(int day=0;day<7;day++) {
            LocalDate date=monday.plusDays(day); int week=(int)Math.floorDiv(ChronoUnit.DAYS.between(snapshot.firstMonday(),date),7)+1;
            for(var c:snapshot.courses()) if(c.weekday()==date.getDayOfWeek().getValue() && c.weeks().contains(week)) {
                var span=useBell?CampusBellSchedule.span(c.startPeriod(),c.endPeriod()):null;
                String start=c.startPeriod()==null?c.startTime():span==null?null:span.start();
                String end=c.startPeriod()==null?c.endTime():span==null?null:span.end();
                var exact=useBell?CampusBellSchedule.exact(start,end):null;
                Integer a=c.startPeriod()!=null?c.startPeriod():exact==null?null:exact.startPeriod();
                Integer b=c.endPeriod()!=null?c.endPeriod():exact==null?null:exact.endPeriod();
                String label=start==null?"第"+a+(Objects.equals(a,b)?"":"—"+b)+"节（钟点待配置）":start+"—"+end;
                String id=UUID.nameUUIDFromBytes((user+":"+snapshot.revision()+":"+date+":"+c).getBytes(StandardCharsets.UTF_8)).toString();
                boolean pending=review && (start==null?!date.isBefore(today):date.atTime(LocalTime.parse(start)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant()));
                entries.add(new Entry(id,null,date,c.weekday(),c.name(),c.room(),c.teacher(),"",start,end,a,b,label,List.of("PERSONAL"),List.of(id),pending,false,false,null,null));
            }
        }
        int merged=0;
        Map<String,Entry> uniquePersonal=new LinkedHashMap<>();
        for(Entry e:entries) {
            String personalKey=key(e)+"\u0000"+e.teacher().strip();Entry old=uniquePersonal.get(personalKey);
            if(old==null) uniquePersonal.put(personalKey,e);
            else { List<String> origins=new ArrayList<>(old.originIds); origins.addAll(e.originIds); uniquePersonal.put(personalKey,new Entry(old.id,null,old.date,old.weekday,old.name,old.room,old.teacher,old.className,old.startTime,old.endTime,old.startPeriod,old.endPeriod,old.timeLabel,old.sources,origins,old.cancelled,false,false,null,null)); merged++; }
        }
        entries=new ArrayList<>(uniquePersonal.values());
        Map<String,List<String>> lessonClasses=new HashMap<>();
        Map<String,Integer> matchCounts=new HashMap<>();
        for(var l:lessons) matchCounts.merge(key(l),1,Integer::sum);
        for(var l:lessons) {
            // Class names are unique within a college, not across all authorized colleges.
            lessonClasses.put(l.id(),List.of(l.college(),l.className()));
            LocalDate date=l.startsAt().atZone(TeachingService.ZONE).toLocalDate();
            String start=l.startsAt().atZone(TeachingService.ZONE).toLocalTime().toString(),end=l.endsAt().atZone(TeachingService.ZONE).toLocalTime().toString();
            var span=useBell?CampusBellSchedule.exact(start,end):null;
            String key=key(l.course(),date,start,end,l.room());
            int candidates=matchCounts.getOrDefault(key,0);
            int same=-1;
            if(candidates==1) {var matching=new ArrayList<Integer>();for(int i=0;i<entries.size();i++)if(entries.get(i).sources().equals(List.of("PERSONAL")) && key(entries.get(i)).equals(key) && (entries.get(i).teacher().isBlank() || entries.get(i).teacher().strip().equals(l.teacher().strip())))matching.add(i);if(matching.size()==1)same=matching.get(0);}
            List<String> origins=same>=0?List.of("PERSONAL","TEACHING"):List.of("TEACHING");
            List<String> originIds=new ArrayList<>(); if(same>=0) originIds.addAll(entries.get(same).originIds); originIds.add(l.id());
            if(same>=0) { entries.remove(same); merged++; }
            String attendance="STUDENT".equals(view)?ownStatus(l.counts()):null;
            entries.add(new Entry(l.id(),l.id(),date,date.getDayOfWeek().getValue(),l.course(),l.room(),l.teacher(),l.className(),start,end,
                    span==null?null:span.startPeriod(),span==null?null:span.endPeriod(),start+"—"+end,origins,List.copyOf(originIds),l.cancelled(),false,
                    "TEACHER".equals(view) && !l.cancelled() && !clock.instant().isBefore(l.startsAt().minusSeconds(300)),attendance,l.counts()));
            if(l.cancelled() && same>=0) warnings.add("教学取消的课程已标记；原个人导入没有修改，需重新核对。");
        }
        Set<Integer> conflicts=new HashSet<>();
        for(int i=0;i<entries.size();i++) for(int j=i+1;j<entries.size();j++) {
            Entry a=entries.get(i),b=entries.get(j);
            // Different classes in a college view can naturally share slots; they are not a student's conflict.
            List<String> classKey=lessonClasses.get(a.lessonId());
            boolean sameClass=classKey!=null && classKey.equals(lessonClasses.get(b.lessonId()));
            boolean leadershipRoster=teaching.rostersEnabled() && Set.of("COUNSELOR","SECRETARY").contains(view);
            boolean relevant=!leadershipRoster && (Set.of("STUDENT","TEACHER").contains(view) || sameClass);
            boolean overlap=a.startTime()!=null && b.startTime()!=null?a.startTime().compareTo(b.endTime())<0 && b.startTime().compareTo(a.endTime())<0:
                    a.startPeriod()!=null && b.startPeriod()!=null && a.startPeriod()<=b.endPeriod() && b.startPeriod()<=a.endPeriod();
            if(relevant && !a.cancelled() && !b.cancelled() && a.date().equals(b.date()) && overlap) { conflicts.add(i); conflicts.add(j); }
        }
        if(hasTeaching && teaching.rostersEnabled()) {
            Set<String> ids=teaching.rosterConflicts(user,view,lessons,classId);
            for(int i=0;i<entries.size();i++) if(entries.get(i).lessonId()!=null && ids.contains(entries.get(i).lessonId())) conflicts.add(i);
        }
        for(int i:conflicts) { Entry e=entries.get(i); entries.set(i,new Entry(e.id,e.lessonId,e.date,e.weekday,e.name,e.room,e.teacher,e.className,e.startTime,e.endTime,e.startPeriod,e.endPeriod,e.timeLabel,e.sources,e.originIds,e.cancelled,true,e.canMark,e.attendance,e.counts)); }
        entries.sort(Comparator.comparing(Entry::date).thenComparing(Entry::startTime,Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(Entry::id));
        var stats=hasTeaching?(classId==null || classId.isBlank()?teaching.summarize(user,view,lessons):teaching.summarize(user,view,lessons,classId)):new TeachingService.ScopeSummary(new TeachingService.Counts(0,0,0,0,0),0);
        int planned=(int)entries.stream().filter(e->!e.cancelled).count(),todayCount=(int)entries.stream().filter(e->!e.cancelled && e.date.equals(today)).count();
        Entry next=entries.stream().filter(e->!e.cancelled && e.endTime!=null && (!"TEACHER".equals(view) || e.lessonId!=null) && e.date.atTime(LocalTime.parse(e.endTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())).findFirst().orElse(null);
        var pending="TEACHER".equals(view)?entries.stream().filter(e->e.canMark && e.date.equals(today) && e.counts!=null && e.counts.unknown()>0).toList():List.<Entry>of();
        Entry attention=pending.stream().filter(e->e.endTime!=null && e.date.atTime(LocalTime.parse(e.endTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())).findFirst().orElse(pending.isEmpty()?null:pending.get(0));
        String focusLabel=attention!=null?"今天待完成点名":next==null?"":next.startTime!=null && !next.date.atTime(LocalTime.parse(next.startTime)).atZone(TeachingService.ZONE).toInstant().isAfter(clock.instant())?"正在上课":"下一节安排";
        // A whole-week grid must cover every active entry, without guessing unconfigured periods.
        // Even legitimate simultaneous classes in a leadership scope cannot overlap in one grid cell.
        boolean gridSafe=gridSafe(entries,planned,useBell);
        if(!conflicts.isEmpty()) warnings.add("有"+conflicts.size()+"项安排时间重叠，请核对来源；没有自动删课。");
        if(entries.stream().anyMatch(e->e.startTime==null)) warnings.add("部分节次没有已配置钟点，不能判断上课中或生成时间提醒。");
        return new Week(1,monday,sunday,today,clock.instant(),view,views,classes,useBell?CampusBellSchedule.SLOTS:List.of(),useBell?"用户提供的作息，2026-10-14；第5—8节按下午":"本校作息尚未配置",scope.teachingEnabled(),List.copyOf(entries),
                new Summary(planned,todayCount,conflicts.size(),merged,snapshot==null?0:snapshot.revision(),stats.absentStudents(),stats.counts()),next,attention,focusLabel,gridSafe,
                scope.teachingEnabled()?teaching.notices(user):List.of(),warnings.stream().distinct().toList());
    }
    private static boolean gridSafe(List<Entry> entries,int planned,boolean useBell) {
        var mapped=entries.stream().filter(e->!e.cancelled && e.startPeriod!=null && e.endPeriod!=null && e.startPeriod>=1 && e.endPeriod<=CampusBellSchedule.SLOTS.size()).toList();
        if(!useBell || mapped.isEmpty() || mapped.size()!=planned)return false;
        for(int i=0;i<mapped.size();i++)for(int j=i+1;j<mapped.size();j++) {
            Entry a=mapped.get(i),b=mapped.get(j);
            if(a.date.equals(b.date) && a.startPeriod<=b.endPeriod && b.startPeriod<=a.endPeriod)return false;
        }
        return true;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public ScheduleQueryEngine.Answer query(long user,LocalDate from,LocalDate to,String period,String selection,String detail,LocalDateTime anchor) {
        return query(user,from,to,period,selection,detail,anchor,"");
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public ScheduleQueryEngine.Answer query(long user,LocalDate from,LocalDate to,String period,String selection,String detail,LocalDateTime anchor,String course) {
        return query(user,from,to,period,selection,detail,anchor,course,"AUTO");
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public ScheduleQueryEngine.Answer query(long user,LocalDate from,LocalDate to,String period,String selection,String detail,LocalDateTime anchor,String course,String perspective) {
        var query=ScheduleQueryEngine.parse(from,to,period,selection,detail,anchor,course);
        if(perspective==null || !Set.of("AUTO","STUDENT","TEACHER").contains(perspective))throw error(400,"查询范围只能是本人默认课表、上课安排或授课安排");
        var access=teaching.access(user);
        if(perspective.equals("TEACHER") && (!access.enabled() || !access.views().contains("TEACHER")))
            throw error(403,"当前账号没有已授权授课范围；请由管理员核对任课绑定，不会改查学生课表或其他老师");
        // An administrator/leader's personal question never becomes an organization-wide query.
        String view=perspective.equals("AUTO")?(access.views().contains("STUDENT")?"STUDENT":access.views().contains("TEACHER")?"TEACHER":"STUDENT"):perspective;
        // Personal imports do not prove assignment. Explicit "I teach" does not read their contents at all.
        List<Entry> entries=perspective.equals("TEACHER")?readTeachingEntries(user,from,to):readOwnEntries(user,view,from,to);
        var hint=perspective.equals("TEACHER")?ScheduleQueryEngine.SourceHint.NONE:sourceHint(user,entries);
        return ScheduleQueryEngine.answer(query,entries,clock.instant(),new ScheduleQueryEngine.QueryScope(1,perspective,view),hint);
    }
    /** Called only after the authorized own read. Existence only: no image bytes,
     * image coverage inference, other owners, archived course titles or mutations. */
    private ScheduleQueryEngine.SourceHint sourceHint(long user,List<Entry> entries) {
        if(entries.stream().anyMatch(e->e.sources().contains("PERSONAL")))return ScheduleQueryEngine.SourceHint.NONE;
        boolean saved=Boolean.TRUE.equals(db.queryForObject("SELECT COUNT(*)>0 FROM student_course_schedules WHERE user_id=?",Boolean.class,user));
        if(!saved && personal.historyAvailable())
            saved=Boolean.TRUE.equals(db.queryForObject("SELECT COUNT(*)>0 FROM personal_schedule_terms WHERE owner_id=?",Boolean.class,user));
        if(saved)return ScheduleQueryEngine.SourceHint.SAVED_RECORD_WITHOUT_MATCH;
        boolean image=Boolean.TRUE.equals(db.queryForObject("SELECT COUNT(*)>0 FROM student_timetables WHERE user_id=?",Boolean.class,user));
        return image?ScheduleQueryEngine.SourceHint.IMAGE_ONLY:ScheduleQueryEngine.SourceHint.NONE;
    }
    private List<Entry> readTeachingEntries(long user,LocalDate from,LocalDate to) {
        var context=scopeContext(user,"TEACHER",true);
        var first=teaching.lessonPage(user,"TEACHER",from,to,null,0,100);
        if(first.total()>10000)throw error(400,"授课安排超过本次查询预算，请缩小日期范围；未返回截断结果");
        var entries=new ArrayList<Entry>();var seen=new HashSet<String>();
        for(int page=0;page<Math.max(1,first.totalPages());page++){
            var slice=page==0?first:teaching.lessonPage(user,"TEACHER",from,to,null,page,100);
            if(slice.total()!=first.total() || slice.totalPages()!=first.totalPages())throw error(409,"授课读取范围已变化，请重新查询");
            for(var lesson:slice.items()){
                if(!seen.add(lesson.id()))throw error(503,"授课来源编号重复，未返回不完整结果");
                var start=lesson.startsAt().atZone(TeachingService.ZONE);var end=lesson.endsAt().atZone(TeachingService.ZONE);
                String a=start.toLocalTime().toString(),b=end.toLocalTime().toString();
                var slot=context.school()==bellSchool?CampusBellSchedule.exact(a,b):null;
                entries.add(new Entry(lesson.id(),lesson.id(),start.toLocalDate(),start.getDayOfWeek().getValue(),lesson.course(),lesson.room(),lesson.teacher(),"",
                        a,b,slot==null?null:slot.startPeriod(),slot==null?null:slot.endPeriod(),a+"—"+b,List.of("TEACHING"),List.of(lesson.id()),
                        lesson.cancelled(),slice.conflictIds().contains(lesson.id()),false,null,null));
            }
        }
        return List.copyOf(entries);
    }
    /** Bounded page traversal under the caller's read snapshot, never the legacy 500-array route. */
    private List<Entry> readOwnEntries(long user,String view,LocalDate from,LocalDate to){
        var entries=new ArrayList<Entry>();var seen=new HashSet<String>();int scanned=0;
        for(LocalDate monday=from.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));!monday.isAfter(to);monday=monday.plusWeeks(1)){
            var first=page(user,view,monday,null,0,100);
            if(first.total()>10000 || scanned+first.total()>10000)throw error(400,"本人安排超过本次查询预算，请缩小日期范围；未返回截断结果");
            scanned+=first.total();
            for(int i=0;i<Math.max(1,first.totalPages());i++){
                var slice=i==0?first:page(user,view,monday,null,i,100);
                if(slice.total()!=first.total() || slice.totalPages()!=first.totalPages())throw error(409,"课表读取范围已变化，请重新查询");
                for(var e:slice.week().entries()){
                    if(!seen.add(e.id()))throw error(503,"课表来源编号重复，未返回不完整结果");
                    if(!e.date().isBefore(from) && !e.date().isAfter(to))entries.add(e);
                }
            }
        }
        return List.copyOf(entries);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=12)
    public DayAnswer day(long user,LocalDate date) {
        if(date==null) date=LocalDate.now(clock.withZone(TeachingService.ZONE));
        if(date.getYear()<2000 || date.getYear()>2100) throw error(400,"查询日期不在支持范围");
        var access=teaching.access(user);
        // "My classes" is not a leadership-wide attendance query, even when that is the default page view.
        String personalView=access.views().contains("STUDENT")?"STUDENT":access.views().contains("TEACHER")?"TEACHER":"STUDENT";
        var entries=readOwnEntries(user,personalView,date,date).stream().filter(e->!e.cancelled).toList();
        if(entries.size()>200)throw error(400,"当日结果超过200项，请使用按时段或课程筛选的查询；未截断课表");
        StringBuilder answer=new StringBuilder(date+"的课程安排：\n");
        if(entries.isEmpty()) answer.append("\n没有已保存的安排，不代表学校停课；可导入个人课表或由管理员绑定教学班级。");
        for(Entry e:entries) answer.append("\n- ").append(e.timeLabel).append(" ").append(e.name).append("；").append(e.room.isEmpty()?"教室未填写":e.room).append(e.teacher.isEmpty()?"；任课教师未绑定":"；任课教师："+e.teacher).append(e.conflict?"（时间重叠，请核对）":"");
        answer.append("\n\n来源：本人导入和已授权教学安排；不是实时教务同步，不推断考勤。");
        return new DayAnswer(date,"本人统一课表",answer.toString());
    }
    private static String ownStatus(TeachingService.Counts c) {
        if(c.total()==0) return null;
        if(c.onTime()>0) return "ON_TIME"; if(c.late()>0) return "LATE"; if(c.absent()>0) return "ABSENT"; if(c.excused()>0) return "EXCUSED"; if(c.earlyLeave()>0)return "EARLY_LEAVE"; return "UNKNOWN";
    }
    private static String key(Entry e) { return key(e.name,e.date,e.startTime==null?"period:"+e.startPeriod:e.startTime,e.endTime==null?"period:"+e.endPeriod:e.endTime,e.room); }
    private static String key(TeachingService.Lesson l) {
        var start=l.startsAt().atZone(TeachingService.ZONE); var end=l.endsAt().atZone(TeachingService.ZONE);
        return key(l.course(),start.toLocalDate(),start.toLocalTime().toString(),end.toLocalTime().toString(),l.room());
    }
    private static String key(String name,LocalDate date,String start,String end,String room) { return name.trim()+"\u0000"+date+"\u0000"+start+"\u0000"+end+"\u0000"+room.trim(); }
    private static ResponseStatusException error(int code,String message) { return new ResponseStatusException(HttpStatus.valueOf(code),message); }
}
