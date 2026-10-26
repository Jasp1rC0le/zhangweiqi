package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(90)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_COURSE_MODE_MYSQL",matches="true")
class TeachingMysqlCourseModeTest {
    @Test void nativeSourceReviewDurableReceiptReplayConcurrentRetryAndRollback()throws Exception{
        String schema=System.getenv("COURSE_MODE_TEST_MYSQL_SCHEMA");assertTrue(schema!=null && schema.matches("campthink_course_mode_20261017_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("COURSE_MODE_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");config.setUsername(System.getenv("COURSE_MODE_TEST_MYSQL_USER"));config.setPassword(System.getenv("COURSE_MODE_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(4);config.setMinimumIdle(1);config.setConnectionTimeout(2000);config.setPoolName("task-course-mode-only");
        try(var pool=new HikariDataSource(config)){
            var flow=new TeachingCourseModeWorkflowTest();flow.syntheticDataSource=pool;long start=System.nanoTime();
            try{
                flow.setup();var f=flow.f;f.db.setQueryTimeout(5);flow.normalAdminSeesExactCourseSourceCurrentVersionAndMixedAdministrativeMembership();flow.durableReceiptReplaysOncePreservesAttendanceAndMembershipAndKeepsReviewVersionSeparate();
                String course=UUID.randomUUID().toString();f.create(course,"合成原生整班核定",List.of(f.studentA),"14:00");f.db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",course);
                var request=flow.input("ADMIN_CLASS",0);var workers=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
                try{var one=workers.submit(()->{barrier.await(2,TimeUnit.SECONDS);return f.lifecycle.reviewModeReceipt(1,course,request);});var two=workers.submit(()->{barrier.await(2,TimeUnit.SECONDS);return f.lifecycle.reviewModeReceipt(1,course,request);});assertEquals(one.get(12,TimeUnit.SECONDS),two.get(12,TimeUnit.SECONDS));}finally{workers.shutdownNow();assertTrue(workers.awaitTermination(2,TimeUnit.SECONDS));}
                assertEquals("ADMIN_CLASS",f.lifecycle.modeStatus(1,course).mode());assertEquals(2,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));
                String failing=UUID.randomUUID().toString();f.create(failing,"合成原生来源回滚",List.of(f.studentA),"14:00");f.db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",failing);f.db.execute("ALTER TABLE teaching_course_mode_reviews ADD CONSTRAINT synthetic_mode_reject CHECK(course_id<>'"+failing+"')");
                assertThrows(org.springframework.dao.DataAccessException.class,()->f.lifecycle.reviewModeReceipt(1,failing,flow.input("EXPLICIT",0)));assertEquals("LEGACY",f.lifecycle.modeStatus(1,failing).mode());assertEquals(0,f.lifecycle.modeStatus(1,failing).revision());assertEquals(2,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));
                var result=new LinkedHashMap<String,Object>();result.put("engine","isolated native MySQL");result.put("version",f.db.queryForObject("SELECT VERSION()",String.class));result.put("schema",schema);result.put("syntheticOnly",true);result.put("schoolSchemaTargeted",false);result.put("normalSignedAdminAndSchoolScope",true);result.put("exactCourseAndCrossClassCounters",true);result.put("historyMembershipAndNoticesUnchangedByReview",true);result.put("durableReplayOnce",true);result.put("concurrentSameRequestOneEffect",true);result.put("stableTimestampPrecision",true);result.put("receiptFailureRolledBack",true);result.put("elapsedMillis",(System.nanoTime()-start)/1000000);
                Path path=Path.of("../.local/runtime/teaching-mysql-course-mode-2026-10-17.json");Files.createDirectories(path.getParent());Files.writeString(path,f.json.writeValueAsString(result));System.out.println("MYSQL_COURSE_MODE "+f.json.writeValueAsString(result));
            }finally{flow.close();}
        }
    }
}
