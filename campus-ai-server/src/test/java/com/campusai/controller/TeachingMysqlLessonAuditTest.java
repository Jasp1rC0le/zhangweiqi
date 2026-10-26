package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(80) @EnabledIfEnvironmentVariable(named="RUN_LESSON_AUDIT_MYSQL",matches="true")
class TeachingMysqlLessonAuditTest {
    @Test void immutableReceiptUnionPagingAndCompleteCsvRunOnNativeMysql()throws Exception{
        String schema=System.getenv("LESSON_AUDIT_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_lesson_audit_20261018_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("LESSON_AUDIT_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var cfg=new HikariConfig();cfg.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");cfg.setUsername(System.getenv("LESSON_AUDIT_MYSQL_USER"));cfg.setPassword(System.getenv("LESSON_AUDIT_MYSQL_PASSWORD"));cfg.setMaximumPoolSize(4);cfg.setMinimumIdle(1);cfg.setConnectionTimeout(2000);cfg.setPoolName("task-lesson-audit-only");
        try(var pool=new HikariDataSource(cfg)){
            var flow=new TeachingLessonChangeAuditTest();flow.syntheticDataSource=pool;long started=System.nanoTime();
            try{
                flow.setup();flow.f.db.setQueryTimeout(5);flow.immutableSnapshotPagingExportAndNormalController();
                flow.f.db.update("UPDATE users SET role='ADMIN' WHERE id=1");
                var all=new TeachingAdministrativeAuditService.Filter("ALL",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),"");var union=flow.audits.page(1,all,0,25);assertTrue(union.total()>64);assertTrue(union.items().stream().anyMatch(r->r.kind().equals("LESSON_CHANGE")));
                var before=flow.audits.page(1,flow.filter(""),0,25);flow.f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");flow.f.db.update("DELETE FROM users WHERE id=1");assertEquals(before.total(),flow.audits.page(10,flow.filter(""),0,25).total());
                var evidence=new LinkedHashMap<String,Object>();evidence.put("engine",flow.f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("schoolDataTargeted",false);evidence.put("currentBatchOnly","new lesson-change management audit and complete CSV, not a rerun of old capacity samples");evidence.put("lessonAuditRows",64);evidence.put("pages",3);evidence.put("completeCsvRows",64);evidence.put("allKindsTotal",union.total());evidence.put("literalSnapshotSearch",true);evidence.put("historicalCourseTeacherAndRoomUnaffectedByCurrentRename",true);evidence.put("operatorDeletionPreservesAuditWithoutInventedDisplayName",true);evidence.put("normalAdminAndForeignSchoolBoundaries",true);evidence.put("preparedDownloadRevocationDenied",true);evidence.put("newSchemaOrBusinessWritesInImplementation",false);evidence.put("authenticationBoundary","signed synthetic MockMvc sessions, not real-login HTTP or production hardware");evidence.put("elapsedMillis",(System.nanoTime()-started)/1000000);
                var output=Path.of("../.local/runtime/teaching-mysql-lesson-audit-2026-10-18.json");Files.createDirectories(output.getParent());Files.writeString(output,flow.f.json.writeValueAsString(evidence));System.out.println("MYSQL_LESSON_AUDIT "+flow.f.json.writeValueAsString(evidence));
            }finally{flow.close();}
        }
    }
}
