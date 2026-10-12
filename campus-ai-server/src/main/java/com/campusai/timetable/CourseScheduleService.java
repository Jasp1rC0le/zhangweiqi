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
    public record Course(String name, int weekday, String startTime, String endTime, List<Integer> weeks, String room) {}
    public record Input(int revision, String semester, LocalDate firstMonday, int remindDays, List<Course> courses) {}
    public record Snapshot(int revision, String semester, LocalDate firstMonday, int remindDays, List<Course> courses, Instant importedAt, Instant checkedAt) {}
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
        List<Course> courses = validate(input);
        String encoded = json.writeValueAsString(courses), semester = input.semester().trim();
        jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", Long.class, userId);
        Snapshot prior = get(userId).schedule();
        if (input.revision() != (prior == null ? 0 : prior.revision())) throw conflict();
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
        return get(userId);
    }
    @Transactional public State checked(Long userId, int revision) {
        if (jdbc.update("UPDATE student_course_schedules SET checked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=?", userId, revision) != 1) throw conflict();
        return get(userId);
    }
    @Transactional public void delete(Long userId, int revision) {
        if (jdbc.update("DELETE FROM student_course_schedules WHERE user_id=? AND revision=?", userId, revision) != 1) throw conflict();
    }
    static List<Course> validate(Input input) {
        if (input == null || input.revision() < 0 || input.revision() > 1000000 || !validText(input.semester(), true)
                || input.firstMonday() == null || input.firstMonday().getYear() < 2000 || input.firstMonday().getYear() > 2100 || input.firstMonday().getDayOfWeek().getValue() != 1 || input.remindDays() < 0 || input.remindDays() > 30)
            throw invalid("请按校历填写学期、第1周周一日期和0至30天的核对提醒");
        if (input.courses() == null || input.courses().isEmpty() || input.courses().size() > 120) throw invalid("课程安排限1至120条");
        Set<Course> distinct = new HashSet<>();
        for (Course course : input.courses()) {
            if (course == null || !validText(course.name(), true) || !validText(course.room(), false) || course.weekday() < 1 || course.weekday() > 7
                    || !validTime(course.startTime()) || !validTime(course.endTime()) || course.startTime().compareTo(course.endTime()) >= 0
                    || course.weeks() == null || course.weeks().isEmpty() || course.weeks().size() > 30 || course.weeks().stream().anyMatch(w -> w == null || w < 1 || w > 30))
                throw invalid("课程名称和教室限100字单行文字；星期1至7、时间HH:mm、上课周次1至30，结束时间须晚于开始时间");
            distinct.add(new Course(course.name().trim(), course.weekday(), course.startTime(), course.endTime(), course.weeks().stream().distinct().sorted().toList(), course.room().trim()));
        }
        return distinct.stream().sorted(Comparator.comparingInt(Course::weekday).thenComparing(Course::startTime).thenComparing(Course::endTime).thenComparing(Course::name).thenComparing(Course::room).thenComparing(c -> c.weeks().toString())).toList();
    }
    private static boolean validText(String text, boolean required) { return text != null && text.length() <= 100 && (!required || !text.isBlank()) && text.chars().noneMatch(c -> c < 32 || c == 127); }
    private static boolean validTime(String text) { return text != null && text.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"); }
    private static ResponseStatusException invalid(String reason) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason); }
    private static ResponseStatusException conflict() { return new ResponseStatusException(HttpStatus.CONFLICT, "课程表格已在另一页面更新，请保留待导入文件，重新读取并核对差异后操作"); }
}
