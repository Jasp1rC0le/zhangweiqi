package com.campusai.timetable;
import com.campusai.material.MaterialCommandService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringJUnitConfig(PersonalScheduleEditingTest.Config.class) @Timeout(15)
class PersonalScheduleEditingTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource data(){return new DriverManagerDataSource("jdbc:h2:mem:personal_editing;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=3000","sa","");}
        @Bean JdbcTemplate jdbc(DataSource data){return new JdbcTemplate(data);}
        @Bean PlatformTransactionManager tx(DataSource data){return new DataSourceTransactionManager(data);}
        @Bean ObjectMapper json(){return new ObjectMapper();}
        @Bean CourseScheduleService schedules(JdbcTemplate db,ObjectMapper json){return new CourseScheduleService(db,json);}
        @Bean PersonalScheduleEditingService edits(CourseScheduleService s,JdbcTemplate db,ObjectMapper json){return new PersonalScheduleEditingService(s,db,json);}
        @Bean MaterialCommandService commands(JdbcTemplate db,ObjectMapper json){return new MaterialCommandService(db,json);}
    }
    @Autowired JdbcTemplate db;@Autowired CourseScheduleService schedules;@Autowired PersonalScheduleEditingService edits;@Autowired MaterialCommandService commands;
    static final LocalDate AUTUMN=LocalDate.of(2026,9,7),SPRING=LocalDate.of(2027,3,1);
    CourseScheduleService.Course course(String room,List<Integer> weeks){return new CourseScheduleService.Course("合成网络",1,"08:30","09:15",weeks,room);}
    CourseScheduleService.Input input(int rev,LocalDate start,List<CourseScheduleService.Course> rows){return new CourseScheduleService.Input(rev,start.equals(AUTUMN)?"合成秋季":"合成春季",start,7,rows);}
    @BeforeEach void setup() throws Exception {
        db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(20),status INT)");db.update("INSERT INTO users VALUES(1,1,'STUDENT',1),(2,1,'STUDENT',1)");
        var schema=new org.springframework.core.io.ClassPathResource("schema.sql").getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        String portion=schema.substring(schema.indexOf("CREATE TABLE IF NOT EXISTS student_course_schedule_versions"),schema.indexOf("CREATE TABLE IF NOT EXISTS private_material_quota"));
        for(var sql:portion.replaceAll("(?m)^\\s*--[^\\r\\n]*","").split(";"))if(!sql.isBlank())db.execute(sql);
    }
    @Test void dayEditRetainsOtherWeeksAndHistoryAndQueriesArchivedTerms(){
        schedules.save(1L,input(0,AUTUMN,List.of(course("A",List.of(1,2,3)))));
        var moved=new CourseScheduleService.Course("合成网络",2,"08:30","09:15",List.of(2),"B");
        edits.edit(1L,new PersonalScheduleEditingService.Edit(List.of(input(1,AUTUMN,List.of(course("A",List.of(1,3)),moved))),"只改第二周周一到周二"));
        schedules.save(1L,input(2,SPRING,List.of(course("C",List.of(1)))));
        assertThat(schedules.forWeek(1L,AUTUMN.plusWeeks(1)).schedule().courses()).extracting(CourseScheduleService.Course::weekday).containsExactly(2);
        assertThat(schedules.forWeek(1L,AUTUMN).schedule().courses().get(0).room()).isEqualTo("A");
        assertThat(edits.revision(1L,1).courses()).containsExactly(course("A",List.of(1,2,3)));
        assertThat(edits.history(1L,0).total()).isEqualTo(3);
        assertThat(edits.history(2L,0).total()).isZero();assertThatThrownBy(()->edits.revision(2L,1)).hasMessageContaining("404");
    }
    @Test void crossTermEditsAreAtomicAndPreserveDistinctTargets(){
        schedules.save(1L,input(0,AUTUMN,List.of(course("A",List.of(1)))));
        edits.edit(1L,new PersonalScheduleEditingService.Edit(List.of(input(1,AUTUMN,List.of()),input(0,SPRING,List.of(course("B",List.of(1,2))))),"移动到明确春季"));
        assertThat(schedules.terms(1L)).hasSize(2);assertThat(schedules.forWeek(1L,AUTUMN).schedule().courses()).isEmpty();
        assertThat(schedules.forWeek(1L,SPRING).schedule().courses()).hasSize(1);
        int before=edits.history(1L,0).total();
        assertThatThrownBy(()->edits.edit(1L,new PersonalScheduleEditingService.Edit(List.of(input(2,AUTUMN,List.of(course("Z",List.of(1)))),input(3,SPRING,List.of(course("bad",List.of(31))))),"必须全回滚"))).hasMessageContaining("400");
        assertThat(edits.history(1L,0).total()).isEqualTo(before);assertThat(schedules.forWeek(1L,AUTUMN).schedule().courses()).isEmpty();
    }
    @Test void restoringOldContentAlwaysCreatesNewVersionAndKeepsDeletionHistory(){
        schedules.save(1L,input(0,AUTUMN,List.of(course("A",List.of(1)))));schedules.delete(1L,1);
        assertThat(schedules.get(1L).schedule()).isNull();assertThat(edits.history(1L,0).total()).isEqualTo(2);
        var old=edits.revision(1L,1);
        var result=edits.edit(1L,new PersonalScheduleEditingService.Edit(List.of(input(2,AUTUMN,old.courses())),"恢复v1内容但不回拨版本"));
        assertThat(result.schedule().revision()).isEqualTo(3);assertThat(edits.history(1L,0).total()).isEqualTo(3);
        assertThatThrownBy(()->edits.edit(1L,new PersonalScheduleEditingService.Edit(List.of(input(1,AUTUMN,old.courses())),"旧草稿"))).hasMessageContaining("409");
    }
    @Test void durableCommandReplaysPrivateEditingWithoutAnotherRevision(){
        schedules.save(1L,input(0,AUTUMN,List.of(course("A",List.of(1)))));
        var edit=new PersonalScheduleEditingService.Edit(List.of(input(1,AUTUMN,List.of(course("B",List.of(1))))),"更正教室");String id=UUID.randomUUID().toString();
        var first=commands.execute(1L,id,"PERSONAL_SCHEDULE",edit,()->edits.edit(1L,edit));
        assertThat(commands.execute(1L,id,"PERSONAL_SCHEDULE",edit,()->edits.edit(1L,edit))).isEqualTo(first);
        assertThat(schedules.get(1L).schedule().revision()).isEqualTo(2);
        assertThatThrownBy(()->commands.read(2L,id)).hasMessageContaining("404");
    }
}
