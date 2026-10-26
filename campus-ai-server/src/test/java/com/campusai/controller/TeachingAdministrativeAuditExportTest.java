package com.campusai.controller;

import com.campusai.teaching.TeachingAdministrativeAuditService;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Isolated H2 transactions, normal signed synthetic actors. No school files or records. */
@Timeout(20)
class TeachingAdministrativeAuditExportTest {
    TeachingAdministrativeAuditWorkflowTest flow;
    @BeforeEach void setup()throws Exception{flow=new TeachingAdministrativeAuditWorkflowTest();flow.setup();}
    @AfterEach void close(){flow.close();}
    TeachingAdministrativeAuditService.Filter filter(){return flow.filter("ACCOUNT_BINDING","");}
    void bindings(int count){for(int i=0;i<count;i++)flow.f.db.update("INSERT INTO teaching_binding_audit VALUES(?,?,?,?,?,?,?)",UUID.randomUUID().toString(),1,flow.f.studentA,1,null,2,Timestamp.from(flow.f.clock.instant()));}
    int code(Runnable action){return assertThrows(ResponseStatusException.class,action::run).getStatusCode().value();}
    @Test void completeExportIsNotJustTheFirstPageAndHttpReturnsActualChecksumAndNoStore()throws Exception{
        bindings(65);var service=flow.service;assertEquals(25,service.page(1,filter(),0,25).items().size());var preview=service.preview(1,filter());assertEquals(65,preview.count());assertEquals(2000,preview.maxRows());assertFalse(preview.deletionEnabled());
        var artifact=service.download(1,new TeachingAdministrativeAuditService.ExportRequest(preview.token()));assertEquals(preview.sha256(),artifact.sha256());String csv=new String(artifact.bytes(),StandardCharsets.UTF_8);assertTrue(csv.startsWith("\uFEFF"));assertEquals(68,csv.split("\r\n").length);assertTrue(csv.contains("未保存当时行政班快照"));assertTrue(csv.contains("'1"));assertFalse(csv.contains("行政班乙"));
        flow.mvc.perform(post(flow.path+"/export").header("Authorization","Bearer "+flow.tokens.get(1L)).contentType("application/json").content(flow.f.json.writeValueAsString(new TeachingAdministrativeAuditService.ExportRequest(preview.token()))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Content-SHA256",preview.sha256())).andExpect(content().contentType("text/csv;charset=UTF-8")).andExpect(content().bytes(artifact.bytes()));
        flow.mvc.perform(get(flow.path+"/export-preview").param("kind","ACCOUNT_BINDING").param("from","2026-10-14").param("to","2026-10-14")).andExpect(status().isUnauthorized());
        assertEquals(65,flow.f.db.queryForObject("SELECT COUNT(*) FROM teaching_binding_audit",Integer.class));
    }
    @Test void ownerCurrentAdminAndSchoolAreRecheckedRatherThanGrantedByThePreview(){
        bindings(1);var s=flow.service;var p=s.preview(1,filter());var request=new TeachingAdministrativeAuditService.ExportRequest(p.token());
        assertEquals(403,code(()->s.preview(2,filter())));assertEquals(410,code(()->s.download(2,request)));
        flow.f.db.update("UPDATE users SET role='STUDENT' WHERE id=1");assertEquals(403,code(()->s.download(1,request)));
        flow.f.db.update("UPDATE users SET role='ADMIN',school_id=2 WHERE id=1");assertEquals(403,code(()->s.download(1,request)));
        assertEquals(1,flow.f.db.queryForObject("SELECT COUNT(*) FROM teaching_binding_audit",Integer.class));
    }
    @Test void appendOrCurrentDisplayChangeInvalidatesTheContentSnapshot(){
        bindings(1);var s=flow.service;var first=s.preview(1,filter());bindings(1);assertEquals(409,code(()->s.download(1,new TeachingAdministrativeAuditService.ExportRequest(first.token()))));
        var next=s.preview(1,filter());flow.f.db.update("UPDATE teaching_students SET name='合成当前名字已修改' WHERE id=?",flow.f.studentA);assertEquals(409,code(()->s.download(1,new TeachingAdministrativeAuditService.ExportRequest(next.token()))));
    }
    @Test void deletedTargetAndActorAccountsDoNotDeleteHistoryOrInventAnOldAffiliation(){
        bindings(1);flow.f.db.update("DELETE FROM users WHERE id=2");var s=flow.service;var p=s.preview(1,filter());assertEquals(1,p.count());String csv=new String(s.download(1,new TeachingAdministrativeAuditService.ExportRequest(p.token())).bytes(),StandardCharsets.UTF_8);assertTrue(csv.contains("不用当前班级补造"));
        flow.f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");flow.f.db.update("DELETE FROM users WHERE id=1");var current=s.preview(10,filter());String historical=new String(s.download(10,new TeachingAdministrativeAuditService.ExportRequest(current.token())).bytes(),StandardCharsets.UTF_8);assertTrue(historical.contains("历史操作账号"));assertEquals(1,current.count());
    }
    @Test void formulaCellsAndLongStudentNumbersRemainTextAndCannotSplitCsvRows(){
        bindings(1);flow.f.db.update("UPDATE teaching_students SET name=?,student_number=? WHERE id=?","\t=HYPERLINK(\"https://invalid.example\")\n下一行","000123456789012345",flow.f.studentA);flow.f.db.update("UPDATE users SET nickname='+SUM(1,2)' WHERE id=1");
        var s=flow.service;var p=s.preview(1,filter());String csv=new String(s.download(1,new TeachingAdministrativeAuditService.ExportRequest(p.token())).bytes(),StandardCharsets.UTF_8);assertEquals(4,csv.split("\r\n").length);assertTrue(csv.contains("' =HYPERLINK"));assertTrue(csv.contains("'+SUM"));assertTrue(csv.contains("学号 000123456789012345"));assertFalse(csv.contains("\n下一行"));
    }
    @Test void emptyAndOversizedRangesCannotCreateAnEmptyOrTruncatedFile(){
        var s=flow.service;assertEquals(400,code(()->s.preview(1,filter())));bindings(2001);assertEquals(400,code(()->s.preview(1,filter())));assertEquals(2001,s.page(1,filter(),0,25).total());
    }
    @Test void tokenExpiryBoundedOwnerSlotsAndMalformedUnderlyingRowsFailClosed(){
        bindings(1);var s=flow.service;var first=s.preview(1,filter());for(int n=0;n<4;n++)s.preview(1,filter());assertEquals(410,code(()->s.download(1,new TeachingAdministrativeAuditService.ExportRequest(first.token()))));
        var valid=s.preview(1,filter());flow.f.clock.value=flow.f.clock.value.plusSeconds(301);assertEquals(410,code(()->s.download(1,new TeachingAdministrativeAuditService.ExportRequest(valid.token()))));
        var current=s.preview(1,filter());flow.f.db.update("UPDATE teaching_binding_audit SET new_user_id=-1");assertEquals(503,code(()->s.download(1,new TeachingAdministrativeAuditService.ExportRequest(current.token()))));
    }
}
