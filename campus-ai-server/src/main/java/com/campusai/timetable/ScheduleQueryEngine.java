package com.campusai.timetable;

import com.campusai.teaching.TeachingService;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** A bounded, deterministic projection of the owner's authorized timetable. No model or web search. */
public final class ScheduleQueryEngine {
    private ScheduleQueryEngine() {}
    public enum Period { ALL, AM, PM, EVENING }
    public enum Selection { ALL, NEXT, PREVIOUS, CURRENT, REMAINING, FIRST, LAST, AT }
    public enum Detail { SUMMARY, LOCATION, TEACHER, TIME, COUNT, COURSES, PERIODS, FREE, WAIT_START, WAIT_END, DURATION }
    public enum SourceHint { NONE, IMAGE_ONLY, SAVED_RECORD_WITHOUT_MATCH }
    public record Query(LocalDate from,LocalDate to,Period period,Selection selection,Detail detail,LocalDateTime anchor,String course) {
        public Query {
            course=course==null?"":course.strip();
            if(course.length()>100) throw bad("课程名称请控制在100字以内");
            if(from==null || to==null || from.getYear()<2000 || to.getYear()>2100 || to.isBefore(from) || ChronoUnit.DAYS.between(from,to)>13)
                throw bad("请选择2000至2100年内、最多14天的课表范围");
            if(period==null || selection==null || detail==null) throw bad("课表查询条件不完整");
            if(selection==Selection.AT && anchor==null) throw bad("请重新选择要追问的课程");
            if(anchor!=null && (anchor.toLocalDate().isBefore(from) || anchor.toLocalDate().isAfter(to) || !Set.of(Selection.NEXT,Selection.PREVIOUS,Selection.AT).contains(selection)))
                throw bad("课程定位不在本次查询范围内");
        }
    }
    /** Presentation is a whitelist projection, never the roster/attendance-bearing Entry record. */
    public record DisplayEntry(String id,LocalDate date,String name,String room,String teacher,String startTime,String endTime,
            Integer startPeriod,Integer endPeriod,String timeLabel,boolean conflict,List<String> sources) {}
    public record Display(int version,String state,String summary,List<DisplayEntry> entries,List<String> notices,List<LocalDate> freeDates) {}
    public record CourseRefinement(int version,List<String> courseChoices,int availableCount,boolean choicesComplete) {}
    public record QueryScope(int version,String requested,String resolved) {}
    public record Answer(int version,LocalDate from,LocalDate to,String period,String selection,String detail,LocalDateTime anchor,String course,
            Instant asOf,int count,int unknownTimes,LocalDateTime focus,String answer,Display display,CourseRefinement refinement,QueryScope queryScope) {}
    public static Query parse(LocalDate from,LocalDate to,String period,String selection,String detail,LocalDateTime anchor) {
        return parse(from,to,period,selection,detail,anchor,"");
    }
    public static Query parse(LocalDate from,LocalDate to,String period,String selection,String detail,LocalDateTime anchor,String course) {
        try { return new Query(from,to,Period.valueOf(period),Selection.valueOf(selection),Detail.valueOf(detail),anchor,course); }
        catch(IllegalArgumentException ex) { throw bad("不支持的课表查询条件"); }
    }
    private static LocalDateTime start(UnifiedTimetableService.Entry e) {
        try { return e.startTime()==null ? null : e.date().atTime(LocalTime.parse(e.startTime())); }
        catch(DateTimeException ex) { return null; }
    }
    private static LocalDateTime end(UnifiedTimetableService.Entry e) {
        try { return e.endTime()==null ? null : e.date().atTime(LocalTime.parse(e.endTime())); }
        catch(DateTimeException ex) { return null; }
    }
    private static String normalized(String value) {
        return java.text.Normalizer.normalize(value,java.text.Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}+#]","");
    }
    private static boolean abbreviation(String name,String hint) {
        if(hint.length()<2 || !hint.matches("[\\p{IsHan}]+")) return false;
        int i=0;for(int j=0;j<name.length() && i<hint.length();j++) if(name.charAt(j)==hint.charAt(i)) i++;
        return i==hint.length();
    }
    public static Answer answer(Query q,List<UnifiedTimetableService.Entry> source,Instant now) {
        return answer(q,source,now,null);
    }
    public static Answer answer(Query q,List<UnifiedTimetableService.Entry> source,Instant now,QueryScope scope) {
        return answer(q,source,now,scope,SourceHint.NONE);
    }
    public static Answer answer(Query q,List<UnifiedTimetableService.Entry> source,Instant now,QueryScope scope,SourceHint sourceHint) {
        boolean imageOnly=sourceHint==SourceHint.IMAGE_ONLY;
        String sourceNotice=switch(sourceHint){
            case NONE->"";
            case IMAGE_ONLY->"如需查询图片中的课程，请在完整课表导入课程数据，或核对图片识别结果后保存。本次未读取图片内容，也未确认它涵盖本次日期。";
            case SAVED_RECORD_WITHOUT_MATCH->"本账号存在已保存的个人课表记录，但本次日期内没有可查询的个人安排。可核对学期、周次或个人课表历史；不会用旧图片自动补课。";
        };
        LocalDateTime current=LocalDateTime.ofInstant(now,TeachingService.ZONE);
        long excluded=source.stream().filter(e->e.cancelled() && !e.date().isBefore(q.from()) && !e.date().isAfter(q.to())).count();
        var all=source.stream().filter(e->!e.cancelled() && !e.date().isBefore(q.from()) && !e.date().isAfter(q.to())).toList();
        String hint=normalized(q.course());
        if(!q.course().isBlank() && hint.isEmpty())throw bad("课程名称只有空白或标点，请使用课表中的课程名称");
        boolean equal=!hint.isEmpty() && all.stream().anyMatch(e->normalized(e.name()).equals(hint));
        boolean exact=!hint.isEmpty() && all.stream().anyMatch(e->normalized(e.name()).contains(hint));
        var inRange=hint.isEmpty()?all:all.stream().filter(e->equal?normalized(e.name()).equals(hint):exact?normalized(e.name()).contains(hint):abbreviation(normalized(e.name()),hint)).toList();
        boolean courseUnmatched=!hint.isEmpty() && inRange.isEmpty() && !all.isEmpty();
        int unknown=(int)inRange.stream().filter(e->start(e)==null || end(e)==null).count();
        boolean needsClock=timingDetail(q.detail()) || q.period()!=Period.ALL || !Set.of(Selection.ALL,Selection.FIRST,Selection.LAST).contains(q.selection());
        List<UnifiedTimetableService.Entry> selected=new ArrayList<>();
        for(var e:inRange) {
            var a=start(e); var b=end(e);
            if(needsClock && (a==null || b==null)) continue;
            if(q.period()!=Period.ALL) {
                int low=q.period()==Period.AM?0:q.period()==Period.PM?12:18;
                int high=q.period()==Period.AM?12:q.period()==Period.PM?18:24;
                if(!a.isBefore(e.date().plusDays(high==24?1:0).atTime(high==24?0:high,0)) || !b.isAfter(e.date().atTime(low,0))) continue;
            }
            boolean keep=switch(q.selection()) {
                case NEXT -> q.anchor()!=null?a.isAfter(q.anchor()):!a.isBefore(current);
                case PREVIOUS -> q.anchor()!=null?a.isBefore(q.anchor()):!b.isAfter(current);
                case CURRENT -> !a.isAfter(current) && b.isAfter(current);
                case REMAINING -> b.isAfter(current);
                case AT -> a.equals(q.anchor());
                default -> true;
            };
            if(keep) selected.add(e);
        }
        selected.sort(Comparator.comparing(UnifiedTimetableService.Entry::date)
                .thenComparing(e->start(e),Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(e->e.startPeriod(),Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(UnifiedTimetableService.Entry::id));
        // A missing clock on another day must not hide a known current/next lesson.
        var knownRows=selected.stream().filter(e->start(e)!=null && end(e)!=null).toList();
        LocalDate firstKnown=knownRows.isEmpty()?null:knownRows.get(0).date(),lastKnown=knownRows.isEmpty()?null:knownRows.get(knownRows.size()-1).date();
        LocalDate threshold=q.anchor()==null?current.toLocalDate():q.anchor().toLocalDate();
        long uncertain=inRange.stream().filter(e->start(e)==null || end(e)==null).filter(e->switch(q.selection()){
            case CURRENT->e.date().equals(current.toLocalDate());
            case NEXT->!e.date().isBefore(threshold) && (firstKnown==null || !e.date().isAfter(firstKnown));
            case PREVIOUS->!e.date().isAfter(threshold) && (lastKnown==null || !e.date().isBefore(lastKnown));
            case FIRST->firstKnown==null || !e.date().isAfter(firstKnown);
            case LAST->lastKnown==null || !e.date().isBefore(lastKnown);
            default->false;
        }).count();
        boolean orderUnknown=uncertain>0;
        if(orderUnknown) selected.clear(); // Unknown clock data must not masquerade as a reliable "next" answer.
        if(!selected.isEmpty() && Set.of(Selection.NEXT,Selection.PREVIOUS,Selection.FIRST,Selection.LAST).contains(q.selection())) {
            if(q.selection()==Selection.PREVIOUS && q.anchor()==null){
                var lastEnd=selected.stream().map(ScheduleQueryEngine::end).max(Comparator.naturalOrder()).orElseThrow();
                selected.removeIf(e->!Objects.equals(end(e),lastEnd));
            }else{
                var target=Set.of(Selection.PREVIOUS,Selection.LAST).contains(q.selection())?selected.get(selected.size()-1):selected.get(0);
                var at=start(target);
                selected.removeIf(e->!Objects.equals(start(e),at) || !e.date().equals(target.date())); // Keep concurrent alternatives.
            }
        }
        if(selected.size()>200) throw bad("结果超过200项安排，请缩小日期范围；没有截断后冒充完整课表");
        // An unparsed image may contain additional lessons. Do not manufacture
        // free dates from the known subset; the ordinary date query still lists it.
        if(imageOnly && q.detail()==Detail.FREE)selected.clear();
        var timing=timing(q,selected,current,unknown);
        String range=q.from().equals(q.to())?q.from().toString():q.from()+"至"+q.to();
        String part=switch(q.period()) { case AM->"上午";case PM->"下午";case EVENING->"晚上";default->""; };
        StringBuilder text=new StringBuilder(range+part+"的已保存课程：\n");
        if(!hint.isEmpty() && !inRange.isEmpty()) text.append("\n按").append(exact?"课程名":"简称候选").append("“").append(q.course()).append("”匹配已存课程").append(exact?"。":"，请核对完整名称；未替你认定简称。")
                .append(inRange.stream().map(UnifiedTimetableService.Entry::name).distinct().count()>1?"匹配到多个名称，未自动选定其中一个。":"").append("\n");
        if(courseUnmatched) text.append("\n该日期范围有").append(all.size()).append("项已保存安排，但未匹配到这个课程名称。请核对实际课程名称，或取消课程名限制重新查询；这不代表没有课。");
        else if(orderUnknown) text.append("\n有").append(uncertain).append("项可能影响本次定位的安排缺少钟点，暂不能准确定位这节课。请在课表页核对钟点后重试。");
        else if(imageOnly && selected.isEmpty())text.append("\n已保存旧课表图片，但还没有可直接查询的个人课程；不能据此判断无课。");
        else if(selected.isEmpty()) text.append(switch(q.selection()) {
            case NEXT->"\n这个范围内没有找到接下来的已保存课程。";
            case PREVIOUS->q.anchor()!=null?"\n这个范围内没有找到所选课程之前的已保存课程。":"\n这个范围内没有找到已经结束的已保存课程。";
            case CURRENT->"\n当前时刻没有匹配到正在上的已保存课程。";
            case REMAINING->"\n这个范围内没有尚未结束的已保存课程。";
            case AT->"\n之前定位的课程已经变更或不存在，请重新问一次下一节。";
            default->excluded>0?"\n这个范围内没有匹配的有效安排；已标记取消或待核对的条目不计入。":"\n这个范围内没有匹配的已保存安排。";
        });
        else {
            if(q.detail()==Detail.COUNT || q.detail()==Detail.FREE)
                text.append("\n共").append(selected.size()).append("项课程安排（连续多节的课程块按1项，不是课节总数）。\n");
            if(q.detail()==Detail.COURSES) text.append("\n共").append(selected.stream().map(UnifiedTimetableService.Entry::name).distinct().count()).append("门不同名称的课程，").append(selected.size()).append("项安排。\n");
            if(q.detail()==Detail.PERIODS) {
                int known=0,missing=0;
                for(var e:selected) {if(e.startPeriod()==null || e.endPeriod()==null) missing++;else known+=e.endPeriod()-e.startPeriod()+1;}
                text.append("\n").append(missing==0?"合计":"已知节次合计").append(known).append("节课（").append(selected.size()).append("项安排）");
                if(missing>0) text.append("，另有").append(missing).append("项缺少节次映射，不能冒充完整课节总数");
                text.append("。\n");
            }
            if(!Set.of(Detail.COUNT,Detail.COURSES,Detail.PERIODS).contains(q.detail())) {
                LocalDate shown=null;
                for(var e:selected) {
                    if(!e.date().equals(shown)) { shown=e.date();text.append("\n### ").append(shown).append(" 周").append("一二三四五六日".charAt(shown.getDayOfWeek().getValue()-1)).append("\n"); }
                    text.append("\n- ").append(e.timeLabel()).append(" ").append(e.name());
                    if(q.detail()!=Detail.TEACHER) text.append("；").append(e.room().isEmpty()?"教室未填写":e.room());
                    if(q.detail()==Detail.TEACHER || q.detail()==Detail.SUMMARY || timingDetail(q.detail())) text.append("；").append(e.teacher().isEmpty()?"任课教师未绑定":"任课教师："+e.teacher());
                    if(e.conflict()) text.append("（时间重叠，请核对）");
                }
            }
        }
        if(q.detail()==Detail.FREE && imageOnly)text.append("\n\n旧图片的课程尚未核对，暂不能确认完整空闲日期。");
        else if(q.detail()==Detail.FREE && !orderUnknown && !courseUnmatched) {
            Set<LocalDate> busy=new HashSet<>(selected.stream().map(UnifiedTimetableService.Entry::date).toList());
            List<String> free=new ArrayList<>();
            for(LocalDate day=q.from();!day.isAfter(q.to());day=day.plusDays(1)) if(!busy.contains(day)) free.add(day.toString());
            text.append("\n\n未匹配到已存安排的日期：").append(free.isEmpty()?"无":String.join("、",free)).append("。这不是实时空闲或停课保证。");
        }
        if(unknown>0 && !orderUnknown && needsClock) text.append("\n\n另有").append(unknown).append("项缺少钟点，未混入时段筛选结果。");
        if(excluded>0)text.append("\n\n").append(excludedNotice(excluded));
        if(!sourceNotice.isEmpty())text.append("\n\n").append(sourceNotice);
        if(timing!=null){if(!timing.summary().isEmpty())text.append("\n\n").append(timing.summary());text.append("\n\n").append(timing.notice());}
        String sourceLabel=scope!=null && scope.requested().equals("TEACHER")?"本人已授权的授课安排，不含个人导入或作为学生上的课程":
                scope!=null && scope.requested().equals("STUDENT")?"本人导入和作为学生已获授权的安排，不含本人授课":"本人导入和已授权教学安排";
        text.append("\n\n来源：").append(sourceLabel).append("；不是实时教务同步，不推断考勤。没有安排不代表学校停课。");
        LocalDateTime focus=!selected.isEmpty() && selected.stream().map(ScheduleQueryEngine::start).distinct().count()==1 &&
                (selected.size()==1 || q.selection()!=Selection.ALL && q.selection()!=Selection.REMAINING)?start(selected.get(0)):null;
        var display=display(q,selected,inRange,all,unknown,orderUnknown,uncertain,exact,courseUnmatched,excluded,timing,imageOnly,sourceNotice);
        var choices=courseUnmatched?all.stream().map(UnifiedTimetableService.Entry::name).distinct().sorted().toList():List.<String>of();
        boolean complete=choices.size()<=200;
        CourseRefinement refinement=courseUnmatched?new CourseRefinement(1,complete?List.copyOf(choices):List.of(),all.size(),complete):null;
        return new Answer(1,q.from(),q.to(),q.period().name(),q.selection().name(),q.detail().name(),q.anchor(),q.course(),now,selected.size(),unknown,focus,text.toString(),display,refinement,scope);
    }
    private static String excludedNotice(long count) {
        return "所选日期范围内有"+count+"项安排标记为取消或待核对，未计入有效课程；请在完整课表核对状态，查询没有删除原件或记录。";
    }
    private record TimingText(String summary,String notice) {}
    private static boolean timingDetail(Detail detail){return Set.of(Detail.WAIT_START,Detail.WAIT_END,Detail.DURATION).contains(detail);}
    private static String durationText(long seconds) {
        long absolute=Math.abs(seconds);
        if(absolute==0)return "0分钟";
        if(absolute<60)return "不到1分钟";
        long minutes=(absolute+59)/60,days=minutes/1440,hours=minutes%1440/60,rest=minutes%60;
        return (days>0?days+"天":"")+(hours>0?hours+"小时":"")+(rest>0?rest+"分钟":"");
    }
    private static TimingText timing(Query q,List<UnifiedTimetableService.Entry> rows,LocalDateTime current,int unknown) {
        if(!timingDetail(q.detail()))return null;
        String notice=q.detail()==Detail.DURATION?"按起止钟点计算；如有课间一并计入，不等于有效授课分钟或课时。":
                "按"+current.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))+"（北京时间）核算；不会自动刷新。";
        if(rows.isEmpty())return new TimingText("",notice);
        if(rows.stream().anyMatch(e->start(e)==null || end(e)==null || !end(e).isAfter(start(e))))
            return new TimingText("匹配安排的起止钟点无效，请先核对；没有计算猜测的时长。",notice);
        if(q.detail()==Detail.DURATION && unknown>0 && q.selection()==Selection.ALL)
            return new TimingText("有"+unknown+"项安排的钟点待核对，暂不计算完整时长。",notice);
        if(q.detail()==Detail.DURATION){
            long spans=rows.stream().map(e->start(e)+"|"+end(e)).distinct().count();
            if(spans>1)return new TimingText("匹配到不同钟点的安排，请指定一节核对时长；不会把重叠或跨日时段直接相加。",notice);
            long seconds=Duration.between(start(rows.get(0)),end(rows.get(0))).getSeconds();
            return new TimingText((rows.size()>1?"这些同时段安排每项的计划起止跨度为":"计划起止跨度为")+durationText(seconds)+"。",notice);
        }
        boolean begin=q.detail()==Detail.WAIT_START;
        var points=rows.stream().map(e->begin?start(e):end(e)).distinct().toList();
        if(points.size()!=1)return new TimingText("匹配到多个不同"+(begin?"开始":"结束")+"时间，请先指定一节；不会给出一个猜测的剩余时间。",notice);
        long seconds=Duration.between(current,points.get(0)).getSeconds();
        String label=begin?"开始":"结束";
        String prefix=!begin && rows.stream().allMatch(e->current.isBefore(start(e)))?"尚未到计划开始时间；":"";
        String text=seconds==0?"已到计划"+label+"时间。":seconds>0?"距离计划"+label+"还有"+durationText(seconds)+"。":"已过计划"+label+"时间"+durationText(seconds)+"。";
        return new TimingText(prefix+text,notice);
    }
    private static Display display(Query q,List<UnifiedTimetableService.Entry> selected,List<UnifiedTimetableService.Entry> matched,List<UnifiedTimetableService.Entry> all,
            int unknown,boolean orderUnknown,long uncertain,boolean exact,boolean courseUnmatched,long excluded,TimingText timing,boolean imageOnly,String sourceNotice) {
        String state=orderUnknown || courseUnmatched || imageOnly && (selected.isEmpty() || q.detail()==Detail.FREE)?"UNRESOLVED":selected.isEmpty()?"EMPTY":"READY";
        String summary;
        if(courseUnmatched)summary="该日期范围有"+all.size()+"项已保存安排，但没匹配到课程“"+q.course()+"”。请核对课程名称或日期。";
        else if(orderUnknown) summary="有"+uncertain+"项安排缺少钟点，暂不能准确定位这节课。";
        else if(imageOnly && q.detail()==Detail.FREE)summary="旧课表图片尚未核对，暂不能确认空闲日期；可改查具体日期的已授权课程。";
        else if(imageOnly && selected.isEmpty())summary="已保存旧课表图片，但还没有可直接查询的个人课程。";
        else if(selected.isEmpty()) summary=switch(q.selection()) {
            case NEXT->"查询范围内没有接下来的已保存课程。";
            case PREVIOUS->q.anchor()!=null?"查询范围内没有排在所选课程之前的已保存课程。":"查询范围内没有已经结束的已保存课程。";
            case CURRENT->"当前没有匹配到正在上的已保存课程。";
            case REMAINING->"查询范围内没有尚未结束的已保存课程。";
            case AT->"之前定位的课程已变更或不存在，请重新查询。";
            default->excluded>0?"查询范围内没有匹配的有效安排；已标记取消或待核对的条目未计入。":"查询范围内没有匹配的已保存安排。";
        };
        else if(timing!=null && !timing.summary().isEmpty())summary=timing.summary();
        else if(q.detail()==Detail.COURSES)
            summary=selected.stream().map(UnifiedTimetableService.Entry::name).distinct().count()+"门课程，"+selected.size()+"项安排。";
        else if(q.detail()==Detail.PERIODS) {
            int known=0,missing=0;
            for(var e:selected) { if(e.startPeriod()==null || e.endPeriod()==null)missing++;else known+=e.endPeriod()-e.startPeriod()+1; }
            summary=(missing==0?"共":"已知")+known+"节课，"+selected.size()+"项安排"+(missing==0?"。":"；另有"+missing+"项节次未配置，不能当作完整总数。");
        } else summary="共"+selected.size()+"项安排。";
        var notices=new ArrayList<String>();
        if(!sourceNotice.isEmpty())notices.add(sourceNotice);
        if(excluded>0)notices.add(excludedNotice(excluded));
        if(unknown>0 && !orderUnknown) notices.add(unknown+"项安排的钟点待核对，时段或顺序查询可能不完整。");
        if(!q.course().isBlank()) {
            long names=matched.stream().map(UnifiedTimetableService.Entry::name).distinct().count();
            if(!exact && names>0)notices.add("按简称匹配候选课程，请核对完整名称。");
            if(names>1)notices.add("匹配到多个课程名称，没有自动替你选定。");
        }
        if(selected.stream().anyMatch(UnifiedTimetableService.Entry::conflict))notices.add("部分安排时间重叠，请核对来源。");
        var free=new ArrayList<LocalDate>();
        if(q.detail()==Detail.FREE && !imageOnly && !orderUnknown && !courseUnmatched) {
            var busy=new HashSet<>(selected.stream().map(UnifiedTimetableService.Entry::date).toList());
            for(LocalDate date=q.from();!date.isAfter(q.to());date=date.plusDays(1))if(!busy.contains(date))free.add(date);
        }
        var entries=selected.stream().map(e->new DisplayEntry(e.id(),e.date(),e.name(),e.room(),e.teacher(),e.startTime(),e.endTime(),
                e.startPeriod(),e.endPeriod(),e.timeLabel(),e.conflict(),List.copyOf(e.sources()))).toList();
        return new Display(1,state,summary,List.copyOf(entries),List.copyOf(notices),List.copyOf(free));
    }
    private static ResponseStatusException bad(String text) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,text); }
}
