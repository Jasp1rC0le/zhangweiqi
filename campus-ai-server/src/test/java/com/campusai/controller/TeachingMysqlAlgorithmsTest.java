package com.campusai.controller;

import com.campusai.teaching.*;
import com.campusai.timetable.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in native MySQL verification. The runner creates a fresh, strictly task-prefixed schema. */
@Timeout(90) @EnabledIfEnvironmentVariable(named="RUN_TEACHING_ALGORITHMS_MYSQL",matches="true")
class TeachingMysqlAlgorithmsTest {
    @Test void nativeMixedSqlLargeClassLifecycleAndConcurrentPointNameUseOnlySyntheticRecords()throws Exception{
        String schema=System.getenv("ALGORITHM_TEST_MYSQL_SCHEMA");assertTrue(schema!=null && schema.matches("campthink_algorithms_20261016_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("ALGORITHM_TEST_MYSQL_PORT"));assertTrue(port>=1024 && port<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&useUnicode=true&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");config.setUsername(System.getenv("ALGORITHM_TEST_MYSQL_USER"));config.setPassword(System.getenv("ALGORITHM_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(4);config.setMinimumIdle(1);config.setConnectionTimeout(2000);config.setPoolName("task-algorithm-only");
        try(var pool=new HikariDataSource(config)){
            var f=new TeachingRosterWorkflowTest();f.syntheticDataSource=pool;long began=System.nanoTime();
            try{
                f.setup();f.db.setQueryTimeout(5);LocalDate monday=LocalDate.of(2026,10,12);
                f.service.createRosterCourse(1,new TeachingService.RosterCourseInput(new TeachingService.CourseInput(UUID.randomUUID().toString(),f.a,6L,"MixedCase","合成学期",monday,3,"10:20","11:55",List.of(1,2),"Lab"),"合成双语教学组",List.of(f.studentA)));
                var saved=f.context.getBean(CourseScheduleService.class);saved.save(2L,new CourseScheduleService.Input(0,"合成学期",monday,7,List.of(new CourseScheduleService.Course("合成合班选修",3,"14:00","15:35",List.of(1,2),"合成教学室"),new CourseScheduleService.Course("MixedCase",3,"10:20","11:55",List.of(1,2),"Lab"),new CourseScheduleService.Course("mixedcase",3,"10:20","11:55",List.of(1,2),"Lab"),new CourseScheduleService.Course("仅本人副本",3,"08:30","10:05",List.of(1,2),"合成独立教室"))));
                f.db.update("UPDATE student_course_schedules SET checked_at=? WHERE user_id=2",java.sql.Timestamp.from(Instant.parse("2026-10-13T01:00:00Z")));
                var original=saved.get(2L).schedule();var ids=new HashSet<String>();var names=new HashSet<String>();
                for(int p=0;p<2;p++){
                    var page=f.unified.page(2,"STUDENT",monday,null,p,2);assertEquals(4,page.total());assertEquals(2,page.week().summary().mergedDuplicates());
                    page.week().entries().forEach(e->{assertTrue(ids.add(e.id()));names.add(e.name());});
                }
                assertEquals(4,ids.size());assertTrue(names.containsAll(Set.of("MixedCase","mixedcase")));assertEquals(1,f.unified.query(2,monday.plusDays(2),monday.plusDays(2),"ALL","NEXT","SUMMARY",null).count());
                f.largeMergedClassUsesAuthorizedSqlPagesAndCannotFinalizeOnlyCurrentPage();
                f.clock.value=Instant.parse("2026-10-15T05:00:00Z");
                f.lifecycle.transition(1,f.studentA,f.transition("TRANSFER",f.b,0,f.a));
                assertEquals(404,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->f.service.detailPage(7,"COUNSELOR",f.second,0,25,"")).getStatusCode().value());
                assertEquals(1,f.service.detailPage(8,"SECRETARY",f.first,0,25,"").total());
                assertEquals(2,f.service.detailPage(9,"SECRETARY",f.second,0,25,"").total());
                f.lifecycle.transition(1,f.studentA,f.transition("LEAVE",null,1,f.b));assertEquals(0,f.unified.page(2,"STUDENT",monday.plusWeeks(1),null,0,50).week().summary().plannedClasses());assertEquals(original,saved.get(2L).schedule());
                f.clock.value=Instant.parse("2026-10-21T05:55:00Z");int revision=f.service.detailPage(6,"TEACHER",f.second,0,50,"").detail().lesson().revision();
                var workers=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);List<Integer> results;
                try{
                    var mark=workers.submit(()->{barrier.await(3,TimeUnit.SECONDS);try{f.service.markPage(6,f.second,new TeachingService.RollCall(revision,List.of(new TeachingService.Mark(f.studentB,"ON_TIME")),"",false),0,50,"");return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
                    var leave=workers.submit(()->{barrier.await(3,TimeUnit.SECONDS);try{f.lifecycle.transition(1,f.studentB,f.transition("LEAVE",null,0,f.b));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
                    results=List.of(mark.get(12,TimeUnit.SECONDS),leave.get(12,TimeUnit.SECONDS));assertEquals(1,results.stream().filter(x->x==200).count());assertEquals(1,results.stream().filter(x->x==409).count());
                }finally{workers.shutdownNow();assertTrue(workers.awaitTermination(3,TimeUnit.SECONDS));}
                assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance a JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id WHERE a.status<>'UNKNOWN' AND r.withdrawn=TRUE",Integer.class));
                var evidence=Map.of("engine","isolated native MySQL","schema",schema,"syntheticOnly",true,"mixedDistinct",4,"caseSensitiveNamesPreserved",true,"largeRoster",702,"historyPreserved",true,"concurrentCodes",results,"elapsedMillis",(System.nanoTime()-began)/1000000);
                Path output=Path.of("../.local/runtime/teaching-mysql-algorithms-2026-10-16.json");Files.createDirectories(output.getParent());Files.writeString(output,f.json.writeValueAsString(evidence));System.out.println("MYSQL_ALGORITHMS "+f.json.writeValueAsString(evidence));
            }finally{f.close();}
        }
    }
}
