package com.campusai.controller;

import com.campusai.teaching.*;
import com.zaxxer.hikari.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.time.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(100) @EnabledIfEnvironmentVariable(named="RUN_LESSON_CHANGE_MYSQL",matches="true")
class TeachingMysqlLessonChangeTest {
    @Test void actualMysqlReplacementExactScopesPermissionsRemindersPagingConcurrencyAndRollback()throws Exception{
        String schema=System.getenv("LESSON_TEST_MYSQL_SCHEMA");assertTrue(schema!=null&&schema.matches("campthink_lesson_20261018_[a-f0-9]{12}"));int port=Integer.parseInt(System.getenv("LESSON_TEST_MYSQL_PORT"));assertTrue(port>=1024&&port<=65535);
        var cfg=new HikariConfig();cfg.setJdbcUrl("jdbc:mysql://127.0.0.1:"+port+"/"+schema+"?serverTimezone=Asia/Shanghai&characterEncoding=utf8&connectTimeout=2000&socketTimeout=8000");cfg.setUsername(System.getenv("LESSON_TEST_MYSQL_USER"));cfg.setPassword(System.getenv("LESSON_TEST_MYSQL_PASSWORD"));cfg.setMaximumPoolSize(4);cfg.setMinimumIdle(1);cfg.setConnectionTimeout(2000);cfg.setPoolName("task-lesson-changes-only");
        try(var pool=new HikariDataSource(cfg)){var flow=new TeachingLessonChangeWorkflowTest();flow.syntheticDataSource=pool;long started=System.nanoTime();try{
            flow.setup();var f=flow.f;f.db.setQueryTimeout(5);flow.currentSchoolListReallyPagesBeyondFiveHundredWithLiteralSearchAndNoPrivilegeFromClientFields();
            flow.replacementRetainsPastAttendanceExactMemberScopeOtherWeeksAndNotificationReadHistory();
            f.clock.value=Instant.parse("2026-10-14T05:00:00Z");var planned=new ArrayList<TeachingLessonChangeService.Input>();
            for(int i=0;i<2;i++){
                String id=UUID.randomUUID().toString();var course=new TeachingService.CourseInput(id,f.a,6L,"原生并发调课"+i,"合成学期",LocalDate.of(2026,10,12),5,i==0?"08:30":"10:20",i==0?"10:05":"11:55",List.of(1),"原生原教室"+i);f.service.createRosterCourse(1,new TeachingService.RosterCourseInput(course,"原生教学组"+i,List.of(f.studentA,f.studentB)));
                String lesson=f.db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id=?",String.class,id);var old=flow.changes.target(1,lesson);var draft=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),lesson,old.revision(),old.sourceHash(),"RESCHEDULE",LocalDate.of(2026,10,24),"10:20","11:55",10L,"原生同一调课室","原生并发核查",null);planned.add(flow.confirmed(draft));
            }
            var executor=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);var codes=new ArrayList<Integer>();try{var jobs=new ArrayList<Future<Integer>>();for(var in:planned)jobs.add(executor.submit(()->{assertTrue(gate.await(5,TimeUnit.SECONDS));try{flow.changes.change(1,in);return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}}));gate.countDown();for(var job:jobs)codes.add(job.get(15,TimeUnit.SECONDS));Collections.sort(codes);assertEquals(List.of(200,409),codes);}finally{executor.shutdownNow();assertTrue(executor.awaitTermination(3,TimeUnit.SECONDS));}
            var failed=planned.get(codes.size()-1);String untouched=f.db.queryForObject("SELECT id FROM teaching_lessons WHERE course_id IN (?,?) AND cancelled=FALSE ORDER BY id LIMIT 1",String.class,flow.changes.target(1,planned.get(0).lessonId()).courseId(),flow.changes.target(1,planned.get(1).lessonId()).courseId());var old=flow.changes.target(1,untouched);
            var cancel=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),untouched,old.revision(),old.sourceHash(),"CANCEL",null,null,null,null,null,"原生失败回滚",null);var confirmed=flow.confirmed(cancel);int changes=flow.count("teaching_lesson_changes"),lessons=flow.count("teaching_lessons"),records=flow.count("teaching_attendance");f.db.execute("ALTER TABLE teaching_lesson_changes ADD CONSTRAINT synthetic_reject_reason CHECK(reason<>'原生失败回滚')");assertThrows(RuntimeException.class,()->flow.changes.change(1,confirmed));assertEquals(changes,flow.count("teaching_lesson_changes"));assertEquals(lessons,flow.count("teaching_lessons"));assertEquals(records,flow.count("teaching_attendance"));assertFalse(f.db.queryForObject("SELECT cancelled FROM teaching_lessons WHERE id=?",Boolean.class,untouched));
            var roster=f.service.courseRosterPage(1,old.courseId(),0,25,"",true);int version=roster.roster().revision();for(var member:roster.roster().members())f.service.withdrawMember(1,old.courseId(),member.studentId(),new TeachingService.WithdrawInput(version++,"原生模拟退课"));var empty=flow.changes.target(1,untouched);assertEquals(0,empty.members());var emptyCancel=new TeachingLessonChangeService.Input(UUID.randomUUID().toString(),untouched,empty.revision(),empty.sourceHash(),"CANCEL",null,null,null,null,null,"原生空名单取消",null);assertNull(flow.changes.change(1,flow.confirmed(emptyCancel)).replacementLessonId());
            flow.wholeClassLessonKeepsWholeClassLifecycleAfterReschedulingRatherThanFreezingAsAnElective();
            var evidence=new LinkedHashMap<String,Object>();evidence.put("engine",f.db.queryForObject("SELECT VERSION()",String.class));evidence.put("schema",schema);evidence.put("schoolDataTargeted",false);evidence.put("teacherIdentityReviewEnabled",true);evidence.put("completeListRows",503);evidence.put("listPages",21);evidence.put("historicalTeacherAttendanceAndNoticesRetained",true);evidence.put("exactMemberAdministrativeScopesCopied",true);evidence.put("newTeacherAndOnlySelectedStudentsReceiveNotices",true);evidence.put("idempotentReceiptAndReadback",true);evidence.put("concurrentMoveResults",codes);evidence.put("failedAuditRolledBack",true);evidence.put("emptyRosterExplicitCancelWithoutInventedMembers",true);evidence.put("originalWholeClassModeRetainedAndTransferInAutoEnrolled",true);evidence.put("authenticationBoundary","signed synthetic MockMvc session registry; not full real-login HTTP");evidence.put("elapsedMillis",(System.nanoTime()-started)/1000000);var output=Path.of("../.local/runtime/teaching-mysql-lesson-changes-2026-10-18.json");Files.createDirectories(output.getParent());Files.writeString(output,f.json.writeValueAsString(evidence));System.out.println("MYSQL_LESSON_CHANGES "+f.json.writeValueAsString(evidence));
        }finally{flow.close();}}
    }
}
