package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in correctness checks on a new loopback-only schema, not a production capacity test. */
@Timeout(120)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_REENROLLMENT_MYSQL",matches="true")
class TeachingMysqlReenrollmentTest {
    @Test void nativeReadmissionReenrollmentReceiptsScopesLocksAndHistoricalEvidence()throws Exception{
        String schema=System.getenv("REENROLLMENT_TEST_MYSQL_SCHEMA");assertTrue(schema!=null && schema.matches("campthink_reenrollment_20261017_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("REENROLLMENT_TEST_MYSQL_PORT"));assertTrue(port>=1024 && port<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&useUnicode=true&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");
        config.setUsername(System.getenv("REENROLLMENT_TEST_MYSQL_USER"));config.setPassword(System.getenv("REENROLLMENT_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(4);config.setMinimumIdle(1);config.setConnectionTimeout(2000);config.setPoolName("task-reenrollment-only");
        try(var pool=new HikariDataSource(config)){
            var flow=new TeachingReenrollmentWorkflowTest();flow.syntheticDataSource=pool;long began=System.nanoTime();
            try{
                flow.setup();var f=flow.f;f.db.setQueryTimeout(5);
                // Reuse the same real-controller scenario on native SQL, not a fixed success stub.
                flow.rejoiningPreservesPastAttendanceAndOldNoticeReadStateAndReplaysExactlyOnce();
                f.lifecycle.transition(1,f.studentA,f.transition("LEAVE",null,0,f.a));
                f.lifecycle.transition(1,f.studentA,f.transition("RESTORE",f.b,1,f.a));
                assertFalse(f.service.courseMember(1,f.course,f.studentA).member().active());
                int revision=f.service.courseMember(1,f.course,f.studentA).revision();
                var restored=flow.service.reenroll(1,f.course,f.studentA,flow.input(revision,2,f.b));
                assertEquals(2,f.service.detailPage(9,"SECRETARY",f.second,0,50,"").total());
                assertEquals(404,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->f.service.detailPage(7,"COUNSELOR",f.second,0,50,"")).getStatusCode().value());
                assertEquals(1,f.service.detailPage(7,"COUNSELOR",f.first,0,50,"").total());
                assertEquals("LATE",f.db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,f.first,f.studentA));
                f.service.withdrawMember(1,f.course,f.studentA,new TeachingService.WithdrawInput(restored.revision(),"合成：原生幂等并发核验"));
                var same=flow.input(restored.revision()+1,2,f.b);var poolTasks=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
                try{
                    var one=poolTasks.submit(()->{barrier.await(3,TimeUnit.SECONDS);return flow.service.reenroll(1,f.course,f.studentA,same);});
                    var two=poolTasks.submit(()->{barrier.await(3,TimeUnit.SECONDS);return flow.service.reenroll(1,f.course,f.studentA,same);});
                    assertEquals(one.get(15,TimeUnit.SECONDS),two.get(15,TimeUnit.SECONDS));
                }finally{poolTasks.shutdownNow();assertTrue(poolTasks.awaitTermination(3,TimeUnit.SECONDS));}
                assertEquals(3,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_requests",Integer.class));
                assertEquals(3,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_audit WHERE action='REENROLL'",Integer.class));
                int current=f.service.courseMember(1,f.course,f.studentA).revision();
                f.service.withdrawMember(1,f.course,f.studentA,new TeachingService.WithdrawInput(current,"合成：原生事务回滚核验"));
                var failing=flow.input(current+1,2,f.b);
                f.db.execute("ALTER TABLE teaching_enrollment_requests ADD CONSTRAINT synthetic_reenroll_failure CHECK(request_id<>'"+failing.requestId()+"')");
                int rows=f.db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class);
                assertThrows(org.springframework.dao.DataAccessException.class,()->flow.service.reenroll(1,f.course,f.studentA,failing));
                assertFalse(f.service.courseMember(1,f.course,f.studentA).member().active());assertEquals(current+1,f.service.courseMember(1,f.course,f.studentA).revision());
                assertEquals(rows,f.db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class));
                f.clock.value=Instant.parse("2026-10-21T05:55:00Z");
                var before=f.service.detailPage(6,"TEACHER",f.second,0,50,"").detail();assertEquals(1,before.entries().size());
                f.service.markPage(6,f.second,new TeachingService.RollCall(before.lesson().revision(),List.of(new TeachingService.Mark(f.studentB,"ON_TIME")),"",true),0,50,"");
                int oldTeacherVersion=f.service.detailPage(6,"TEACHER",f.second,0,50,"").detail().lesson().revision();
                flow.service.reenroll(1,f.course,f.studentA,flow.input(current+1,2,f.b));
                var after=f.service.detailPage(6,"TEACHER",f.second,0,50,"").detail();assertFalse(after.lesson().finalized());assertEquals(1,after.lesson().counts().unknown());assertEquals(1,after.lesson().counts().onTime());
                assertEquals(409,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->f.service.markPage(6,f.second,new TeachingService.RollCall(oldTeacherVersion,List.of(new TeachingService.Mark(f.studentB,"ON_TIME")),"",true),0,50,"")).getStatusCode().value());
                assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=? AND student_id=?",Integer.class,f.second,f.studentB));
                assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));
                var evidence=new LinkedHashMap<String,Object>();evidence.put("engine","isolated native MySQL");evidence.put("version",f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("syntheticOnly",true);evidence.put("schoolSchemaTargeted",false);evidence.put("historicalStatusAndScopesPreserved",true);evidence.put("noticeIdentityAndReadPreserved",true);evidence.put("readmissionDidNotRestoreElectiveAutomatically",true);evidence.put("newCollegeScopeApplied",true);evidence.put("sameRequestConcurrentReplayOnce",true);evidence.put("receiptFailureRolledBack",true);evidence.put("otherStudentsRecordedStatusPreserved",true);evidence.put("oldTeacherDraftRejected409",true);evidence.put("elapsedMillis",(System.nanoTime()-began)/1000000);
                Path output=Path.of("../.local/runtime/teaching-mysql-reenrollment-2026-10-17.json");Files.createDirectories(output.getParent());Files.writeString(output,f.json.writeValueAsString(evidence));System.out.println("MYSQL_REENROLLMENT "+f.json.writeValueAsString(evidence));
            }finally{flow.close();}
        }
    }
}
