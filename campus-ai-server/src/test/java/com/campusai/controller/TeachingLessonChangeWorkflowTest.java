package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.teaching.*;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.*;
import org.springframework.aop.support.AopUtils;
import org.springframework.test.util.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Synthetic normal authorization and actual transactions; never a school database. */
@Timeout(50)
class TeachingLessonChangeWorkflowTest {
    TeachingRosterWorkflowTest f;TeachingLessonChangeService changes;TeachingIdentityService identities;javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{
        f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();f.migration("2026-10-18-teaching-lesson-changes.sql");
        TeachingService actual=AopTestUtils.getTargetObject(f.service);ReflectionTestUtils.setField(actual,"lessonChangesEnabled",true);
        f.migration("2026-10-15-teaching-identities.sql");f.context.registerBean(TeachingIdentityService.class,()->new TeachingIdentityService(f.db,true,f.clock));identities=f.context.getBean(TeachingIdentityService.class);
        for(var pair:Map.of(6L,"TEACHER",10L,"TEACHER",7L,"COUNSELOR",8L,"SECRETARY",9L,"SECRETARY").entrySet()){var item=identities.apply(pair.getKey(),new TeachingIdentityService.Apply(pair.getValue(),0));identities.review(1,item.id(),new TeachingIdentityService.Review(1,"APPROVE","模拟身份审核"));}
        ReflectionTestUtils.setField(actual,"identities",identities);
        f.context.registerBean(TeachingLessonChangeService.class,()->new TeachingLessonChangeService(f.db,f.service,f.json,true,f.clock));changes=f.context.getBean(TeachingLessonChangeService.class);assertTrue(AopUtils.isAopProxy(changes));
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=11");byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=mock(AuthSessionService.class);
        for(long i=1;i<=11;i++){User u=new User();u.setId(i);u.setUsername("change-demo-"+i);u.setRole(i==1||i==11?"ADMIN":"STUDENT");f.tokens.put(i,jwt.generateToken(u,"change-demo-"+i));when(sessions.active("change-demo-"+i,i,u.getRole())).thenReturn(true);}
        f.mvc=MockMvcBuilders.standaloneSetup(new TeachingLessonChangeController(changes,f.json),new AdminTeachingController(f.service,f.json),new TeachingController(f.service,f.json)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @AfterEach void close(){if(f!=null)f.close();}
    int code(Runnable action){return assertThrows(ResponseStatusException.class,action::run).getStatusCode().value();}
    int count(String table){return f.db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class);}
    TeachingLessonChangeService.Input draft(String lesson){var t=changes.target(1,lesson);return new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),lesson,t.revision(),t.sourceHash(),"RESCHEDULE",LocalDate.of(2026,10,22),"08:30","10:05",10L,"合成调课室","模拟教学调整",null);}
    TeachingLessonChangeService.Input confirmed(TeachingLessonChangeService.Input in){var p=changes.preview(1,in);assertTrue(p.conflicts().isEmpty());return new TeachingLessonChangeService.Input(in.requestId(),in.lessonId(),in.revision(),in.sourceHash(),in.action(),in.date(),in.startTime(),in.endTime(),in.teacherId(),in.room(),in.reason(),p.fingerprint());}
    @Test void replacementRetainsPastAttendanceExactMemberScopeOtherWeeksAndNotificationReadHistory()throws Exception{
        f.clock.value=Instant.parse("2026-10-14T06:02:00Z");f.service.mark(6,f.first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(f.studentA,"ON_TIME"),new TeachingService.Mark(f.studentB,"ABSENT")),"",true));
        int audit=count("teaching_attendance_audit"),att=count("teaching_attendance");f.clock.value=Instant.parse("2026-10-20T05:00:00Z");
        String notice=UUID.randomUUID().toString();f.db.update("INSERT INTO teaching_notices(id,user_id,lesson_id,kind,due_at,read_at) VALUES(?,?,?,'TEACHER_ROSTER',?,?)",notice,6,f.second,java.sql.Timestamp.from(f.clock.instant()),java.sql.Timestamp.from(f.clock.instant()));
        var in=confirmed(draft(f.second));var saved=changes.change(1,in);assertEquals(1,saved.revision());assertNotNull(saved.replacementLessonId());assertEquals(1,count("teaching_lesson_changes"));assertEquals(saved,changes.request(1,in.requestId()));assertEquals(saved,changes.change(1,in));
        assertEquals(audit,count("teaching_attendance_audit"));assertEquals(att+2,count("teaching_attendance"));assertEquals("ABSENT",f.db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,f.first,f.studentB));assertEquals(6L,f.db.queryForObject("SELECT teacher_id FROM teaching_courses WHERE id=?",Long.class,f.course));
        assertEquals(1,f.service.detail(7,"COUNSELOR",saved.replacementLessonId()).entries().size());assertEquals(1,f.service.detail(8,"SECRETARY",saved.replacementLessonId()).entries().size());assertEquals(1,f.service.detail(9,"SECRETARY",saved.replacementLessonId()).entries().size());assertEquals(2,f.service.detail(10,"TEACHER",saved.replacementLessonId()).entries().size());assertEquals(404,code(()->f.service.detail(6,"TEACHER",saved.replacementLessonId())));
        assertEquals(f.a,f.db.queryForObject("SELECT admin_class_id FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,saved.replacementLessonId(),f.studentA));assertEquals(f.b,f.db.queryForObject("SELECT admin_class_id FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,saved.replacementLessonId(),f.studentB));
        assertEquals(1,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE id=? AND read_at IS NOT NULL",Integer.class,notice));assertTrue(f.service.notices(6).stream().noneMatch(n->n.lessonId().equals(f.second)));
        f.clock.value=Instant.parse("2026-10-22T00:25:00Z");f.service.dispatchDueNotices();assertTrue(f.service.notices(10).stream().anyMatch(n->n.lessonId().equals(saved.replacementLessonId())));assertTrue(f.service.notices(2).stream().anyMatch(n->n.lessonId().equals(saved.replacementLessonId())));assertTrue(f.service.notices(3).stream().noneMatch(n->n.lessonId().equals(saved.replacementLessonId())));
        var r=f.db.queryForMap("SELECT admin_class_id,college,source,captured_at FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",f.second,f.studentA);assertEquals(r,f.db.queryForMap("SELECT admin_class_id,college,source,captured_at FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",saved.replacementLessonId(),f.studentA));
    }
    @Test void normalControllerRejectsAnonymousStudentTeacherForeignScopeUnknownJsonAndStaleVersion()throws Exception{
        String root="/api/admin/teaching/lesson-changes";f.mvc.perform(get(root+"/access")).andExpect(status().isUnauthorized());for(long actor:List.of(2L,6L,7L,8L))f.read(actor,get(root+"/access"),403);f.read(11,get(root+"/target/"+f.first),404);
        assertEquals("ONE_FUTURE_LESSON",f.read(1,get(root+"/access"),200).get("changeScope").asString());var in=draft(f.first);var preview=f.send(1,post(root+"/preview"),in,200);assertEquals(0,count("teaching_lesson_changes"));assertEquals(in.lessonId(),preview.get("original").get("lessonId").asString());
        f.send(1,post(root+"/preview"),Map.of("sql","DROP TABLE users"),400);var good=confirmed(in);f.db.update("UPDATE teaching_lessons SET revision=revision+1 WHERE id=?",f.first);f.send(1,post(root),good,409);assertEquals(0,count("teaching_lesson_changes"));assertEquals(0,f.db.queryForObject("SELECT COUNT(*) FROM teaching_lessons WHERE id=? AND cancelled=TRUE",Integer.class,f.first));
    }
    @Test void cancelNeedsReasonReadbackAndGuardDoesNotDestroyOldRowsOrAllowLegacyBypass()throws Exception{
        var t=changes.target(1,f.first);var in=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),f.first,t.revision(),t.sourceHash(),"CANCEL",null,null,null,null,null,"模拟取消本次课",null);int rows=count("teaching_attendance");var saved=changes.change(1,confirmed(in));assertNull(saved.replacementLessonId());assertEquals(rows,count("teaching_attendance"));assertTrue(f.db.queryForObject("SELECT cancelled FROM teaching_lessons WHERE id=?",Boolean.class,f.first));assertEquals(409,code(()->f.service.cancel(1,f.second,0)));
        var changed=new TeachingLessonChangeService.Input(in.requestId(),in.lessonId(),in.revision(),in.sourceHash(),in.action(),null,null,null,null,null,"其他原因","0".repeat(64));assertEquals(409,code(()->changes.change(1,changed)));assertEquals(1,count("teaching_lesson_changes"));
    }
    @Test void revokedTeacherIdentityBlocksPreparedChangeAndDisabledFeatureDoesNotPretendReady(){
        var in=confirmed(draft(f.first));var item=identities.mine(10).items().get(0);identities.review(1,item.id(),new TeachingIdentityService.Review(item.revision(),"REVOKE","模拟撤销教师身份"));assertEquals(403,code(()->changes.change(1,in)));assertEquals(0,count("teaching_lesson_changes"));
        var disabled=new TeachingLessonChangeService(f.db,f.service,f.json,false,f.clock);assertFalse(disabled.access(1).enabled());assertEquals(503,code(()->disabled.target(1,f.first)));
    }
    @Test void recordedNearStartAndLeftMembersAreNeverOverwrittenAndMissingSnapshotsFailClosed(){
        var initial=draft(f.first);f.db.update("UPDATE teaching_attendance SET status='ON_TIME' WHERE lesson_id=? AND student_id=?",f.first,f.studentA);assertEquals(409,code(()->changes.preview(1,initial)));f.db.update("UPDATE teaching_attendance SET status='UNKNOWN' WHERE lesson_id=?",f.first);
        f.clock.value=Instant.parse("2026-10-14T05:55:00Z");assertEquals(409,code(()->changes.preview(1,initial)));f.clock.value=Instant.parse("2026-10-14T05:00:00Z");
        f.db.update("DELETE FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",f.first,f.studentA);assertEquals(503,code(()->changes.target(1,f.first)));assertEquals(0,count("teaching_lesson_changes"));
    }
    @Test void teacherRoomAndActualSelectedMemberConflictsBlockSaveRatherThanOnlyWarn(){
        var in=draft(f.first);var row=new TeachingService.CourseInput(UUID.randomUUID().toString(),f.c,10L,"模拟冲突课程","合成学期",LocalDate.of(2026,10,12),4,"08:30","10:05",List.of(2),"合成调课室");f.service.createRosterCourse(1,new TeachingService.RosterCourseInput(row,"模拟冲突教学组",List.of(f.studentA)));
        var p=changes.preview(1,in);assertEquals(Set.of("TEACHER","ROOM","MEMBERS"),new HashSet<>(p.conflicts().stream().map(TeachingLessonChangeService.Conflict::kind).toList()));var blocked=new TeachingLessonChangeService.Input(in.requestId(),in.lessonId(),in.revision(),in.sourceHash(),in.action(),in.date(),in.startTime(),in.endTime(),in.teacherId(),in.room(),in.reason(),p.fingerprint());assertEquals(409,code(()->changes.change(1,blocked)));assertEquals(0,count("teaching_lesson_changes"));
    }
    @Test void auditFailureRollsBackReplacementCancellationAndEveryCopiedRow(){
        var in=confirmed(draft(f.first));int courses=count("teaching_courses"),lessons=count("teaching_lessons"),attendance=count("teaching_attendance");f.db.execute("ALTER TABLE teaching_lesson_changes ADD CONSTRAINT synthetic_reject_change CHECK(actor_id<0)");assertThrows(RuntimeException.class,()->changes.change(1,in));assertEquals(courses,count("teaching_courses"));assertEquals(lessons,count("teaching_lessons"));assertEquals(attendance,count("teaching_attendance"));assertFalse(f.db.queryForObject("SELECT cancelled FROM teaching_lessons WHERE id=?",Boolean.class,f.first));
    }
    @Test void concurrentChangesShareSchoolSerializationAndDoNotAcceptConflictingReplacements()throws Exception{
        var one=confirmed(draft(f.first));var two=confirmed(draft(f.second));var ready=new CountDownLatch(2);var go=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);try{var jobs=new ArrayList<Future<Integer>>();for(var in:List.of(one,two))jobs.add(executor.submit(()->{ready.countDown();assertTrue(go.await(5,TimeUnit.SECONDS));try{changes.change(1,in);return 200;}catch(ResponseStatusException e){return e.getStatusCode().value();}}));assertTrue(ready.await(5,TimeUnit.SECONDS));go.countDown();var codes=new ArrayList<Integer>();for(var job:jobs)codes.add(job.get(15,TimeUnit.SECONDS));Collections.sort(codes);assertEquals(List.of(200,409),codes);assertEquals(1,count("teaching_lesson_changes"));}finally{executor.shutdownNow();}
    }
    @Test void currentSchoolListReallyPagesBeyondFiveHundredWithLiteralSearchAndNoPrivilegeFromClientFields(){
        var start=Instant.parse("2026-10-14T06:01:00Z");for(int i=0;i<501;i++){String id=UUID.randomUUID().toString();var at=start.plusSeconds(i/60*86400L+i%60*60L);f.db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,?,?,?,?,?)",id,1,f.course,f.a,java.sql.Timestamp.from(at),java.sql.Timestamp.from(at.plusSeconds(5700)));}
        Set<String> seen=new HashSet<>();for(int page=0;page<21;page++){var data=changes.page(1,LocalDate.of(2026,10,14),LocalDate.of(2026,10,22),page,25,"");assertEquals(503,data.total());assertEquals(21,data.totalPages());for(var item:data.items())assertTrue(seen.add(item.lessonId()));}assertEquals(503,seen.size());
        f.db.update("UPDATE teaching_courses SET name='合成%_!课程' WHERE id=?",f.course);assertEquals(503,changes.page(1,LocalDate.of(2026,10,14),LocalDate.of(2026,10,22),0,25,"%_!").total());assertEquals(0,changes.page(11,LocalDate.of(2026,10,14),LocalDate.of(2026,10,22),0,25,"").total());assertEquals(403,code(()->changes.page(6,LocalDate.of(2026,10,14),LocalDate.of(2026,10,22),0,25,"")));
    }
    @Test void noActiveMembersMayBeExplicitlyCancelledButAreNeverInventedThroughRescheduling(){
        f.service.withdrawMember(1,f.course,f.studentA,new TeachingService.WithdrawInput(0,"模拟退课"));f.service.withdrawMember(1,f.course,f.studentB,new TeachingService.WithdrawInput(1,"模拟退课"));var old=changes.target(1,f.first);assertEquals(0,old.members());assertEquals(409,code(()->changes.preview(1,draft(f.first))));
        var cancel=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),f.first,old.revision(),old.sourceHash(),"CANCEL",null,null,null,null,null,"模拟空名单明确取消",null);int attendance=count("teaching_attendance"),courses=count("teaching_courses");var saved=changes.change(1,confirmed(cancel));assertNull(saved.replacementLessonId());assertEquals(attendance,count("teaching_attendance"));assertEquals(courses,count("teaching_courses"));
    }
    @Test void inconsistentAnchorAndForeignLifecycleBaselineFailClosedInsteadOfReassigningHistory(){
        f.db.update("UPDATE teaching_lessons SET class_id=? WHERE id=?",f.b,f.first);assertEquals(503,code(()->changes.target(1,f.first)));f.db.update("UPDATE teaching_lessons SET class_id=? WHERE id=?",f.a,f.first);
        if(f.db.update("UPDATE teaching_student_lifecycle SET school_id=2 WHERE student_id=?",f.studentA)==0)f.db.update("INSERT INTO teaching_student_lifecycle(student_id,school_id,status,revision,changed_at) VALUES(?,2,'ACTIVE',0,?)",f.studentA,java.sql.Timestamp.from(f.clock.instant()));
        assertEquals(503,code(()->changes.target(1,f.first)));assertEquals(0,count("teaching_lesson_changes"));
    }
    @Test void wholeClassLessonKeepsWholeClassLifecycleAfterReschedulingRatherThanFreezingAsAnElective(){
        f.clock.value=Instant.parse("2026-10-23T00:00:00Z");String course=UUID.randomUUID().toString();f.service.createCourse(1,new TeachingService.CourseInput(course,f.a,6L,"模拟整班单次调课","合成学期",LocalDate.of(2026,10,12),5,"10:20","11:55",List.of(2,3),"整班原教室"));
        String lesson=f.db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=? ORDER BY starts_at LIMIT 1",String.class,course);var t=changes.target(1,lesson);var in=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),lesson,t.revision(),t.sourceHash(),"RESCHEDULE",LocalDate.of(2026,10,26),"08:30","10:05",10L,"整班调整教室","模拟整班单次调课",null);var moved=changes.change(1,confirmed(in));
        assertEquals("ADMIN_CLASS",f.db.queryForObject("SELECT mode FROM teaching_course_enrollment_modes WHERE course_id=?",String.class,moved.replacementCourseId()));
        f.lifecycle.transition(1,f.studentB,new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),0,f.b,"TRANSFER",f.a,"模拟转入行政班"));
        assertEquals(3,f.service.detail(10,"TEACHER",moved.replacementLessonId()).entries().size());assertEquals(f.a,f.db.queryForObject("SELECT admin_class_id FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,moved.replacementLessonId(),f.studentB));
    }
}
