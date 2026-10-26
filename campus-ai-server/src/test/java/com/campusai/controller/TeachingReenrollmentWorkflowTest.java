package com.campusai.controller;

import com.campusai.teaching.*;
import org.junit.jupiter.api.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real transactions and signed synthetic sessions, using only a dedicated in-memory H2 schema. */
@Timeout(20)
class TeachingReenrollmentWorkflowTest {
    TeachingRosterWorkflowTest f;
    TeachingReenrollmentService service;
    javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();service=f.context.getBean(TeachingReenrollmentService.class);}
    @AfterEach void close(){if(f!=null)f.close();}
    TeachingReenrollmentService.Input input(int version,int studentVersion,String cls){return new TeachingReenrollmentService.Input(UUID.randomUUID().toString(),version,studentVersion,cls,"合成：核对原课程重新选课依据");}
    String url(String student){return "/api/admin/teaching/courses/"+f.course+"/members/"+student+"/reenroll";}
    void withdrawA(){f.service.withdrawMember(1,f.course,f.studentA,new TeachingService.WithdrawInput(0,"合成退课核验"));}

    @Test void rejoiningPreservesPastAttendanceAndOldNoticeReadStateAndReplaysExactlyOnce()throws Exception{
        f.clock.value=Instant.parse("2026-10-14T06:02:00Z");f.service.markPage(6,f.first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(f.studentA,"LATE")),"",false),0,50,"");
        f.clock.value=Instant.parse("2026-10-21T05:00:00Z");f.service.dispatchDueNotices();var notice=f.service.notices(2).get(0);f.service.readNotice(2,notice.id());
        withdrawA();assertEquals(0,f.service.notices(2).size());
        var in=input(1,0,f.a);var receipt=f.send(1,post(url(f.studentA)),in,200);
        assertEquals(in.requestId(),receipt.get("requestId").asString());assertEquals(f.course,receipt.get("courseId").asString());assertEquals(2,receipt.get("revision").asInt());assertEquals(1,receipt.get("affectedLessons").asInt());
        assertEquals(receipt,f.send(1,post(url(f.studentA)),in,200));
        assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_requests",Integer.class));assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_audit WHERE action='REENROLL'",Integer.class));
        assertEquals("LATE",f.db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,f.first,f.studentA));
        assertEquals(f.a,f.db.queryForObject("SELECT admin_class_id FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,f.first,f.studentA));
        assertEquals("UNKNOWN",f.db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,f.second,f.studentA));
        assertEquals("REENROLLMENT",f.db.queryForObject("SELECT source FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,f.second,f.studentA));
        assertEquals(notice.id(),f.service.notices(2).get(0).id());assertNotNull(f.service.notices(2).get(0).readAt());assertEquals(0,f.service.dispatchDueNotices());
        assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));assertEquals("STUDENT",f.db.queryForObject("SELECT role FROM users WHERE id=2",String.class));
        assertEquals(1,f.service.detailPage(7,"COUNSELOR",f.second,0,50,"").total());assertEquals(1,f.service.detailPage(9,"SECRETARY",f.second,0,50,"").total());
        f.send(1,post(url(f.studentA)),new TeachingReenrollmentService.Input(in.requestId(),1,0,f.a,"不同原因"),409);
    }
    @Test void leftStudentsRequireReadmissionAndRejoiningElectivesUsesTheCurrentAdministrativeScope()throws Exception{
        f.clock.value=Instant.parse("2026-10-15T05:00:00Z");withdrawA();
        f.lifecycle.transition(1,f.studentA,f.transition("LEAVE",null,0,f.a));
        f.send(1,post(url(f.studentA)),input(1,1,f.a),409);
        f.lifecycle.transition(1,f.studentA,f.transition("RESTORE",f.b,1,f.a));
        f.send(1,post(url(f.studentA)),input(1,1,f.a),409);
        f.send(1,post(url(f.studentA)),input(1,2,f.b),200);
        assertEquals(2,f.service.detailPage(9,"SECRETARY",f.second,0,50,"").total());
        f.read(7,get("/api/teaching/lessons/"+f.second+"/page").param("view","COUNSELOR"),404);
        f.read(8,get("/api/teaching/lessons/"+f.second+"/page").param("view","SECRETARY"),404);
        assertEquals(1,f.detail(7,"COUNSELOR",f.first).get("entries").size());
        assertEquals(f.b,f.db.queryForObject("SELECT admin_class_id FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,f.second,f.studentA));
    }
    @Test void normalAdminAuthenticationExactMembershipAndExplicitVersionsAreRequired()throws Exception{
        withdrawA();var in=input(1,0,f.a);
        f.mvc.perform(post(url(f.studentA)).contentType("application/json").content(f.json.writeValueAsString(in))).andExpect(status().isUnauthorized());
        for(long actor:new long[]{2,6,7,8,9,11})f.send(actor,post(url(f.studentA)),in,403);
        f.send(1,post(url(f.studentA)),new TeachingReenrollmentService.Input(UUID.randomUUID().toString(),null,0,f.a,"合成原因"),400);
        f.send(1,post(url(f.studentA)),new TeachingReenrollmentService.Input(UUID.randomUUID().toString(),1,null,f.a,"合成原因"),400);
        f.send(1,post(url(f.studentA)),input(0,0,f.a),409);
        String nonMember=f.service.members(1,f.a).stream().map(TeachingService.MemberRow::id).filter(id->!id.equals(f.studentA)).findFirst().orElseThrow();
        f.send(1,post(url(nonMember)),input(1,0,f.a),404);
        f.send(1,post(url(UUID.randomUUID().toString())),in,404);
        assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_requests",Integer.class));
    }
    @Test void unreviewedSourceAndWrongAdministrativeClassCannotBeBypassedThroughReenrollment()throws Exception{
        withdrawA();f.db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",f.course);
        f.send(1,post(url(f.studentA)),input(1,0,f.a),409);
        f.db.update("UPDATE teaching_course_enrollment_modes SET mode='ADMIN_CLASS' WHERE course_id=?",f.course);
        f.clock.value=Instant.parse("2026-10-15T05:00:00Z");f.lifecycle.transition(1,f.studentA,f.transition("TRANSFER",f.b,0,f.a));
        f.send(1,post(url(f.studentA)),input(1,1,f.b),409);
        assertFalse(f.service.courseMember(1,f.course,f.studentA).member().active());
    }
    @Test void auditReceiptFailureRollsBackEveryFutureRowAndMembership()throws Exception{
        withdrawA();int scopes=f.db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class);
        f.db.execute("ALTER TABLE teaching_enrollment_requests ADD CONSTRAINT synthetic_receipt_fail CHECK(affected_lessons<0)");
        f.send(1,post(url(f.studentA)),input(1,0,f.a),500);
        assertFalse(f.service.courseMember(1,f.course,f.studentA).member().active());assertEquals(1,f.service.courseMember(1,f.course,f.studentA).revision());
        assertTrue(f.db.queryForObject("SELECT withdrawn FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",Boolean.class,f.first,f.studentA));
        assertEquals(scopes,f.db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class));
        assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_audit WHERE action='REENROLL'",Integer.class));
        assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_requests",Integer.class));
    }
    @Test void startedOrCancelledCoursesAndPreexistingFutureMarksAreNotRecreatedOrOverwritten()throws Exception{
        withdrawA();f.clock.value=Instant.parse("2026-10-22T05:00:00Z");f.send(1,post(url(f.studentA)),input(1,0,f.a),409);
        f.clock.value=Instant.parse("2026-10-14T05:00:00Z");f.db.update("UPDATE teaching_lessons SET cancelled=TRUE WHERE course_id=?",f.course);
        f.send(1,post(url(f.studentA)),input(1,0,f.a),409);
        f.db.update("UPDATE teaching_lessons SET cancelled=FALSE WHERE course_id=?",f.course);
        f.db.update("UPDATE teaching_attendance SET status='ON_TIME' WHERE lesson_id=? AND student_id=?",f.second,f.studentA);
        f.send(1,post(url(f.studentA)),input(1,0,f.a),409);
        assertFalse(f.service.courseMember(1,f.course,f.studentA).member().active());assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_requests",Integer.class));
    }
    @Test void largeRevisionNumbersAreComparedByValueRatherThanBoxedIntegerIdentity()throws Exception{
        withdrawA();f.db.update("UPDATE teaching_course_rosters SET revision=512 WHERE course_id=?",f.course);
        assertEquals(513,service.reenroll(1,f.course,f.studentA,input(512,0,f.a)).revision());
    }
    @Test void competingReenrollmentsCannotExceedTheTwoThousandPersonBoundary()throws Exception{
        withdrawA();f.service.withdrawMember(1,f.course,f.studentB,new TeachingService.WithdrawInput(1,"合成容量核验"));
        var classIds=new ArrayList<String>();for(int g=0;g<7;g++){String id=UUID.randomUUID().toString();classIds.add(id);f.db.update("INSERT INTO teaching_classes(id,school_id,college,name,request_hash) VALUES(?,1,'合成容量学院',?,?)",id,"合成行政班"+g,"synthetic-reenrollment-capacity-"+g);}
        var students=new ArrayList<Object[]>();var memberships=new ArrayList<Object[]>();
        for(int i=0;i<1999;i++){String id=UUID.randomUUID().toString();students.add(new Object[]{id,classIds.get(i/300),"capacity-reenroll-"+i,"合成容量同学"+i});memberships.add(new Object[]{f.course,id});}
        f.db.batchUpdate("INSERT INTO teaching_students(id,school_id,class_id,student_number,name) VALUES(?,1,?,?,?)",students);
        f.db.batchUpdate("INSERT INTO teaching_course_members(course_id,student_id,school_id,active) VALUES(?,?,1,TRUE)",memberships);
        for(String lesson:List.of(f.first,f.second)){
            f.db.update("INSERT INTO teaching_attendance(lesson_id,student_id,student_number,student_name) SELECT ?,s.id,s.student_number,s.name FROM teaching_students s JOIN teaching_course_members m ON m.student_id=s.id WHERE m.course_id=? AND m.active=TRUE",lesson,f.course);
            f.db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source) SELECT ?,s.id,1,s.class_id,'合成容量学院',FALSE,'CAPTURED_AT_CREATION' FROM teaching_students s JOIN teaching_course_members m ON m.student_id=s.id WHERE m.course_id=? AND m.active=TRUE",lesson,f.course);
        }
        var pool=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
        try{
            var left=pool.submit(()->{barrier.await(3,TimeUnit.SECONDS);try{service.reenroll(1,f.course,f.studentA,input(2,0,f.a));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
            var right=pool.submit(()->{barrier.await(3,TimeUnit.SECONDS);try{service.reenroll(1,f.course,f.studentB,input(2,0,f.b));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
            var codes=List.of(left.get(10,TimeUnit.SECONDS),right.get(10,TimeUnit.SECONDS));assertEquals(1,codes.stream().filter(n->n==200).count());assertEquals(1,codes.stream().filter(n->n==409).count());
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(3,TimeUnit.SECONDS));}
        assertEquals(2000,f.db.queryForObject("SELECT COUNT(*) FROM teaching_course_members WHERE course_id=? AND active=TRUE",Integer.class,f.course));
        String remaining=f.service.courseMember(1,f.course,f.studentA).member().active()?f.studentB:f.studentA;
        String cls=remaining.equals(f.studentA)?f.a:f.b;
        f.send(1,post(url(remaining)),input(3,0,cls),409);
        assertEquals(2000,f.service.detailPage(6,"TEACHER",f.first,0,50,"").detail().lesson().counts().unknown());
    }
}
