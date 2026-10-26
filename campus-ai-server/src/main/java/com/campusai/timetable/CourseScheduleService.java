package com.campusai.timetable;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

/** Explicitly supplied courses only, account-private. No school API, OCR, model or inference. */
@Service
public class CourseScheduleService {
    public static final int MAX_BODY_BYTES = 100000;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public CourseScheduleService(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }
    public record Course(String name, int weekday, String startTime, String endTime, List<Integer> weeks, String room, Integer startPeriod, Integer endPeriod, String teacher) {
        public Course { if(teacher==null)teacher=""; }
        public Course(String name,int weekday,String startTime,String endTime,List<Integer> weeks,String room,Integer startPeriod,Integer endPeriod) {
            this(name,weekday,startTime,endTime,weeks,room,startPeriod,endPeriod,"");
        }
        public Course(String name, int weekday, String startTime, String endTime, List<Integer> weeks, String room) {
            this(name, weekday, startTime, endTime, weeks, room, null, null, "");
        }
    }
    public record Input(int revision, String semester, LocalDate firstMonday, int remindDays, List<Course> courses) {}
    public record Snapshot(int revision, String semester, LocalDate firstMonday, int remindDays, List<Course> courses, Instant importedAt, Instant checkedAt,boolean emptyConfirmed) {
        public Snapshot(int revision,String semester,LocalDate firstMonday,int remindDays,List<Course> courses,Instant importedAt,Instant checkedAt){this(revision,semester,firstMonday,remindDays,courses,importedAt,checkedAt,courses!=null&&courses.isEmpty());}
    }
    public record State(Snapshot schedule) {}
    public State get(Long userId) {
        var rows = jdbc.query("SELECT revision,semester,first_monday,remind_days,courses_json,imported_at,checked_at FROM student_course_schedules WHERE user_id=?", (rs, n) -> {
            List<Course> courses = json.readValue(rs.getString("courses_json"), json.getTypeFactory().constructCollectionType(List.class, Course.class));
            return new Snapshot(rs.getInt("revision"), rs.getString("semester"), rs.getDate("first_monday").toLocalDate(), rs.getInt("remind_days"), courses, rs.getTimestamp("imported_at").toInstant(), rs.getTimestamp("checked_at").toInstant());
        }, userId);
        return new State(rows.isEmpty() ? null : rows.get(0));
    }
    @Transactional
    public State save(Long userId, Input input) {
        return saveInternal(userId,input,false,"本人导入或修改个人副本");
    }
    @Transactional
    public State saveReviewed(Long userId, Input input,String reason) {
        if(!historyAvailable())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"个人课表历史尚未启用，没有修改");
        if(reason==null||reason.isBlank()||reason.length()>500)throw invalid("请填写500字以内的修改原因");
        return saveInternal(userId,input,true,reason.trim());
    }
    private State saveInternal(Long userId, Input input,boolean allowEmpty,String reason) {
        List<Course> courses = allowEmpty && input!=null && input.courses()!=null && input.courses().isEmpty()
            ? validateEmpty(input) : validate(input);
        String encoded = json.writeValueAsString(courses), semester = input.semester().trim();
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", Long.class, userId);
        Snapshot prior = get(userId).schedule();
        if (input.revision() != (prior == null ? 0 : prior.revision())) throw conflict();
        boolean history=historyAvailable();
        if(history && prior!=null) remember(userId,prior,"BASELINE","首次捕获的已有副本，不追溯或猜测此前修改");
        if (prior != null && prior.semester().equals(semester) && prior.firstMonday().equals(input.firstMonday()) && prior.remindDays() == input.remindDays() && prior.courses().equals(courses)) {
            jdbc.update("UPDATE student_course_schedules SET checked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=?", userId, prior.revision());
        } else {
            var versions = jdbc.queryForList("SELECT revision FROM student_course_schedule_versions WHERE user_id=?", Integer.class, userId);
            int next = Math.max(prior == null ? 0 : prior.revision(), versions.isEmpty() ? 0 : versions.get(0)) + 1;
            if (next > 1000000) throw conflict();
            if (versions.isEmpty()) jdbc.update("INSERT INTO student_course_schedule_versions(user_id,revision) VALUES(?,?)", userId, next);
            else jdbc.update("UPDATE student_course_schedule_versions SET revision=? WHERE user_id=?", next, userId);
            if (prior == null) jdbc.update("INSERT INTO student_course_schedules(user_id,revision,semester,first_monday,remind_days,courses_json) VALUES(?,?,?,?,?,?)", userId, next, semester, input.firstMonday(), input.remindDays(), encoded);
            else if (jdbc.update("UPDATE student_course_schedules SET revision=?,semester=?,first_monday=?,remind_days=?,courses_json=?,imported_at=CURRENT_TIMESTAMP,checked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=?", next, semester, input.firstMonday(), input.remindDays(), encoded, userId, input.revision()) != 1) throw conflict();
        }
        State result=get(userId);
        if(history)remember(userId,result.schedule(),"SAVE",reason);
        return result;
    }
    @Transactional public State checked(Long userId, int revision) {
        if (jdbc.update("UPDATE student_course_schedules SET checked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=?", userId, revision) != 1) throw conflict();
        return get(userId);
    }
    @Transactional public void delete(Long userId, int revision) {
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",Long.class,userId);
        var prior=get(userId).schedule();
        if(prior==null||prior.revision()!=revision)throw conflict();
        if(historyAvailable()){
            // Clearing the active term is a reversible empty revision, not history erasure.
            var empty=saveInternal(userId,new Input(revision,prior.semester(),prior.firstMonday(),prior.remindDays(),List.of()),true,"本人清空当前学期副本，历史保留");
            jdbc.update("DELETE FROM student_course_schedules WHERE user_id=? AND revision=?",userId,empty.schedule().revision());
            return;
        }
        if (jdbc.update("DELETE FROM student_course_schedules WHERE user_id=? AND revision=?", userId, revision) != 1) throw conflict();
    }
    public boolean historyAvailable(){
        try{jdbc.queryForList("SELECT owner_id FROM personal_schedule_history WHERE 1=0");jdbc.queryForList("SELECT owner_id FROM personal_schedule_terms WHERE 1=0");return true;}
        catch(org.springframework.jdbc.BadSqlGrammarException e){return false;}
    }
    private List<Course> validateEmpty(Input input){
        validate(new Input(input.revision(),input.semester(),input.firstMonday(),input.remindDays(),List.of(new Course("空课表校验",1,"08:30","09:15",List.of(1),""))));return List.of();
    }
    private void remember(Long owner,Snapshot value,String action,String reason){
        String encoded=json.writeValueAsString(value);
        if(jdbc.queryForObject("SELECT COUNT(*) FROM personal_schedule_history WHERE owner_id=? AND revision=?",Integer.class,owner,value.revision())==0)
            jdbc.update("INSERT INTO personal_schedule_history(owner_id,revision,first_monday,semester,action,reason,snapshot_json) VALUES(?,?,?,?,?,?,?)",owner,value.revision(),value.firstMonday(),value.semester(),action,reason,encoded);
        if(jdbc.update("UPDATE personal_schedule_terms SET revision=?,semester=?,snapshot_json=? WHERE owner_id=? AND first_monday=?",value.revision(),value.semester(),encoded,owner,value.firstMonday())==0){
            if(jdbc.queryForObject("SELECT COUNT(*) FROM personal_schedule_terms WHERE owner_id=?",Integer.class,owner)>=24)throw invalid("最多保留24个学期，请先核对，不覆盖历史");
            jdbc.update("INSERT INTO personal_schedule_terms(owner_id,first_monday,revision,semester,snapshot_json) VALUES(?,?,?,?,?)",owner,value.firstMonday(),value.revision(),value.semester(),encoded);
        }
    }
    public List<Snapshot> terms(Long owner){
        var current=get(owner).schedule();
        if(!historyAvailable())return current==null?List.of():List.of(current);
        var rows=new ArrayList<>(jdbc.query("SELECT snapshot_json FROM personal_schedule_terms WHERE owner_id=? ORDER BY first_monday DESC",(r,n)->json.readValue(r.getString(1),Snapshot.class),owner));
        if(current!=null){rows.removeIf(s->s.firstMonday().equals(current.firstMonday()));rows.add(current);}
        if(rows.size()>24)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"学期数据超出已支持范围，请联系管理员；没有截断");
        return rows.stream().sorted(Comparator.comparing(Snapshot::firstMonday).reversed()).toList();
    }
    /** Rebase explicit saved occurrences onto the requested week, without moving any course. */
    public State forWeek(Long owner,LocalDate monday){
        if(!historyAvailable())return get(owner);
        var terms=terms(owner);if(terms.isEmpty())return new State(null);
        var courses=new ArrayList<Course>();Instant checked=Instant.MAX,imported=Instant.EPOCH;int revision=0;
        for(var term:terms){
            int week=(int)Math.floorDiv(java.time.temporal.ChronoUnit.DAYS.between(term.firstMonday(),monday),7)+1;
            if(week<1||week>30)continue;
            revision=Math.max(revision,term.revision());if(term.checkedAt().isBefore(checked))checked=term.checkedAt();if(term.importedAt().isAfter(imported))imported=term.importedAt();
            for(var c:term.courses())if(c.weeks().contains(week))courses.add(new Course(c.name(),c.weekday(),c.startTime(),c.endTime(),List.of(1),c.room(),c.startPeriod(),c.endPeriod(),c.teacher()));
        }
        if(courses.size()>120)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"同周多学期安排超过120项，请先核对重复学期；没有截断");
        if(checked.equals(Instant.MAX))checked=Instant.EPOCH;
        return new State(new Snapshot(revision,"本人已保存学期",monday,0,List.copyOf(courses),imported,checked));
    }
    static List<Course> validate(Input input) {
        if (input == null || input.revision() < 0 || input.revision() > 1000000 || !validText(input.semester(), true)
                || input.firstMonday() == null || input.firstMonday().getYear() < 2000 || input.firstMonday().getYear() > 2100 || input.firstMonday().getDayOfWeek().getValue() != 1 || input.remindDays() < 0 || input.remindDays() > 30)
            throw invalid("请按校历填写学期、第1周周一日期和0至30天的核对提醒");
        if (input.courses() == null || input.courses().isEmpty() || input.courses().size() > 120) throw invalid("课程安排限1至120条");
        Set<Course> distinct = new HashSet<>();
        for (Course course : input.courses()) {
            if (course == null || !validText(course.name(), true) || !validText(course.room(), false) || !validText(course.teacher(), false) || course.weekday() < 1 || course.weekday() > 7
                    || !validCourseTime(course)
                    || course.weeks() == null || course.weeks().isEmpty() || course.weeks().size() > 30 || course.weeks().stream().anyMatch(w -> w == null || w < 1 || w > 30))
                throw invalid("课程名称、教室和任课教师限100字单行文字；星期1至7、周次1至30；填写HH:mm起止时间或1至16起止节次，不能混填，结束不能早于开始");
            boolean byPeriod = course.startPeriod() != null;
            distinct.add(new Course(course.name().trim(), course.weekday(), byPeriod ? null : course.startTime(), byPeriod ? null : course.endTime(), course.weeks().stream().distinct().sorted().toList(), course.room().trim(), course.startPeriod(), course.endPeriod(),course.teacher().strip()));
        }
        return distinct.stream().sorted(Comparator.comparingInt(Course::weekday)
                .thenComparing(c -> c.startPeriod() == null ? 1 : 0)
                .thenComparing(Course::startPeriod, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Course::endPeriod, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Course::startTime, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Course::endTime, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Course::name).thenComparing(Course::room).thenComparing(Course::teacher).thenComparing(c -> c.weeks().toString())).toList();
    }
    private static boolean validCourseTime(Course c) {
        if (c.startPeriod() != null || c.endPeriod() != null)
            return c.startPeriod() != null && c.endPeriod() != null && c.startPeriod() >= 1
                    && c.endPeriod() <= 16 && c.endPeriod() >= c.startPeriod()
                    && (c.startTime() == null || c.startTime().isEmpty()) && (c.endTime() == null || c.endTime().isEmpty());
        return validTime(c.startTime()) && validTime(c.endTime()) && c.startTime().compareTo(c.endTime()) < 0;
    }
    private static boolean validText(String text, boolean required) { return text != null && text.length() <= 100 && (!required || !text.isBlank()) && text.chars().noneMatch(c -> c < 32 || c == 127); }
    private static boolean validTime(String text) { return text != null && text.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"); }
    private static ResponseStatusException invalid(String reason) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason); }
    private static ResponseStatusException conflict() { return new ResponseStatusException(HttpStatus.CONFLICT, "课程表格已在另一页面更新，请保留待导入文件，重新读取并核对差异后操作"); }
}
