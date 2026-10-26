package com.campusai.controller;

import com.campusai.teaching.*;
import com.campusai.security.*;
import com.campusai.user.entity.User;
import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Actual isolated change/selection/identity/lifecycle transactions, not an optimistic notification stub. */
@Timeout(40)
class TeachingLessonChangeNoticeTest {
    TeachingLessonChangeWorkflowTest flow;TeachingRosterWorkflowTest f;TeachingLessonChangeNotices notices;javax.sql.DataSource syntheticDataSource;
    final String root="/api/teaching/lesson-change-notices";
    @BeforeEach void setup()throws Exception{
        flow=new TeachingLessonChangeWorkflowTest();flow.syntheticDataSource=syntheticDataSource;flow.setup();f=flow.f;
        f.context.registerBean(TeachingLessonChangeNotices.class,()->new TeachingLessonChangeNotices(f.db,f.service,f.json,true,f.clock));notices=f.context.getBean(TeachingLessonChangeNotices.class);
        byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=mock(AuthSessionService.class);
        for(long i=1;i<=11;i++){User u=new User();u.setId(i);u.setUsername("notice-demo-"+i);u.setRole(i==1||i==11?"ADMIN":"STUDENT");f.tokens.put(i,jwt.generateToken(u,"notice-demo-"+i));when(sessions.active("notice-demo-"+i,i,u.getRole())).thenReturn(true);}
        f.mvc=MockMvcBuilders.standaloneSetup(new TeachingLessonChangeNoticeController(notices)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @AfterEach void close(){if(flow!=null)flow.close();}
    int code(Runnable work){return assertThrows(ResponseStatusException.class,work::run).getStatusCode().value();}
    TeachingLessonChangeService.Receipt save(){return flow.changes.change(1,flow.confirmed(flow.draft(f.first)));}
    TeachingLessonChangeNotices.Notice single(long actor){var page=notices.page(actor,true,0,25);assertEquals(1,page.total());return page.items().get(0);}
    @Test void actualRecipientsAreSelectedStudentsAndReviewedTeachersNeverLeadersOrUnselectedClassmates()throws Exception{
        var saved=save();assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE kind LIKE 'LESSON_CHANGE%'",Integer.class));
        TeachingLessonChangeNotices.Notice student=single(2),otherSelected=single(4),teacher=single(10),released=single(6);
        assertEquals(saved.requestId(),student.requestId());assertEquals("STUDENT",student.view());assertEquals(saved.replacementLessonId(),student.targetLessonId());assertEquals(saved.proposed().room(),student.proposed().room());assertEquals("TEACHER",teacher.view());
        assertEquals("RELEASED",released.action());assertNull(released.proposed());assertEquals(saved.original().lessonId(),released.targetLessonId());assertEquals("TEACHER",released.view());assertEquals(otherSelected.proposed(),student.proposed());
        for(long actor:List.of(1L,3L,5L,7L,8L,9L,11L))assertEquals(0,notices.page(actor,true,0,25).total());
        f.mvc.perform(get(root)).andExpect(status().isUnauthorized());var response=f.read(2,get(root).param("userId","10").param("view","TEACHER"),200);assertEquals("STUDENT",response.get("items").get(0).get("view").asString());
        assertFalse(f.json.writeValueAsString(student).contains(saved.reason()));assertFalse(f.json.writeValueAsString(student).contains("sourceHash"));assertFalse(f.json.writeValueAsString(student).contains("members"));
        assertEquals(404,code(()->f.service.detail(6,"TEACHER",saved.replacementLessonId())));
    }
    @Test void readIsIdempotentOwnedRecheckedAndReplayedChangeDoesNotResetItOrNotifyTwice()throws Exception{
        var input=flow.confirmed(flow.draft(f.first));var saved=flow.changes.change(1,input);var item=single(2);assertEquals(404,code(()->notices.markRead(3,item.id())));
        var read=notices.markRead(2,item.id());assertNotNull(read.readAt());f.clock.value=f.clock.instant().plusSeconds(60);assertEquals(read.readAt(),notices.markRead(2,item.id()).readAt());assertEquals(0,notices.page(2,true,0,25).total());assertEquals(1,notices.page(2,false,0,25).total());assertEquals(saved,flow.changes.change(1,input));assertEquals(4,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE kind LIKE 'LESSON_CHANGE%'",Integer.class));assertEquals(read.readAt(),notices.page(2,false,0,25).items().get(0).readAt());
        var application=flow.identities.mine(10).items().get(0);var teacher=single(10);flow.identities.review(1,application.id(),new TeachingIdentityService.Review(application.revision(),"REVOKE","模拟撤销身份"));assertEquals(0,notices.page(10,false,0,25).total());assertEquals(404,code(()->notices.markRead(10,teacher.id())));
        f.db.update("UPDATE teaching_students SET user_id=NULL WHERE id=?",f.studentA);assertEquals(0,notices.page(2,false,0,25).total());assertEquals(404,code(()->notices.markRead(2,item.id())));
    }
    @Test void withdrawalLeaveAndRestoreDoNotDeleteHistoryOrAutomaticallyRestoreOldElectiveNotifications(){
        var saved=save();String item=single(2).id();f.service.withdrawMember(1,saved.replacementCourseId(),f.studentA,new TeachingService.WithdrawInput(0,"模拟退课"));assertEquals(0,notices.page(2,false,0,25).total());assertEquals(404,code(()->notices.markRead(2,item)));assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE id=?",Integer.class,item));
        String second=single(4).id();f.lifecycle.transition(1,f.studentB,new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),0,f.b,"LEAVE",f.b,"模拟离校"));assertEquals(0,notices.page(4,false,0,25).total());assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE id=?",Integer.class,second));
        f.lifecycle.transition(1,f.studentB,new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),1,f.b,"RESTORE",f.b,"模拟复学"));assertEquals(0,notices.page(4,false,0,25).total());assertEquals(1,flow.count("teaching_lesson_changes"));
    }
    @Test void transferOutOfWholeClassHidesRecipientNoticeButDoesNotEraseTheCapturedEvent(){
        String course=UUID.randomUUID().toString();f.service.createCourse(1,new TeachingService.CourseInput(course,f.a,6L,"合成整班通知","合成学期",LocalDate.of(2026,10,12),4,"10:20","11:55",List.of(1),"合成整班原室"));String lesson=f.db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=?",String.class,course);var t=flow.changes.target(1,lesson);var input=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),lesson,0,t.sourceHash(),"RESCHEDULE",LocalDate.of(2026,10,22),"10:20","11:55",10L,"合成整班新室","合成整班调整",null);flow.changes.change(1,flow.confirmed(input));String notice=single(2).id();
        f.lifecycle.transition(1,f.studentA,new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),0,f.a,"TRANSFER",f.c,"合成转班"));assertEquals(0,notices.page(2,false,0,25).total());assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE id=?",Integer.class,notice));assertEquals(1,notices.page(3,true,0,25).total());
    }
    @Test void aLaterChangeSuppressesOldProposalWhileReleasedTeacherGetsNoNewTeacherDetails(){
        var first=save();String firstNotice=single(2).id();var old=flow.changes.target(1,first.replacementLessonId());var input=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),old.lessonId(),old.revision(),old.sourceHash(),"CANCEL",null,null,null,null,null,"仅管理员可见-合成内部依据",null);var second=flow.changes.change(1,flow.confirmed(input));
        var item=single(2);assertEquals(second.requestId(),item.requestId());assertEquals("CANCEL",item.action());assertNull(item.proposed());assertEquals(404,code(()->notices.markRead(2,firstNotice)));assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE id=?",Integer.class,firstNotice));assertFalse(f.json.writeValueAsString(item).contains("内部依据"));
        var released=single(6);assertEquals(first.requestId(),released.requestId());assertNull(released.proposed());assertEquals(first.original().lessonId(),released.targetLessonId());
    }
    @Test void noLaterReceiptButCancelledTargetIsExplicitlyOutdatedAndMalformedSourceFailsClosed(){
        var saved=save();f.db.update("UPDATE teaching_lessons SET cancelled=TRUE WHERE id=?",saved.replacementLessonId());var notice=single(2);assertTrue(notice.outdated());assertNull(notice.targetLessonId());
        f.db.update("UPDATE teaching_lesson_changes SET receipt_json='{' ");assertEquals(503,code(()->notices.page(2,false,0,25)));
    }
    @Test void newRecipientBatchesAreCompleteAndFailureRollsBackTheCourseAuditAndEveryNotice(){
        var input=flow.confirmed(flow.draft(f.first));int courses=flow.count("teaching_courses"),lessons=flow.count("teaching_lessons"),attendance=flow.count("teaching_attendance");f.db.execute("ALTER TABLE teaching_notices ADD CONSTRAINT synthetic_reject_changed_notice CHECK(kind NOT LIKE 'LESSON_CHANGE%')");assertThrows(RuntimeException.class,()->flow.changes.change(1,input));assertEquals(courses,flow.count("teaching_courses"));assertEquals(lessons,flow.count("teaching_lessons"));assertEquals(attendance,flow.count("teaching_attendance"));assertEquals(0,flow.count("teaching_lesson_changes"));assertFalse(f.db.queryForObject("SELECT cancelled FROM teaching_lessons WHERE id=?",Boolean.class,f.first));assertEquals(0,flow.count("teaching_notices"));
    }
    @Test void oneHundredAndOneActualRecipientsUseCompleteBatchedInsertionWithoutMakingTheClassPublic(){
        var members=new ArrayList<TeachingService.Member>();for(long i=1000;i<=1100;i++){f.db.update("INSERT INTO users(id,school_id,role,status,nickname,username) VALUES(?,1,'STUDENT',1,?,?)",i,"合成学生"+i,"synthetic-notice-"+i);members.add(new TeachingService.Member("synthetic-notice-"+i,"合成学生"+i,i));}
        String clazz=UUID.randomUUID().toString(),course=UUID.randomUUID().toString();f.service.createClass(1,new TeachingService.ClassInput(clazz,"合成批量学院","合成通知班",members));f.service.createCourse(1,new TeachingService.CourseInput(course,clazz,6L,"合成101收件人课程","合成学期",LocalDate.of(2026,10,12),4,"10:20","11:55",List.of(1),"合成101原室"));String lesson=f.db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=?",String.class,course);var t=flow.changes.target(1,lesson);var input=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),lesson,0,t.sourceHash(),"RESCHEDULE",LocalDate.of(2026,10,23),"14:00","15:35",10L,"合成101新室","合成批量收件人核验",null);var saved=flow.changes.change(1,flow.confirmed(input));
        assertEquals(103,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE lesson_id=? AND kind LIKE 'LESSON_CHANGE%'",Integer.class,lesson));for(long i=1000;i<=1100;i++)assertEquals(saved.requestId(),single(i).requestId());assertEquals(0,notices.page(2,true,0,25).total());
    }
    @Test void dualStudentTeacherHasOneMessageAndTeacherRevocationDoesNotEraseLegitimateStudentAccess(){
        var application=flow.identities.apply(2,new TeachingIdentityService.Apply("TEACHER",0));flow.identities.review(1,application.id(),new TeachingIdentityService.Review(1,"APPROVE","合成双身份核对"));
        var original=flow.draft(f.first);var input=new TeachingLessonChangeService.Input(original.requestId(),original.lessonId(),original.revision(),original.sourceHash(),original.action(),original.date(),original.startTime(),original.endTime(),2L,original.room(),original.reason(),null);flow.changes.change(1,flow.confirmed(input));var before=single(2);assertEquals("TEACHER",before.view());assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE user_id=2 AND kind='LESSON_CHANGE_BOTH'",Integer.class));
        var approved=flow.identities.mine(2).items().get(0);flow.identities.review(1,approved.id(),new TeachingIdentityService.Review(approved.revision(),"REVOKE","合成撤销教师身份"));var after=single(2);assertEquals(before.id(),after.id());assertEquals("STUDENT",after.view());assertEquals(before.proposed(),after.proposed());
    }
    @Test void twentySixIndependentChangesReallyPageAndReadFiltersCountAllCurrentRecipients(){
        for(int i=0;i<26;i++){
            String course=UUID.randomUUID().toString();f.service.createCourse(1,new TeachingService.CourseInput(course,f.a,6L,"合成通知分页"+i,"合成学期",LocalDate.of(2026,10,12),4,"10:20","11:55",List.of(1),"合成分页原室"));String lesson=f.db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=?",String.class,course);var t=flow.changes.target(1,lesson);var input=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),lesson,0,t.sourceHash(),"CANCEL",null,null,null,null,null,"合成分页取消",null);flow.changes.change(1,flow.confirmed(input));
        }
        var first=notices.page(2,true,0,25);var last=notices.page(2,true,1,25);assertEquals(26,first.total());assertEquals(2,first.totalPages());assertEquals(25,first.items().size());assertEquals(1,last.items().size());var ids=new HashSet<String>();first.items().forEach(n->assertTrue(ids.add(n.id())));last.items().forEach(n->assertTrue(ids.add(n.id())));assertEquals(26,ids.size());
        notices.markRead(2,first.items().get(0).id());assertEquals(25,notices.page(2,true,0,25).total());assertEquals(26,notices.page(2,false,0,25).total());assertEquals(409,code(()->notices.page(2,true,1,25)));assertEquals(400,code(()->notices.page(2,true,0,1000)));
    }
}
