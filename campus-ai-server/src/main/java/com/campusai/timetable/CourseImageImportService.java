package com.campusai.timetable;

import com.campusai.mapper.UserMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.*;
import static com.campusai.timetable.CourseScheduleService.*;

/** An explicit image upload authorizes one account-private, revision-protected import. */
@Service
public class CourseImageImportService {
    private final LocalTimetableOcrService ocr;private final CourseScheduleService schedules;private final UserMapper users;private final long bellSchool;
    public CourseImageImportService(LocalTimetableOcrService ocr,CourseScheduleService schedules,UserMapper users,@Value("${app.timetable.bell-school-id:1}") long bellSchool){this.ocr=ocr;this.schedules=schedules;this.users=users;this.bellSchool=bellSchool;}
    public record TimedRow(String name,int weekday,int startPeriod,int endPeriod,String startTime,String endTime,String room,String teacher){}
    public record Result(Snapshot schedule,int importedRows,int week,boolean keptOtherWeeks,String bellVersion,List<TimedRow> recognized,List<String> warnings){}
    public record BatchTimedRow(int week,String name,int weekday,int startPeriod,int endPeriod,String startTime,String endTime,String room,String teacher){}
    public record BatchResult(Snapshot schedule,int importedRows,int week,List<Integer> weeks,int imageCount,int duplicateImages,boolean keptOtherWeeks,String bellVersion,List<BatchTimedRow> recognized,List<String> warnings){}
    public Result importImage(long owner,int revision,byte[] bytes){
        if(revision<0||revision>1000000)throw error(400,"课表版本无效，请重新读取");
        long school=school(owner);if(school!=bellSchool)throw error(422,"本校作息尚未配置，未自动保存");
        Snapshot before=schedules.get(owner).schedule();if(revision!=(before==null?0:before.revision()))throw error(409,"课表已更新，请重新读取后上传；没有覆盖新版本");
        var parsed=ocr.recognize(owner,bytes);if(school(owner)!=school)throw error(403,"账号学校已变化，未保存");
        LocalDate monday;try{monday=LocalDate.parse(parsed.firstMonday());}catch(Exception e){throw error(422,"截图日期或学期未读完整，请换一张完整截图；未保存");}
        if(parsed.week()==null||parsed.week()<1||parsed.week()>30||parsed.semester()==null||parsed.semester().isBlank()||parsed.rows().isEmpty())throw error(422,"截图周次或课程未读完整，请换一张完整截图；未保存");
        var incoming=new ArrayList<Course>();var timed=new ArrayList<TimedRow>();var warnings=new ArrayList<String>();
        for(var row:parsed.rows()){
            if(row.startPeriod()==null||row.endPeriod()==null||row.startPeriod()<1||row.endPeriod()>16||row.endPeriod()<row.startPeriod())
                throw error(422,"截图课程节次边界未读清，请使用完整清晰截图；未保存");
            if(!List.of(parsed.week()).equals(row.weeks()))throw error(422,"截图课程周次与当前周不一致，未保存");
            var span=CampusBellSchedule.span(row.startPeriod(),row.endPeriod());
            var c=new Course(row.name(),row.weekday(),null,null,List.of(parsed.week()),row.room(),row.startPeriod(),row.endPeriod(),row.teacher());
            incoming.add(c);timed.add(new TimedRow(c.name(),c.weekday(),c.startPeriod(),c.endPeriod(),span==null?null:span.start(),span==null?null:span.end(),c.room(),c.teacher()));
            if(span==null)warnings.add("第"+c.startPeriod()+"—"+c.endPeriod()+"节钟点未配置，已保留节次，请在个人安排核对时间");
            if(c.startPeriod()<=12&&c.endPeriod()>=11)warnings.add("第11—12节仅实践专周可排课；实践专周连续9—12节若采用21:25下课，需按实际安排核对，未自动套用");
        }
        var unique=incoming.stream().distinct().toList();
        for(int i=0;i<unique.size();i++)for(int j=i+1;j<unique.size();j++){var a=unique.get(i);var b=unique.get(j);if(a.weekday()==b.weekday()&&a.startPeriod()<=b.endPeriod()&&b.startPeriod()<=a.endPeriod())throw error(422,"截图中有重叠课程，未自动保存；请换一张清晰截图");}
        boolean sameTerm=before!=null&&before.firstMonday().equals(monday);
        var combined=merge(before,unique,monday,parsed.week());
        var input=new Input(revision,sameTerm?before.semester():parsed.semester(),monday,before==null?7:before.remindDays(),combined);
        var saved=schedules.saveImported(owner,input,school).schedule();
        warnings.addAll(parsed.warnings());
        return new Result(saved,unique.size(),parsed.week(),sameTerm,CampusBellSchedule.VERSION,List.copyOf(timed),warnings.stream().distinct().limit(20).toList());
    }
    public BatchResult importImages(long owner,int revision,List<byte[]> pictures){
        return importImages(owner,revision,pictures,()->true);
    }
    public BatchResult importImages(long owner,int revision,List<byte[]> pictures,java.util.function.BooleanSupplier session){
        if(!session.getAsBoolean())throw error(401,"登录状态已变化，整批未保存");
        if(revision<0||revision>1000000)throw error(400,"课表版本无效，请刷新");
        long school=school(owner);if(school!=bellSchool)throw error(422,"本校作息尚未配置");
        Snapshot before=schedules.get(owner).schedule();if(revision!=(before==null?0:before.revision()))throw error(409,"课表已更新，请刷新后再导入");
        LocalTimetableOcrService.validatePictures(pictures);
        var images=new ArrayList<byte[]>();var hashes=new HashSet<String>();
        for(var image:pictures)if(hashes.add(ScheduleFileWriter.hash(image)))images.add(image);
        var parsed=ocr.recognizeBatch(owner,List.copyOf(images));if(school(owner)!=school)throw error(403,"账号学校已变化，整批未保存");
        if(parsed.size()!=images.size())throw error(422,"识别回执不完整，整批未保存");
        LocalDate monday=null;String semester=null;var byWeek=new TreeMap<Integer,List<Course>>();var warnings=new ArrayList<String>();
        for(int index=0;index<parsed.size();index++){
            var page=parsed.get(index);LocalDate first;
            try{first=LocalDate.parse(page.firstMonday());}catch(Exception failure){throw error(422,"第"+(index+1)+"张日期未读清，整批未保存");}
            if(page.week()==null||page.week()<1||page.week()>30||page.semester()==null||page.semester().isBlank()||page.rows()==null||page.rows().isEmpty()||page.rows().size()>120)
                throw error(422,"第"+(index+1)+"张学期、周次或课程未读清，整批未保存");
            if(monday==null){monday=first;semester=page.semester();}
            else if(!monday.equals(first)||!semester.equals(page.semester()))throw error(422,"图片不属于同一学期，整批未保存");
            var courses=byWeek.computeIfAbsent(page.week(),key->new ArrayList<>());
            for(var row:page.rows()){
                if(row==null||row.startPeriod()==null||row.endPeriod()==null||row.startPeriod()<1||row.endPeriod()>16||row.endPeriod()<row.startPeriod()||!List.of(page.week()).equals(row.weeks()))
                    throw error(422,"第"+(index+1)+"张节次或周次不明确，整批未保存");
                courses.add(new Course(row.name(),row.weekday(),null,null,List.of(page.week()),row.room(),row.startPeriod(),row.endPeriod(),row.teacher()));
            }
            if(page.warnings()!=null)warnings.addAll(page.warnings().stream().filter(w->!w.startsWith("只识别截图明确的第")).toList());
        }
        boolean same=before!=null&&before.firstMonday().equals(monday);Snapshot combined=before;
        var recognized=new ArrayList<BatchTimedRow>();int imported=0;
        for(var entry:byWeek.entrySet()){
            var normalized=CourseScheduleService.validate(new Input(revision,semester,monday,before==null?7:before.remindDays(),entry.getValue().stream().distinct().toList()));
            for(int i=0;i<normalized.size();i++)for(int j=i+1;j<normalized.size();j++){
                var a=normalized.get(i);var b=normalized.get(j);
                if(a.weekday()==b.weekday()&&a.startPeriod()<=b.endPeriod()&&b.startPeriod()<=a.endPeriod())throw error(422,"第"+entry.getKey()+"周课程冲突，整批未保存");
            }
            for(var course:normalized){
                var span=CampusBellSchedule.span(course.startPeriod(),course.endPeriod());
                recognized.add(new BatchTimedRow(entry.getKey(),course.name(),course.weekday(),course.startPeriod(),course.endPeriod(),span==null?null:span.start(),span==null?null:span.end(),course.room(),course.teacher()));
                if(span==null)warnings.add("第"+course.startPeriod()+"—"+course.endPeriod()+"节钟点待核对");
                if(course.startPeriod()<=12&&course.endPeriod()>=11)warnings.add("第11—12节仅实践专周，请核对特殊连堂时间");
            }
            imported+=normalized.size();
            combined=new Snapshot(revision,same?before.semester():semester,monday,before==null?7:before.remindDays(),merge(combined,normalized,monday,entry.getKey()),java.time.Instant.EPOCH,java.time.Instant.EPOCH);
        }
        var saved=schedules.saveImported(owner,new Input(revision,combined.semester(),monday,combined.remindDays(),combined.courses()),school,session).schedule();
        var weeks=List.copyOf(byWeek.keySet());
        return new BatchResult(saved,imported,weeks.get(0),weeks,images.size(),pictures.size()-images.size(),same,CampusBellSchedule.VERSION,List.copyOf(recognized),warnings.stream().distinct().limit(20).toList());
    }
    static List<Course> merge(Snapshot before,List<Course> incoming,LocalDate monday,int week){
        boolean same=before!=null&&before.firstMonday().equals(monday);var all=new ArrayList<Course>();
        if(same)for(var old:before.courses()){var weeks=old.weeks().stream().filter(w->w!=week).toList();if(!weeks.isEmpty())all.add(withWeeks(old,weeks));}
        for(var next:incoming){
            if(same&&next.teacher().isBlank()){
                var identity=teacherKey(next);var matches=before.courses().stream().filter(old->old.weeks().contains(week)&&teacherKey(old).equals(identity)).toList();
                if(matches.size()==1&&!matches.get(0).teacher().isBlank())next=new Course(next.name(),next.weekday(),next.startTime(),next.endTime(),next.weeks(),next.room(),next.startPeriod(),next.endPeriod(),matches.get(0).teacher());
            }
            all.add(next);
        }
        var merged=new LinkedHashMap<List<Object>,Course>();
        for(var c:all){var key=key(c,true);var old=merged.get(key);if(old==null)merged.put(key,c);else{var weeks=new TreeSet<>(old.weeks());weeks.addAll(c.weeks());merged.put(key,withWeeks(c,List.copyOf(weeks)));}}
        return List.copyOf(merged.values());
    }
    public List<CampusBellSchedule.Slot> bells(long owner){return school(owner)==bellSchool?CampusBellSchedule.SLOTS:List.of();}
    private static List<Object> teacherKey(Course c){var span=CampusBellSchedule.span(c.startPeriod(),c.endPeriod());return Arrays.asList(c.name().trim(),c.weekday(),span==null?(c.startPeriod()==null?c.startTime():"period:"+c.startPeriod()):span.start(),span==null?(c.endPeriod()==null?c.endTime():"period:"+c.endPeriod()):span.end(),c.room()==null?"":c.room().trim());}
    private static Course withWeeks(Course c,List<Integer> weeks){return new Course(c.name(),c.weekday(),c.startTime(),c.endTime(),weeks,c.room(),c.startPeriod(),c.endPeriod(),c.teacher());}
    private static List<Object> key(Course c,boolean teacher){return Arrays.asList(c.name().trim(),c.weekday(),c.startTime(),c.endTime(),c.room()==null?"":c.room().trim(),c.startPeriod(),c.endPeriod(),teacher?c.teacher():"");}
    private long school(long id){var user=users.findById(id);if(user==null||!Integer.valueOf(1).equals(user.getStatus())||user.getSchoolId()==null)throw error(403,"账号范围已变化，未保存");return user.getSchoolId();}
    private static ResponseStatusException error(int status,String message){return new ResponseStatusException(HttpStatus.valueOf(status),message);}
}
