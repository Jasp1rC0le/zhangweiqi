package com.campusai.timetable;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.ObjectMapper;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.campusai.timetable.CourseScheduleService.*;

@SpringJUnitConfig(CourseImageImportPersistenceTest.Config.class)
class CourseImageImportPersistenceTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource source(){return new DriverManagerDataSource("jdbc:h2:mem:course_image_persistence;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");}
        @Bean JdbcTemplate db(DataSource source){return new JdbcTemplate(source);}
        @Bean PlatformTransactionManager tx(DataSource source){return new DataSourceTransactionManager(source);}
        @Bean CourseScheduleService schedules(JdbcTemplate db){return new CourseScheduleService(db,new ObjectMapper());}
        @Bean LocalTimetableOcrService ocr(){return mock(LocalTimetableOcrService.class);}
        @Bean UserMapper users(){var users=mock(UserMapper.class);var user=new User();user.setId(7L);user.setStatus(1);user.setSchoolId(1L);when(users.findById(7L)).thenReturn(user);return users;}
        @Bean CourseImageImportService importer(LocalTimetableOcrService ocr,CourseScheduleService schedules,UserMapper users){return new CourseImageImportService(ocr,schedules,users,1);}
    }
    @Autowired JdbcTemplate db;@Autowired CourseScheduleService schedules;@Autowired LocalTimetableOcrService ocr;@Autowired CourseImageImportService importer;
    @BeforeEach void setup()throws Exception{
        db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,status INT)");db.update("INSERT INTO users VALUES(7,1,1)");
        String schema=new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        String part=schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS student_course_schedule_versions"),schema.indexOf("CREATE TABLE IF NOT EXISTS personal_schedule_terms"));
        for(String sql:part.split(";"))if(!sql.isBlank())db.execute(sql);
    }
    @Test void recognizedDayAndEveningCoursesPersistTogetherAndDoNotEraseOtherWeeks(){
        schedules.save(7L,new Input(0,"合成学期",LocalDate.of(2026,9,7),7,List.of(new Course("其他周原课程",5,null,null,List.of(8,10),"测试教室",3,4))));
        var day=new SchoolTimetableImageParser.Row("白天合成课程",1,null,null,1,2,List.of(9),"测试教室",""," ");
        var night=new SchoolTimetableImageParser.Row("晚间合成课程",3,null,null,9,10,List.of(9),"测试教室",""," ");
        when(ocr.recognize(eq(7L),any())).thenReturn(new LocalTimetableOcrService.Result(2,"local-ocr","synthetic",false,"合成学期","2026-09-07",9,"2026-11-02",List.of(day,night),List.of("只读取明确周次")));
        var saved=importer.importImage(7,1,new byte[]{1});var actual=schedules.get(7L).schedule();
        assertThat(saved.importedRows()).isEqualTo(2);assertThat(actual.revision()).isEqualTo(2);assertThat(actual.courses()).hasSize(3);
        assertThat(actual.courses()).filteredOn(c->c.name().equals("晚间合成课程")).singleElement().satisfies(c->{assertThat(c.startPeriod()).isEqualTo(9);assertThat(c.endPeriod()).isEqualTo(10);assertThat(c.startTime()).isNull();assertThat(c.endTime()).isNull();assertThat(c.weeks()).containsExactly(9);});
        assertThat(actual.courses()).filteredOn(c->c.name().equals("其他周原课程")).singleElement().satisfies(c->assertThat(c.weeks()).containsExactly(8,10));
        assertThat(saved.recognized().get(0).startTime()).isEqualTo("08:30");assertThat(saved.recognized().get(1).startTime()).isEqualTo("18:20");assertThat(saved.recognized().get(1).endTime()).isEqualTo("19:55");
    }
}
