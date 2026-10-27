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
    public Result importImage(long owner,int revision,byte[] bytes){
        if(revision<0||revision>1000000)throw error(400,"课表版本无效，请重新读取");
        long school=school(owner);if(school!=bellSchool)throw error(422,"本校作息尚未配置，未自动保存");
        Snapshot before=schedules.get(owner).schedule();if(revision!=(before==null?0:before.revision()))throw error(409,"课表已更新，请重新读取后上传；没有覆盖新版本");
        var parsed=ocr.recognize(owner,bytes);if(school(owner)!=school)throw error(403,"账号学校已变化，未保存");
        LocalDate monday;try{monday=LocalDate.parse(parsed.firstMonday());}catch(Exception e){throw error(422,"截图日期或学期未读完整，请换一张完整截图；未保存");}
        if(parsed.week()==null||parsed.week()<1||parsed.week()>30||parsed.semester()==null||parsed.semester().isBlank()||parsed.rows().isEmpty())throw error(422,"截图周次或课程未读完整，请换一张完整截图；未保存");
        var incoming=new ArrayList<Course>();var timed=new ArrayList<TimedRow>();
        for(var row:parsed.rows()){
            var span=CampusBellSchedule.span(row.startPeriod(),row.endPeriod());
            if(span==null||!row.weeks().equals(List.of(parsed.week())))throw error(422,"截图节次无法对应已配置作息，请换一张清晰截图；未保存");
            var c=new Course(row.name(),row.weekday(),null,null,List.of(parsed.week()),row.room(),row.startPeriod(),row.endPeriod(),row.teacher());
            incoming.add(c);timed.add(new TimedRow(c.name(),c.weekday(),span.startPeriod(),span.endPeriod(),span.start(),span.end(),c.room(),c.teacher()));
        }
        var unique=incoming.stream().distinct().toList();
        for(int i=0;i<unique.size();i++)for(int j=i+1;j<unique.size();j++){var a=unique.get(i);var b=unique.get(j);if(a.weekday()==b.weekday()&&a.startPeriod()<=b.endPeriod()&&b.startPeriod()<=a.endPeriod())throw error(422,"截图中有重叠课程，未自动保存；请换一张清晰截图");}
        boolean sameTerm=before!=null&&before.firstMonday().equals(monday);
        var combined=merge(before,unique,monday,parsed.week());
        var input=new Input(revision,sameTerm?before.semester():parsed.semester(),monday,before==null?7:before.remindDays(),combined);
        var saved=schedules.saveImported(owner,input,school).schedule();
        return new Result(saved,unique.size(),parsed.week(),sameTerm,CampusBellSchedule.VERSION,List.copyOf(timed),parsed.warnings());
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
    private static List<Object> teacherKey(Course c){var span=CampusBellSchedule.span(c.startPeriod(),c.endPeriod());return Arrays.asList(c.name().trim(),c.weekday(),span==null?c.startTime():span.start(),span==null?c.endTime():span.end(),c.room()==null?"":c.room().trim());}
    private static Course withWeeks(Course c,List<Integer> weeks){return new Course(c.name(),c.weekday(),c.startTime(),c.endTime(),weeks,c.room(),c.startPeriod(),c.endPeriod(),c.teacher());}
    private static List<Object> key(Course c,boolean teacher){return Arrays.asList(c.name().trim(),c.weekday(),c.startTime(),c.endTime(),c.room()==null?"":c.room().trim(),c.startPeriod(),c.endPeriod(),teacher?c.teacher():"");}
    private long school(long id){var user=users.findById(id);if(user==null||!Integer.valueOf(1).equals(user.getStatus())||user.getSchoolId()==null)throw error(403,"账号范围已变化，未保存");return user.getSchoolId();}
    private static ResponseStatusException error(int status,String message){return new ResponseStatusException(HttpStatus.valueOf(status),message);}
}
