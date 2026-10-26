package com.campusai.timetable;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(10)
class CourseScheduleServiceTest {
    JdbcTemplate jdbc; CourseScheduleService service;
    CourseScheduleService.Course course(String room) { return new CourseScheduleService.Course("课程示例", 1, "08:00", "09:40", List.of(1,3,5), room); }
    CourseScheduleService.Input input(int revision, String room) { return new CourseScheduleService.Input(revision, "示例学期", LocalDate.of(2026,9,7), 7, List.of(course(room))); }
    @BeforeEach void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:cs"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE users(id BIGINT PRIMARY KEY)"); jdbc.update("INSERT INTO users VALUES(1),(2)");
        jdbc.execute("CREATE TABLE student_course_schedule_versions(user_id BIGINT PRIMARY KEY,revision INT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");
        jdbc.execute("CREATE TABLE student_course_schedules(user_id BIGINT PRIMARY KEY,revision INT NOT NULL,semester VARCHAR(100),first_monday DATE,remind_days INT,courses_json CLOB,imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");
        service = new CourseScheduleService(jdbc, new ObjectMapper());
    }
    @Test void savedCoursesAreOwnerPrivateAndDuplicateImportsDoNotIncreaseRevision() {
        assertNull(service.get(1L).schedule());
        assertEquals(1,service.save(1L,input(0,"A101")).schedule().revision());
        var duplicate = new CourseScheduleService.Input(1,"示例学期",LocalDate.of(2026,9,7),7,List.of(course("A101"), course("A101")));
        assertEquals(1,service.save(1L,duplicate).schedule().revision());
        assertEquals(1,service.get(1L).schedule().courses().size());
        assertNull(service.get(2L).schedule());
    }
    @Test void staleRevisionAndOtherOwnerCannotOverwriteConfirmOrDelete() {
        service.save(1L,input(0,"A101"));
        assertEquals(2,service.save(1L,input(1,"B102")).schedule().revision());
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.save(1L,input(1,"C103"))).getStatusCode().value());
        assertThrows(ResponseStatusException.class,()->service.checked(2L,2));
        assertThrows(ResponseStatusException.class,()->service.delete(2L,2));
        assertEquals("B102",service.get(1L).schedule().courses().get(0).room());
    }
    @Test void oldTabsCannotMatchADeletedAndRecreatedSchedule() {
        service.save(1L,input(0,"A101")); service.delete(1L,1);
        assertEquals(2,service.save(1L,input(0,"B102")).schedule().revision());
        assertThrows(ResponseStatusException.class,()->service.save(1L,input(1,"C103")));
        assertThrows(ResponseStatusException.class,()->service.checked(1L,1));
        assertThrows(ResponseStatusException.class,()->service.delete(1L,1));
    }
    @Test void erasingAnAccountCascadesOnlyItsPrivateCoursesAndVersion() {
        service.save(1L,input(0,"A101")); service.save(2L,input(0,"B102"));
        jdbc.update("DELETE FROM users WHERE id=1");
        assertNull(service.get(1L).schedule()); assertNotNull(service.get(2L).schedule());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM student_course_schedule_versions",Integer.class));
    }
    @Test void validatesMetadataAndEmptyLargeOrAmbiguousCoursesBeforeWrite() {
        for (var bad : Arrays.asList(null, new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,8),7,List.of(course("A"))), new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,7),31,List.of(course("A"))), new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,7),7,List.of()), new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,7),7,Collections.nCopies(121,course("A")))))
            assertEquals(400,assertThrows(ResponseStatusException.class,()->service.save(1L,bad)).getStatusCode().value());
        for (var badCourse : List.of(new CourseScheduleService.Course("A",0,"08:00","09:00",List.of(1),""), new CourseScheduleService.Course("A",1,"第1节","第2节",List.of(1),""), new CourseScheduleService.Course("A",1,"09:00","08:00",List.of(1),""), new CourseScheduleService.Course("A",1,"08:00","09:00",List.of(31),""), new CourseScheduleService.Course("A\nB",1,"08:00","09:00",List.of(1),""))) {
            var bad = new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,7),7,List.of(badCourse));
            assertThrows(ResponseStatusException.class,()->service.save(1L,bad));
        }
        assertNull(service.get(1L).schedule());
    }
    @Test void normalizesWeeksOrderAndDuplicatesWithoutInventingUnlistedWeeks() {
        var c = new CourseScheduleService.Course(" 课程 ",2,"10:00","11:40",List.of(5,1,3,1)," 教室 ");
        var saved=service.save(1L,new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,7),7,List.of(c))).schedule();
        assertEquals(List.of(1,3,5),saved.courses().get(0).weeks());
        assertEquals("课程",saved.courses().get(0).name());
    }
    @Test void periodSchedulePersistsPrivatelyWithoutInventingClockTimesOrWeeks() {
        var c = new CourseScheduleService.Course("节次示例",2,null,null,List.of(6),"示例教室",1,4);
        var in = new CourseScheduleService.Input(0,"示例学期",LocalDate.of(2026,9,7),7,List.of(c,c));
        var saved = service.save(1L,in).schedule();
        assertEquals(List.of(c), saved.courses());
        assertEquals(List.of(c), service.get(1L).schedule().courses());
        assertNull(service.get(2L).schedule());
        assertEquals(1, service.save(1L,new CourseScheduleService.Input(1,in.semester(),in.firstMonday(),7,List.of(c))).schedule().revision());
    }
    @Test void invalidPeriodAndMixedUnitsFailBeforeWrite() {
        for (var c : List.of(
                new CourseScheduleService.Course("A",1,null,null,List.of(6),"",0,2),
                new CourseScheduleService.Course("A",1,null,null,List.of(6),"",1,17),
                new CourseScheduleService.Course("A",1,null,null,List.of(6),"",4,3),
                new CourseScheduleService.Course("A",1,null,null,List.of(6),"",1,null),
                new CourseScheduleService.Course("A",1,"08:00","09:00",List.of(6),"",1,2))) {
            assertThrows(ResponseStatusException.class,()->service.save(1L,new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,9,7),7,List.of(c))));
        }
        assertNull(service.get(1L).schedule());
    }
    @Test void oldClockJsonStillReadsAndMixedUnitsSortDeterministically() {
        service.save(1L,input(0,"A"));
        jdbc.update("UPDATE student_course_schedules SET courses_json=? WHERE user_id=1", "[{\"name\":\"旧表\",\"weekday\":1,\"startTime\":\"08:00\",\"endTime\":\"09:40\",\"weeks\":[6],\"room\":\"A\"}]");
        var old = service.get(1L).schedule().courses().get(0);
        assertNull(old.startPeriod()); assertEquals("08:00",old.startTime());
        var period = new CourseScheduleService.Course("节次表",1,null,null,List.of(6),"B",1,2);
        var saved = service.save(1L,new CourseScheduleService.Input(1,"学期",LocalDate.of(2026,9,7),7,List.of(old,period))).schedule();
        assertEquals(period, saved.courses().get(0));
        assertEquals(old, saved.courses().get(1));
    }
    @Test void teacherNamePersistsAndDifferentTeachersAreNotCollapsedOrSilentlyBound() {
        var a=new CourseScheduleService.Course("教师课程",2,"08:00","09:40",List.of(1,3),"A",null,null," 合成教师甲 ");
        var b=new CourseScheduleService.Course("教师课程",2,"08:00","09:40",List.of(1,3),"A",null,null,"合成教师乙");
        var saved=service.save(1L,new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,10,12),7,List.of(a,b))).schedule();
        assertEquals(2,saved.courses().size());assertEquals(Set.of("合成教师甲","合成教师乙"),new HashSet<>(saved.courses().stream().map(CourseScheduleService.Course::teacher).toList()));assertEquals(saved,service.get(1L).schedule());assertNull(service.get(2L).schedule());
    }
    @Test void teacherFieldsRejectControlCharactersAndExcessiveNamesBeforeWrite() {
        for(String teacher:List.of("甲\n乙","甲\0乙","师".repeat(101))){var c=new CourseScheduleService.Course("课程",1,"08:00","09:40",List.of(1),"A",null,null,teacher);assertThrows(ResponseStatusException.class,()->service.save(1L,new CourseScheduleService.Input(0,"学期",LocalDate.of(2026,10,12),7,List.of(c))));}
        assertNull(service.get(1L).schedule());
    }
    @Test void teacherSurvivesTermRebaseAndHistoryKeepsTheOldTeacherVersion() throws Exception {
        for(String sql:Files.readString(Path.of("../deploy/migrations/V20261019__personal_schedule_history.sql")).split(";"))if(!sql.isBlank())jdbc.execute(sql);
        var date=LocalDate.of(2026,10,12);var original=new CourseScheduleService.Course("课程",2,"08:00","09:40",List.of(1,3),"A",null,null,"合成教师甲");
        service.save(1L,new CourseScheduleService.Input(0,"学期",date,7,List.of(original)));
        service.saveReviewed(1L,new CourseScheduleService.Input(1,"学期",date,7,List.of(new CourseScheduleService.Course("课程",2,"08:00","09:40",List.of(1,3),"A",null,null,"合成教师乙"))),"核对教师");
        assertEquals("合成教师乙",service.forWeek(1L,date.plusWeeks(2)).schedule().courses().get(0).teacher());
        String before=jdbc.queryForObject("SELECT snapshot_json FROM personal_schedule_history WHERE owner_id=1 AND revision=1",String.class);assertTrue(before.contains("合成教师甲"));assertFalse(before.contains("合成教师乙"));
    }
}
