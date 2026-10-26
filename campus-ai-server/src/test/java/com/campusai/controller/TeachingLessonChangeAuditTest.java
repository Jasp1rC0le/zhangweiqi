package com.campusai.controller;

import com.campusai.teaching.*;
import com.campusai.security.*;
import com.campusai.user.entity.User;
import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.test.util.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Immutable existing receipts, real transactions/pagination and signed synthetic authorization. */
@Timeout(40)
class TeachingLessonChangeAuditTest {
    TeachingLessonChangeWorkflowTest flow;TeachingRosterWorkflowTest f;TeachingAdministrativeAuditService audits;
    javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{
        flow=new TeachingLessonChangeWorkflowTest();flow.syntheticDataSource=syntheticDataSource;flow.setup();f=flow.f;
        f.context.registerBean(TeachingAdministrativeAuditService.class,()->new TeachingAdministrativeAuditService(f.db,f.service,flow.identities,f.clock,f.json));
        audits=f.context.getBean(TeachingAdministrativeAuditService.class);enabled(true);
        byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=mock(AuthSessionService.class);
        for(long i=1;i<=11;i++){User u=new User();u.setId(i);u.setUsername("lesson-audit-"+i);u.setRole(i==1||i==11?"ADMIN":"STUDENT");f.tokens.put(i,jwt.generateToken(u,"lesson-audit-"+i));when(sessions.active("lesson-audit-"+i,i,u.getRole())).thenReturn(true);}
        f.mvc=MockMvcBuilders.standaloneSetup(new TeachingAdministrativeAuditController(audits)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @AfterEach void close(){if(flow!=null)flow.close();}
    String path="/api/admin/teaching/operations/audit";
    TeachingAdministrativeAuditService.Filter filter(String search){return new TeachingAdministrativeAuditService.Filter("LESSON_CHANGE",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),search);}
    TeachingLessonChangeService.Receipt save(){return flow.changes.change(1,flow.confirmed(flow.draft(f.first)));}
    int code(Runnable work){return assertThrows(ResponseStatusException.class,work::run).getStatusCode().value();}
    void enabled(boolean value){TeachingAdministrativeAuditService actual=AopTestUtils.getTargetObject(audits);ReflectionTestUtils.setField(actual,"lessonChangesEnabled",value);}
    void history(int count)throws Exception{
        var t=flow.changes.target(1,f.second);
        for(int i=0;i<count;i++){
            String lesson=UUID.randomUUID().toString(),id=UUID.randomUUID().toString();
            var date=LocalDate.of(2026,10,22).plusDays(i);var start=date.atTime(14,0).atZone(TeachingService.ZONE).toInstant();
            f.db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at,cancelled) VALUES(?,?,?,?,?,?,TRUE)",lesson,1,f.course,f.a,Timestamp.from(start),Timestamp.from(start.plusSeconds(5700)));
            var old=new TeachingLessonChangeService.Target(lesson,t.courseId(),0,t.rosterRevision(),"历史%_!课程"+i,t.semester(),t.firstMonday(),t.classId(),t.classLabel(),t.groupName(),t.teacherId(),t.teacherLabel(),date,"14:00","15:35",t.room(),t.members(),t.enrollmentMode(),t.sourceHash());
            var receipt=new TeachingLessonChangeService.Receipt(id,1,"CANCEL",old,null,null,null,1,"合成历史%_!取消",f.clock.instant());
            f.db.update("INSERT INTO teaching_lesson_changes(school_id,request_id,actor_id,old_lesson_id,new_lesson_id,new_course_id,request_hash,old_revision,revision,reason,receipt_json,recorded_at) VALUES(?,?,1,?,NULL,NULL,?,0,1,?,?,?)",1,id,lesson,"a".repeat(64),receipt.reason(),f.json.writeValueAsString(receipt),Timestamp.from(receipt.recordedAt()));
        }
    }
    @Test void immutableSnapshotPagingExportAndNormalController()throws Exception{
        var saved=save();history(63);assertTrue(audits.access(1).categories().stream().anyMatch(c->c.key().equals("LESSON_CHANGE")));
        f.db.update("UPDATE teaching_courses SET name='当前课程已改名',room='当前教室已改名' WHERE id=?",saved.original().courseId());f.db.update("UPDATE users SET nickname='当前教师已改名' WHERE id=6");
        var ids=new HashSet<String>();for(int page=0;page<3;page++){var data=audits.page(1,filter(""),page,25);assertEquals(64,data.total());assertEquals(3,data.totalPages());for(var row:data.items()){assertTrue(ids.add(row.id()));assertEquals("LESSON_CHANGE",row.kind());assertFalse(row.beforeValue().contains("当前教室"));assertFalse(row.beforeValue().contains("当前教师"));assertTrue(row.actorName().contains("未保存显示名"));}}
        assertEquals(64,ids.size());assertEquals(63,audits.page(1,filter("%_!"),0,25).total());assertEquals(0,audits.page(11,filter(""),0,25).total());
        var row=audits.page(1,filter(saved.requestId()),0,25).items().get(0);assertEquals(saved.original().name(),row.target());assertTrue(row.beforeValue().contains(saved.original().teacherLabel()));assertTrue(row.afterValue().contains(saved.proposed().room()));assertEquals(saved.original().lessonId(),row.subjectId());assertTrue(row.historyNote().contains(saved.original().classLabel()));
        f.mvc.perform(get(path+"/page").param("kind","LESSON_CHANGE").param("from","2026-10-14").param("to","2026-10-14")).andExpect(status().isUnauthorized());
        for(long actor:List.of(2L,6L,7L,8L))f.read(actor,get(path+"/access").param("view","ADMIN"),403);
        assertEquals(64,f.read(1,get(path+"/page").param("kind","LESSON_CHANGE").param("from","2026-10-14").param("to","2026-10-14"),200).get("total").asInt());
        var prepared=audits.preview(1,filter(""));assertEquals(64,prepared.count());var artifact=audits.download(1,new TeachingAdministrativeAuditService.ExportRequest(prepared.token()));String csv=new String(artifact.bytes(),StandardCharsets.UTF_8);assertEquals(67,csv.lines().count());assertTrue(csv.contains(saved.original().name()));assertTrue(csv.contains(saved.proposed().room()));assertTrue(csv.contains("未保存显示名"));assertFalse(csv.contains("当前教室已改名"));assertEquals(prepared.sha256(),artifact.sha256());
        f.db.update("UPDATE users SET role='STUDENT' WHERE id=1");assertEquals(403,code(()->audits.download(1,new TeachingAdministrativeAuditService.ExportRequest(prepared.token()))));
    }
    @Test void accountDeletionRetainsReceiptAndDoesNotInventOldOperatorName()throws Exception{
        var saved=save();f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");f.db.update("DELETE FROM users WHERE id=1");
        var page=audits.page(10,filter(""),0,25);assertEquals(1,page.total());var row=page.items().get(0);assertEquals(saved.requestId(),row.eventId());assertEquals(1,row.actorId());assertTrue(row.actorName().contains("未保存显示名"));assertFalse(row.actorName().contains("模拟账号"));
    }
    @Test void corruptedSnapshotsWrongTargetAndChangedPreparedContentFailWithoutPartialOutput()throws Exception{
        var saved=save();String original=f.json.writeValueAsString(saved);var prepared=audits.preview(1,filter(""));
        var old=saved.original();var renamed=new TeachingLessonChangeService.Target(old.lessonId(),old.courseId(),old.revision(),old.rosterRevision(),"另一个快照标题",old.semester(),old.firstMonday(),old.classId(),old.classLabel(),old.groupName(),old.teacherId(),old.teacherLabel(),old.date(),old.startTime(),old.endTime(),old.room(),old.members(),old.enrollmentMode(),old.sourceHash());
        var altered=new TeachingLessonChangeService.Receipt(saved.requestId(),saved.actorId(),saved.action(),renamed,saved.replacementCourseId(),saved.replacementLessonId(),saved.proposed(),saved.revision(),saved.reason(),saved.recordedAt());
        f.db.update("UPDATE teaching_lesson_changes SET receipt_json=?",f.json.writeValueAsString(altered));assertEquals(409,code(()->audits.download(1,new TeachingAdministrativeAuditService.ExportRequest(prepared.token()))));
        f.db.update("UPDATE teaching_lesson_changes SET receipt_json='{' ");assertEquals(503,code(()->audits.page(1,filter(""),0,25)));assertEquals(503,code(()->audits.preview(1,filter(""))));
        f.db.update("UPDATE teaching_lesson_changes SET receipt_json=?,actor_id=6",original);assertEquals(503,code(()->audits.page(1,filter(""),0,25)));
        f.db.update("UPDATE teaching_lesson_changes SET actor_id=1");f.db.update("UPDATE teaching_lessons SET class_id=? WHERE id=?",f.b,saved.original().lessonId());assertEquals(503,code(()->audits.page(1,filter(""),0,25)));
    }
    @Test void disabledCategoryAndOverLimitAreExplicitRatherThanQueryingMissingTablesOrTruncating()throws Exception{
        enabled(false);assertTrue(audits.access(1).categories().stream().noneMatch(c->c.key().equals("LESSON_CHANGE")));assertEquals(400,code(()->audits.page(1,filter(""),0,25)));
        enabled(true);history(2001);assertEquals(2001,audits.page(1,filter(""),0,25).total());assertEquals(400,code(()->audits.preview(1,filter(""))));
    }
}
