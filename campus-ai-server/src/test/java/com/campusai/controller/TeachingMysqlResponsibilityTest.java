package com.campusai.controller;

import com.campusai.teaching.TeachingAdministrativeAuditService;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in native engine check. Uses only a new task-prefixed loopback synthetic schema. */
@Timeout(90)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_RESPONSIBILITY_MYSQL",matches="true")
class TeachingMysqlResponsibilityTest {
    @Test void actualMysqlRevocationReceiptConcurrencyRollbackAndHistory()throws Exception{
        String schema=System.getenv("RESPONSIBILITY_TEST_MYSQL_SCHEMA");
        assertTrue(schema!=null&&schema.matches("campthink_responsibility_20261017_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("RESPONSIBILITY_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var cfg=new HikariConfig();cfg.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");
        cfg.setUsername(System.getenv("RESPONSIBILITY_TEST_MYSQL_USER"));cfg.setPassword(System.getenv("RESPONSIBILITY_TEST_MYSQL_PASSWORD"));cfg.setMaximumPoolSize(4);cfg.setMinimumIdle(1);cfg.setConnectionTimeout(2000);cfg.setPoolName("task-responsibility-only");
        try(var pool=new HikariDataSource(cfg)){
            var flow=new TeachingResponsibilityWorkflowTest();flow.syntheticDataSource=pool;long started=System.nanoTime();
            try{
                flow.setup();var f=flow.f;f.db.setQueryTimeout(5);
                flow.controllerChecksRealAdminAndLegacyWritesCannotBypassTheNewWorkflow();
                int attendance=flow.count("teaching_attendance"),notices=flow.count("teaching_notices");
                var request=flow.input(7,"COUNSELOR",f.a,0,"REVOKE","原生模拟负责调整");var ack=flow.service.change(1,request);
                assertEquals(ack,flow.service.change(1,request));assertEquals(1,flow.count("teaching_grant_audit"));
                assertEquals(403,flow.code(()->f.service.lessons(7,"COUNSELOR",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14))));
                assertEquals(attendance,flow.count("teaching_attendance"));assertEquals(notices,flow.count("teaching_notices"));
                flow.service.change(1,flow.input(7,"COUNSELOR",f.a,1,"GRANT","原生模拟恢复范围"));
                f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");var workers=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
                try{var jobs=new ArrayList<Future<Integer>>();for(long actor:List.of(1L,10L))jobs.add(workers.submit(()->{gate.await();try{flow.service.change(actor,flow.input(7,"COUNSELOR",f.c,2,"GRANT","原生模拟并发交接"));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}}));gate.countDown();var codes=new ArrayList<Integer>();for(var job:jobs)codes.add(job.get(12,TimeUnit.SECONDS));Collections.sort(codes);assertEquals(List.of(200,409),codes);}
                finally{workers.shutdownNow();assertTrue(workers.awaitTermination(3,TimeUnit.SECONDS));}
                assertEquals(3,flow.count("teaching_grant_audit"));
                f.migration("2026-10-17-teaching-responsibilities.sql");assertEquals(3,flow.service.check(1,7,"COUNSELOR",f.a).revision());
                f.db.execute("ALTER TABLE teaching_grant_audit ADD CONSTRAINT synthetic_responsibility_reject CHECK(reason<>'原生模拟审计拒绝')");
                assertThrows(org.springframework.dao.DataAccessException.class,()->flow.service.change(1,flow.input(7,"COUNSELOR",f.a,3,"REVOKE","原生模拟审计拒绝")));
                assertTrue(flow.service.check(1,7,"COUNSELOR",f.a).active());assertEquals(3,flow.service.check(1,7,"COUNSELOR",f.a).revision());
                var page=flow.service.page(1,7,"COUNSELOR",0,1);assertEquals(2,page.total());assertEquals(2,page.totalPages());
                assertNotEquals(page.items().get(0).scopeKey(),flow.service.page(1,7,"COUNSELOR",1,1).items().get(0).scopeKey());
                f.db.update("DELETE FROM users WHERE id IN (1,7)");var filter=new TeachingAdministrativeAuditService.Filter("RESPONSIBILITY",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),"");
                assertEquals(3,flow.audit.page(10,filter,0,25).total());var preview=flow.audit.preview(10,filter);var bytes=flow.audit.download(10,new TeachingAdministrativeAuditService.ExportRequest(preview.token())).bytes();
                assertTrue(new String(bytes,java.nio.charset.StandardCharsets.UTF_8).contains("原生模拟负责调整"));
                var evidence=new LinkedHashMap<String,Object>();evidence.put("engine",f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("syntheticOnly",true);evidence.put("schoolSchemaTargeted",false);evidence.put("signedControllerWithMockSessionRegistry",true);evidence.put("revocationImmediatelyDeniedReads",true);evidence.put("attendanceAndNoticesPreserved",true);evidence.put("replayOneEffect",true);evidence.put("concurrentAdmins200and409",true);evidence.put("auditFailureRollback",true);evidence.put("migrationRerunPreservesVersion",true);evidence.put("deletedAccountsRetainAuditAndCsv",true);evidence.put("elapsedMillis",(System.nanoTime()-started)/1000000);
                Path out=Path.of("../.local/runtime/teaching-mysql-responsibility-2026-10-17.json");Files.createDirectories(out.getParent());Files.writeString(out,f.json.writeValueAsString(evidence));System.out.println("MYSQL_RESPONSIBILITY "+f.json.writeValueAsString(evidence));
            }finally{flow.close();}
        }
    }
}
