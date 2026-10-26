package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(90)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_GOVERNANCE_MYSQL",matches="true")
class TeachingMysqlGovernanceTest {
    @Test void nativeEvidenceScopesRetentionLatestCorrectionAndBoundedExportRechecks()throws Exception{
        String schema=System.getenv("GOVERNANCE_TEST_MYSQL_SCHEMA");assertTrue(schema!=null && schema.matches("campthink_governance_20261017_[a-f0-9]{12}"));
        int port=Integer.parseInt(System.getenv("GOVERNANCE_TEST_MYSQL_PORT"));assertTrue(port>=1024 && port<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");config.setUsername(System.getenv("GOVERNANCE_TEST_MYSQL_USER"));config.setPassword(System.getenv("GOVERNANCE_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(4);config.setMinimumIdle(1);config.setConnectionTimeout(2000);config.setPoolName("task-governance-only");
        try(var pool=new HikariDataSource(config)){
            var flow=new TeachingGovernanceWorkflowTest();flow.syntheticDataSource=pool;long start=System.nanoTime();
            try{
                flow.setup();var f=flow.f;var service=flow.service;f.db.setQueryTimeout(5);f.migration("2026-10-17-teaching-evidence-index.sql");
                flow.allViewsReadOnlyTheirCapturedRangeWithRealPagingAndExpiryUnits();
                var preview=service.preview(7,flow.filter("COUNSELOR","AUDIT"));assertEquals(2,preview.count());var artifact=service.download(7,new TeachingGovernanceService.ExportRequest(preview.token()));String csv=new String(artifact.bytes(),StandardCharsets.UTF_8);assertTrue(csv.contains("EARLY_LEAVE"));assertFalse(csv.contains("synthetic-4"));assertEquals(preview.sha256(),artifact.sha256());
                f.clock.value=Instant.parse("2027-10-14T07:35:01Z");assertEquals(2,service.page(1,flow.filter("ADMIN","ATTENDANCE"),0,25).expiredWithinScope());
                f.service.mark(6,f.first,new TeachingService.RollCall(2,List.of(new TeachingService.Mark(f.studentA,"ON_TIME")),"合成：原生最后更正延长保留",true));
                var current=service.page(1,flow.filter("ADMIN","ATTENDANCE"),0,25);assertEquals(1,current.expiredWithinScope());assertEquals(Instant.parse("2028-10-14T07:35:01Z"),current.items().stream().filter(r->r.studentId().equals(f.studentA)).findFirst().orElseThrow().retainedUntil());assertEquals(3,service.page(1,flow.filter("ADMIN","AUDIT"),0,25).expiredWithinScope());
                var own=service.preview(6,flow.filter("TEACHER","AUDIT"));f.service.mark(6,f.first,new TeachingService.RollCall(3,List.of(new TeachingService.Mark(f.studentB,"ON_TIME")),"合成：原生导出准备后变化",true));
                assertEquals(409,assertThrows(ResponseStatusException.class,()->service.download(6,new TeachingGovernanceService.ExportRequest(own.token()))).getStatusCode().value());
                var scoped=service.preview(7,flow.filter("COUNSELOR","ATTENDANCE"));f.db.update("DELETE FROM teaching_grants WHERE user_id=7");assertEquals(403,assertThrows(ResponseStatusException.class,()->service.download(7,new TeachingGovernanceService.ExportRequest(scoped.token()))).getStatusCode().value());
                assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));assertEquals(5,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
                String foreign=UUID.randomUUID().toString();f.db.update("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",foreign,2,"另一合成学院","外校合成班","synthetic-only");f.db.update("UPDATE teaching_attendance_scopes SET admin_class_id=? WHERE lesson_id=? AND student_id=?",foreign,f.first,f.studentA);
                assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(6,flow.filter("TEACHER","ATTENDANCE"),0,25)).getStatusCode().value());
                var evidence=new LinkedHashMap<String,Object>();evidence.put("engine","isolated native MySQL");evidence.put("version",f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("syntheticOnly",true);evidence.put("schoolSchemaTargeted",false);evidence.put("normalSignedControllerAndFourRoleScopes",true);evidence.put("capturedHistoricalClassPreserved",true);evidence.put("latestCorrectionExtendsCalendarYear",true);evidence.put("auditExpirySeparate",true);evidence.put("exportScopedAndChecksumMatched",true);evidence.put("changedEvidence409",true);evidence.put("revokedGrant403",true);evidence.put("crossSchoolCapturedClassRejected503",true);evidence.put("deletionEnabled",false);evidence.put("elapsedMillis",(System.nanoTime()-start)/1000000);
                Path path=Path.of("../.local/runtime/teaching-mysql-governance-2026-10-17.json");Files.createDirectories(path.getParent());Files.writeString(path,f.json.writeValueAsString(evidence));System.out.println("MYSQL_GOVERNANCE "+f.json.writeValueAsString(evidence));
            }finally{flow.close();}
        }
    }
}
