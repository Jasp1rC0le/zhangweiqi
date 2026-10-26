package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.sql.Timestamp;
import java.util.*;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Timeout(90)
@EnabledIfEnvironmentVariable(named="RUN_TEACHING_ADMIN_AUDIT_MYSQL",matches="true")
class TeachingMysqlAdministrativeAuditTest {
    @Test void nativeFiveWayUnionCountsDeletionRetentionAndSameSchoolAdminOnly()throws Exception{
        String schema=System.getenv("ADMIN_AUDIT_TEST_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_admin_audit_20261017_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("ADMIN_AUDIT_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var config=new HikariConfig();config.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");config.setUsername(System.getenv("ADMIN_AUDIT_TEST_MYSQL_USER"));config.setPassword(System.getenv("ADMIN_AUDIT_TEST_MYSQL_PASSWORD"));config.setMaximumPoolSize(4);config.setMinimumIdle(1);config.setConnectionTimeout(2000);config.setPoolName("task-management-audit-only");
        try(var pool=new HikariDataSource(config)){
            var flow=new TeachingAdministrativeAuditWorkflowTest();flow.syntheticDataSource=pool;long start=System.nanoTime();
            try{
                flow.setup();var f=flow.f;f.db.setQueryTimeout(5);f.migration("2026-10-17-teaching-management-audit-index.sql");flow.normalAdminReadsFiveKindsWithCompleteCountsAndStableUnionPages();
                for(int i=0;i<63;i++)f.db.update("INSERT INTO teaching_binding_audit VALUES(?,?,?,?,?,?,?)",UUID.randomUUID().toString(),1,f.studentA,1,null,2,Timestamp.from(f.clock.instant()));
                var seen=new HashSet<String>();for(int p=0;p<3;p++){var page=flow.service.page(1,flow.filter("ACCOUNT_BINDING",""),p,25);assertEquals(64,page.total());for(var row:page.items())assertTrue(seen.add(row.id()));}assertEquals(64,seen.size());
                f.db.update("UPDATE teaching_students SET name='合成_100%同学' WHERE id=?",f.studentA);assertEquals(64,flow.service.page(1,flow.filter("ACCOUNT_BINDING","%"),0,25).total());assertEquals(0,flow.service.page(1,flow.filter("ALL","不存在%_"),0,25).total());
                int all=flow.service.page(1,flow.filter("ALL",""),0,25).total();var prepared=flow.service.preview(1,flow.filter("ALL",""));assertEquals(all,prepared.count());var exported=flow.service.download(1,new TeachingAdministrativeAuditService.ExportRequest(prepared.token()));assertEquals(prepared.sha256(),exported.sha256());assertEquals(all+3,new String(exported.bytes(),StandardCharsets.UTF_8).split("\r\n").length);
                flow.mvc.perform(post(flow.path+"/export").header("Authorization","Bearer "+flow.tokens.get(1L)).contentType("application/json").content(f.json.writeValueAsString(new TeachingAdministrativeAuditService.ExportRequest(prepared.token())))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Content-SHA256",prepared.sha256())).andExpect(content().bytes(exported.bytes()));
                f.db.update("UPDATE users SET role='STUDENT' WHERE id=1");assertEquals(403,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->flow.service.download(1,new TeachingAdministrativeAuditService.ExportRequest(prepared.token()))).getStatusCode().value());f.db.update("UPDATE users SET role='ADMIN' WHERE id=1");
                f.db.update("DELETE FROM users WHERE id=2");assertEquals(all,flow.service.page(1,flow.filter("ALL",""),0,25).total());assertEquals(2,flow.service.page(1,flow.filter("IDENTITY_REVIEW",""),0,25).total());assertEquals(409,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->flow.service.download(1,new TeachingAdministrativeAuditService.ExportRequest(prepared.token()))).getStatusCode().value());
                f.db.update("DELETE FROM users WHERE id=1");f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");assertEquals(all,flow.service.page(10,flow.filter("ALL",""),0,25).total());assertTrue(flow.service.page(10,flow.filter("ACCOUNT_BINDING",""),0,25).items().stream().allMatch(r->r.actorName().equals("历史操作账号")));
                var retained=flow.service.preview(10,flow.filter("ALL",""));assertEquals(all,retained.count());assertTrue(new String(flow.service.download(10,new TeachingAdministrativeAuditService.ExportRequest(retained.token())).bytes(),StandardCharsets.UTF_8).contains("历史操作账号"));
                flow.mvc.perform(get(flow.path+"/access").header("Authorization","Bearer "+flow.tokens.get(6L))).andExpect(status().isForbidden());f.db.update("UPDATE users SET role='ADMIN' WHERE id=11");assertEquals(0,flow.service.page(11,flow.filter("ALL",""),0,25).total());
                var result=new LinkedHashMap<String,Object>();result.put("engine","isolated native MySQL");result.put("version",f.db.queryForObject("SELECT VERSION()",String.class));result.put("schema",schema);result.put("syntheticOnly",true);result.put("schoolSchemaTargeted",false);result.put("normalSignedAdminAndSchoolScope",true);result.put("fiveKindsUnionAndCompleteCounts",true);result.put("64BindingEventsTraversedAcrossThreePages",true);result.put("literalWildcardSearch",true);result.put("deletedTargetAndActorAuditsRetained",true);result.put("noHistoricalClassInventedFromCurrentClass",true);result.put("indexesAppliedOnlyToSyntheticSchema",true);result.put("elapsedMillis",(System.nanoTime()-start)/1000000);
                result.put("completeManagementCsvRows",all);result.put("csvChecksumAndNormalControllerBytes",true);result.put("freshAdminRevocationAndChangedDisplay409",true);result.put("deletedAccountsRetainedInExport",true);result.put("archiveOrDeletionPerformed",false);
                Path path=Path.of("../.local/runtime/teaching-mysql-management-export-2026-10-17.json");Files.createDirectories(path.getParent());Files.writeString(path,f.json.writeValueAsString(result));System.out.println("MYSQL_MANAGEMENT_EXPORT "+f.json.writeValueAsString(result));
            }finally{flow.close();}
        }
    }
}
