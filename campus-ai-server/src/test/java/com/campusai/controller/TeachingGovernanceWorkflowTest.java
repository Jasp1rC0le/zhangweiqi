package com.campusai.controller;

import com.campusai.teaching.*;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real signed synthetic sessions and transaction services; no actual school records. */
@Timeout(20)
class TeachingGovernanceWorkflowTest {
    TeachingRosterWorkflowTest f;TeachingGovernanceService service;
    javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();service=f.context.getBean(TeachingGovernanceService.class);}
    @AfterEach void close(){if(f!=null)f.close();}
    TeachingGovernanceService.Filter filter(String view,String kind){return new TeachingGovernanceService.Filter(view,LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),"",kind,false);}
    void mark() {
        f.clock.value=Instant.parse("2026-10-14T06:02:00Z");
        f.service.mark(6,f.first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(f.studentA,"ON_TIME"),new TeachingService.Mark(f.studentB,"ABSENT")),"",true));
        f.service.mark(6,f.first,new TeachingService.RollCall(1,List.of(new TeachingService.Mark(f.studentA,"EARLY_LEAVE")),"合成：教师核对早退",true));
    }
    @Test void allViewsReadOnlyTheirCapturedRangeWithRealPagingAndExpiryUnits()throws Exception{
        mark();var teacher=service.page(6,filter("TEACHER","AUDIT"),0,1);
        assertEquals(3,teacher.total());assertEquals(3,teacher.totalPages());assertEquals(1,teacher.items().size());assertFalse(teacher.deletionEnabled());
        var seen=new HashSet<String>();for(int p=0;p<3;p++)assertTrue(seen.add(service.page(6,filter("TEACHER","AUDIT"),p,1).items().get(0).id()));
        assertEquals(2,service.page(2,filter("STUDENT","AUDIT"),0,25).total());
        assertEquals(2,service.page(7,filter("COUNSELOR","AUDIT"),0,25).total());
        assertEquals(2,service.page(8,filter("SECRETARY","AUDIT"),0,25).total());
        var other=service.page(9,filter("SECRETARY","AUDIT"),0,25);assertEquals(1,other.total());assertEquals("ABSENT",other.items().get(0).newStatus());
        assertEquals(3,service.page(1,filter("ADMIN","AUDIT"),0,25).total());assertEquals(2,service.page(1,filter("ADMIN","ATTENDANCE"),0,25).total());
        assertEquals("EARLY_LEAVE",service.page(2,filter("STUDENT","ATTENDANCE"),0,25).items().get(0).status());
        f.db.update("UPDATE teaching_students SET class_id=? WHERE id=?",f.b,f.studentA);
        assertEquals(2,service.page(7,filter("COUNSELOR","AUDIT"),0,25).total()); // original affiliation is not the current class
        assertEquals(1,service.page(9,filter("SECRETARY","AUDIT"),0,25).total());
        var path=get("/api/teaching/governance/page").param("view","SECRETARY").param("from","2026-10-14").param("to","2026-10-14").param("kind","AUDIT");
        var value=f.read(8,path,200);assertFalse(value.toString().contains("synthetic-4"));assertEquals(2,value.get("total").asInt());
    }
    @Test void expiredAttendanceWaitsAFullCalendarYearAfterLatestCorrectionAndNeverDeletes() {
        mark();f.clock.value=Instant.parse("2027-10-14T07:35:01Z");
        assertEquals(2,service.page(1,filter("ADMIN","ATTENDANCE"),0,25).expiredWithinScope());
        // A later permitted correction extends the record bundle, not old immutable audit rows.
        f.service.mark(6,f.first,new TeachingService.RollCall(2,List.of(new TeachingService.Mark(f.studentA,"ON_TIME")),"合成：一年后复核但保留原值",true));
        var page=service.page(1,filter("ADMIN","ATTENDANCE"),0,25);assertEquals(1,page.expiredWithinScope());
        var own=page.items().stream().filter(r->r.studentId().equals(f.studentA)).findFirst().orElseThrow();assertEquals(Instant.parse("2028-10-14T07:35:01Z"),own.retainedUntil());assertFalse(own.eligible());
        var audit=service.page(1,filter("ADMIN","AUDIT"),0,25);assertEquals(4,audit.total());assertEquals(3,audit.expiredWithinScope());
        var dueFilter=new TeachingGovernanceService.Filter("ADMIN",filter("ADMIN","ATTENDANCE").from(),filter("ADMIN","ATTENDANCE").to(),"","ATTENDANCE",true);
        assertEquals(1,service.page(1,dueFilter,0,25).total());assertEquals(2,service.page(1,dueFilter,0,25).rangeTotal());
        assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
    }
    @Test void exportIsCompleteScopedFormulaSafeAndBoundToOwnerSnapshotAndFiveMinuteWindow()throws Exception{
        mark();f.db.update("UPDATE teaching_attendance SET student_name=?,student_number=? WHERE lesson_id=? AND student_id=?","=HYPERLINK(\"https://invalid.example\")","000123456789012345",f.first,f.studentA);
        var preview=service.preview(7,filter("COUNSELOR","AUDIT"));assertEquals(2,preview.count());assertEquals(2000,preview.maxRows());assertFalse(preview.deletionEnabled());
        var artifact=service.download(7,new TeachingGovernanceService.ExportRequest(preview.token()));var csv=new String(artifact.bytes(),StandardCharsets.UTF_8);
        assertEquals(preview.sha256(),artifact.sha256());assertTrue(csv.startsWith("\uFEFF"));assertTrue(csv.contains("'=HYPERLINK"));assertTrue(csv.contains("'000123456789012345"));assertFalse(csv.contains("synthetic-4"));assertEquals(5,csv.split("\r\n").length);
        assertEquals(410,assertThrows(ResponseStatusException.class,()->service.download(9,new TeachingGovernanceService.ExportRequest(preview.token()))).getStatusCode().value());
        f.db.update("DELETE FROM teaching_grants WHERE user_id=7");assertEquals(403,assertThrows(ResponseStatusException.class,()->service.download(7,new TeachingGovernanceService.ExportRequest(preview.token()))).getStatusCode().value());
        var second=service.preview(6,filter("TEACHER","AUDIT"));f.service.mark(6,f.first,new TeachingService.RollCall(2,List.of(new TeachingService.Mark(f.studentB,"ON_TIME")),"合成：预览后改变",true));
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.download(6,new TeachingGovernanceService.ExportRequest(second.token()))).getStatusCode().value());
        var current=service.preview(6,filter("TEACHER","AUDIT"));f.clock.value=f.clock.value.plusSeconds(301);
        assertEquals(410,assertThrows(ResponseStatusException.class,()->service.download(6,new TeachingGovernanceService.ExportRequest(current.token()))).getStatusCode().value());
        var response=f.mvc.perform(get("/api/teaching/governance/export-preview").param("view","ADMIN").param("from","2026-10-14").param("to","2026-10-14").header("Authorization","Bearer "+f.tokens.get(1L))).andExpect(status().isOk()).andReturn();
        String token=f.json.readTree(response.getResponse().getContentAsString()).get("token").asString();
        f.mvc.perform(post("/api/teaching/governance/export").contentType("application/json").content(f.json.writeValueAsString(new TeachingGovernanceService.ExportRequest(token))).header("Authorization","Bearer "+f.tokens.get(1L))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().exists("X-Content-SHA256")).andExpect(header().string("Content-Type","text/csv;charset=UTF-8"));
    }
    @Test void noRoleClassSchoolOrBaselineBypassAndNoTruncatedExport()throws Exception{
        mark();assertEquals(403,assertThrows(ResponseStatusException.class,()->service.page(2,filter("ADMIN","AUDIT"),0,25)).getStatusCode().value());
        assertEquals(403,assertThrows(ResponseStatusException.class,()->service.page(11,filter("TEACHER","AUDIT"),0,25)).getStatusCode().value());
        var foreign=new TeachingGovernanceService.Filter("COUNSELOR",filter("COUNSELOR","AUDIT").from(),filter("COUNSELOR","AUDIT").to(),f.b,"AUDIT",false);
        assertEquals(404,assertThrows(ResponseStatusException.class,()->service.page(7,foreign,0,25)).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.page(6,new TeachingGovernanceService.Filter("TEACHER",LocalDate.of(2026,1,1),LocalDate.of(2026,12,31),"","AUDIT",false),0,25)).getStatusCode().value());
        f.mvc.perform(get("/api/teaching/governance/access")).andExpect(status().isUnauthorized());
        var access=f.read(2,get("/api/teaching/governance/access"),200);assertFalse(access.get("views").toString().contains("ADMIN"));
        for(int i=0;i<2000;i++)f.db.update("INSERT INTO teaching_attendance_audit VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),1,f.first,f.studentA,6,"ON_TIME","EARLY_LEAVE","合成：范围边界",java.sql.Timestamp.from(f.clock.instant()));
        assertEquals(2003,service.page(6,filter("TEACHER","AUDIT"),0,25).total());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.preview(6,filter("TEACHER","AUDIT"))).getStatusCode().value());
        f.db.update("DELETE FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",f.first,f.studentB);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(6,filter("TEACHER","AUDIT"),0,25)).getStatusCode().value());
    }
    @Test void malformedHistoryOrCrossSchoolCapturedClassCannotSilentlyDropRows(){
        mark();f.db.update("UPDATE teaching_attendance_audit SET new_status='BAD_STATUS' WHERE student_id=?",f.studentA);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(6,filter("TEACHER","AUDIT"),0,25)).getStatusCode().value());
        String foreign=UUID.randomUUID().toString();f.db.update("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",foreign,2,"另一合成学院","外校合成班","synthetic-only");
        f.db.update("UPDATE teaching_attendance_scopes SET admin_class_id=? WHERE lesson_id=? AND student_id=?",foreign,f.first,f.studentA);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(6,filter("TEACHER","ATTENDANCE"),0,25)).getStatusCode().value());
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(1,filter("ADMIN","ATTENDANCE"),0,25)).getStatusCode().value());
    }
}
