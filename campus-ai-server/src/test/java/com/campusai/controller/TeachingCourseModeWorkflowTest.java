package com.campusai.controller;

import com.campusai.teaching.*;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Normal signed synthetic admin, real SQL locks and transactions; no school migration or people. */
@Timeout(20)
class TeachingCourseModeWorkflowTest {
    TeachingRosterWorkflowTest f;javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();f.db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",f.course);}
    @AfterEach void close(){if(f!=null)f.close();}
    String path(){return "/api/admin/teaching/courses/"+f.course+"/enrollment-mode";}
    TeachingLifecycleService.ModeRequest input(String mode,int revision){return new TeachingLifecycleService.ModeRequest(UUID.randomUUID().toString(),mode,revision,"合成：已核对原教学选课依据");}
    @Test void normalAdminSeesExactCourseSourceCurrentVersionAndMixedAdministrativeMembership()throws Exception{
        var value=f.read(1,get(path()),200);assertEquals(f.course,value.get("courseId").asString());assertEquals("LEGACY",value.get("mode").asString());assertEquals("合成合班选修",value.get("target").get("name").asString());assertEquals("合成学期",value.get("target").get("semester").asString());assertEquals("模拟账号6",value.get("target").get("teacher").asString());assertEquals(2,value.get("activeMembers").asInt());assertEquals(1,value.get("outsideAdminClass").asInt());assertEquals(0,value.get("invalidActiveMembers").asInt());
        assertTrue(f.service.capabilities(1).enrollmentModeReviewEnabled());f.mvc.perform(get(path())).andExpect(status().isUnauthorized());
        for(long user:new long[]{2,6,7,8,9,11}){f.read(user,get(path()),403);f.send(user,post(path()+"/review"),input("EXPLICIT",0),403);}
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=11");assertEquals(404,assertThrows(ResponseStatusException.class,()->f.lifecycle.modeStatus(11,f.course)).getStatusCode().value());
    }
    @Test void durableReceiptReplaysOncePreservesAttendanceAndMembershipAndKeepsReviewVersionSeparate()throws Exception{
        f.clock.value=f.clock.value.plusNanos(123456789);var before=f.db.queryForList("SELECT * FROM teaching_attendance ORDER BY lesson_id,student_id");var scopes=f.db.queryForList("SELECT * FROM teaching_attendance_scopes ORDER BY lesson_id,student_id");var members=f.db.queryForList("SELECT * FROM teaching_course_members ORDER BY course_id,student_id");
        var request=input("EXPLICIT",0);var saved=f.send(1,post(path()+"/review"),request,200);assertEquals(request.requestId(),saved.get("requestId").asString());assertEquals(1,saved.get("revision").asInt());assertEquals(1,saved.get("actorId").asInt());
        assertEquals(saved,f.send(1,post(path()+"/review"),request,200));assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));
        var state=f.lifecycle.modeStatus(1,f.course);assertEquals(request.requestId(),state.reviewRequestId());assertEquals(1,state.reviewRevision());assertEquals(1L,state.reviewedBy());assertEquals(f.clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS),state.reviewedAt());
        assertEquals(before,f.db.queryForList("SELECT * FROM teaching_attendance ORDER BY lesson_id,student_id"));assertEquals(scopes,f.db.queryForList("SELECT * FROM teaching_attendance_scopes ORDER BY lesson_id,student_id"));assertEquals(members,f.db.queryForList("SELECT * FROM teaching_course_members ORDER BY course_id,student_id"));assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
        f.service.withdrawMember(1,f.course,f.studentA,new TeachingService.WithdrawInput(1,"合成：类型核定之后的独立退课"));assertEquals(2,f.lifecycle.modeStatus(1,f.course).revision());assertEquals(1,f.lifecycle.modeStatus(1,f.course).reviewRevision());assertEquals(saved,f.send(1,post(path()+"/review"),request,200));
        f.send(1,post(path()+"/review"),new TeachingLifecycleService.ModeRequest(request.requestId(),"EXPLICIT",0,"不同依据"),409);f.send(1,post(path()+"/review"),input("EXPLICIT",2),409);
    }
    @Test void missingVersionsOrMixedClassCannotBeAssumedToBeWholeClass()throws Exception{
        f.send(1,post(path()+"/review"),new TeachingLifecycleService.ModeRequest(UUID.randomUUID().toString(),"EXPLICIT",null,"合成原因"),400);
        f.send(1,post(path()+"/review"),new TeachingLifecycleService.ModeRequest("not-an-id","EXPLICIT",0,"合成原因"),400);f.send(1,post(path()+"/review"),new TeachingLifecycleService.ModeRequest(UUID.randomUUID().toString(),"EXPLICIT",0,""),400);
        f.send(1,post(path()+"/review"),input("EXPLICIT",1),409);f.send(1,post(path()+"/review"),input("ADMIN_CLASS",0),409);assertEquals("LEGACY",f.lifecycle.modeStatus(1,f.course).mode());assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));
        f.service.withdrawMember(1,f.course,f.studentB,new TeachingService.WithdrawInput(0,"合成：先核对原课程跨班成员"));f.send(1,post(path()+"/review"),input("ADMIN_CLASS",1),200);assertEquals("ADMIN_CLASS",f.lifecycle.modeStatus(1,f.course).mode());
    }
    @Test void receiptWriteFailureRollsBackSourceAndRosterVersion()throws Exception{
        f.db.execute("ALTER TABLE teaching_course_mode_reviews ADD CONSTRAINT synthetic_mode_fail CHECK(revision<0)");f.send(1,post(path()+"/review"),input("EXPLICIT",0),500);
        assertEquals("LEGACY",f.lifecycle.modeStatus(1,f.course).mode());assertEquals(0,f.lifecycle.modeStatus(1,f.course).revision());assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));assertNull(f.lifecycle.modeStatus(1,f.course).reviewedBy());
    }
    @Test void sameRequestConcurrentRetryHasOneEffectAndOneStableReceipt()throws Exception{
        var request=input("EXPLICIT",0);var tasks=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
        try{var a=tasks.submit(()->{start.await(2,TimeUnit.SECONDS);return f.lifecycle.reviewModeReceipt(1,f.course,request);});var b=tasks.submit(()->{start.await(2,TimeUnit.SECONDS);return f.lifecycle.reviewModeReceipt(1,f.course,request);});assertEquals(a.get(8,TimeUnit.SECONDS),b.get(8,TimeUnit.SECONDS));assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));assertEquals(1,f.lifecycle.modeStatus(1,f.course).revision());}finally{tasks.shutdownNow();assertTrue(tasks.awaitTermination(2,TimeUnit.SECONDS));}
    }
    @Test void competingReasonsCannotOverrideOneTimeSourceReview()throws Exception{
        var tasks=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
        try{var results=new ArrayList<Future<Integer>>();for(int i=0;i<2;i++)results.add(tasks.submit(()->{start.await(2,TimeUnit.SECONDS);try{f.lifecycle.reviewModeReceipt(1,f.course,input("EXPLICIT",0));return 200;}catch(ResponseStatusException e){return e.getStatusCode().value();}}));var codes=List.of(results.get(0).get(8,TimeUnit.SECONDS),results.get(1).get(8,TimeUnit.SECONDS));assertEquals(1,codes.stream().filter(c->c==200).count());assertEquals(1,codes.stream().filter(c->c==409).count());assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));}finally{tasks.shutdownNow();assertTrue(tasks.awaitTermination(2,TimeUnit.SECONDS));}
    }
    @Test void invalidActiveStudentOrMissingSourceBaselineFailsClosedAndDisabledFeatureHasNoWrite(){
        f.db.update("INSERT INTO teaching_student_lifecycle VALUES(?,?,?,?,?)",f.studentA,1,"LEFT",1,java.sql.Timestamp.from(f.clock.instant()));assertEquals(1,f.lifecycle.modeStatus(1,f.course).invalidActiveMembers());assertEquals(409,assertThrows(ResponseStatusException.class,()->f.lifecycle.reviewModeReceipt(1,f.course,input("EXPLICIT",0))).getStatusCode().value());
        var teaching=new TeachingService(f.db,f.json,true,f.clock,null,100,1000,0,true,false);var disabled=new TeachingLifecycleService(f.db,teaching,f.clock);assertFalse(teaching.capabilities(1).enrollmentModeReviewEnabled());assertEquals(503,assertThrows(ResponseStatusException.class,()->disabled.modeStatus(1,f.course)).getStatusCode().value());
        f.db.update("DELETE FROM teaching_course_enrollment_modes WHERE course_id=?",f.course);assertEquals(503,assertThrows(ResponseStatusException.class,()->f.lifecycle.modeStatus(1,f.course)).getStatusCode().value());assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_mode_reviews",Integer.class));
    }
}
