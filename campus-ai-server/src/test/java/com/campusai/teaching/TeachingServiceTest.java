package com.campusai.teaching;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(10)
class TeachingServiceTest {
    JdbcTemplate db; TeachingService service; TransactionTemplate tx;
    final LocalDate date=LocalDate.of(2026,10,14);
    final String classA=UUID.randomUUID().toString(),classB=UUID.randomUUID().toString(),classC=UUID.randomUUID().toString();
    MutableClock clock;
    static class MutableClock extends Clock {
        Instant value=Instant.parse("2026-10-14T01:00:00Z");
        public Instant instant(){return value;} public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return Clock.fixed(value,zone);}
    }
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:teaching"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds); tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(16),status INT,nickname VARCHAR(100),username VARCHAR(100))");
        for(int i=1;i<=9;i++) db.update("INSERT INTO users VALUES(?,?,?,?,?,?)",i,i==9?2:1,i==1?"ADMIN":"STUDENT",1,"示例用户"+i,"fixture"+i);
        String schema=Files.readString(Path.of("../deploy/migrations/2026-10-14-teaching-attendance.sql"));
        for(String sql:schema.split(";")) if(!sql.isBlank()) db.execute(sql);
        clock=new MutableClock(); service=new TeachingService(db,new ObjectMapper(),true,clock);
        create(classA,"示例学院甲","示例班一",List.of(new TeachingService.Member("demo-1","示例学生一",2L),new TeachingService.Member("demo-2","示例学生二",3L)));
        create(classB,"示例学院甲","示例班二",List.of(new TeachingService.Member("demo-3","示例学生三",4L)));
        create(classC,"示例学院乙","示例班三",List.of(new TeachingService.Member("demo-4","示例学生四",null)));
    }
    void create(String id,String college,String name,List<TeachingService.Member> members) { tx.execute(s->service.createClass(1,new TeachingService.ClassInput(id,college,name,members))); }
    String course(String clazz,long teacher,String name,List<Integer> weeks) {
        return tx.execute(s->service.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),clazz,teacher,name,"示例学期",LocalDate.of(2026,10,12),3,"10:00","11:40",weeks,"示例教室A101")));
    }
    String lesson(String clazz) { course(clazz,5,"示例课程",List.of(1)); return service.lessons(5,"TEACHER",date,date).get(0).id(); }
    int dispatchInTransaction() { Integer added=tx.execute(s->service.dispatchDueNotices()); return added.intValue(); }
    void fail(int code,Runnable call) { assertEquals(code,assertThrows(ResponseStatusException.class,call::run).getStatusCode().value()); }
    TeachingService.RollCall marks(int revision,boolean finish,String reason,TeachingService.Mark... marks){return new TeachingService.RollCall(revision,List.of(marks),reason,finish);}
    @Test void teacherCanBindMultipleCoursesAndStudentsOnlySeeThemselves() {
        String id=lesson(classA); course(classB,5,"示例课程二",List.of(1));
        assertEquals(2,service.lessons(5,"TEACHER",date,date).size());
        var self=service.detail(2,"STUDENT",id); assertEquals(1,self.entries().size()); assertEquals("demo-1",self.entries().get(0).studentNumber());
        assertEquals(1,self.lesson().counts().total()); assertEquals(2,service.detail(5,"TEACHER",id).entries().size());
        fail(404,()->service.detail(4,"STUDENT",id)); fail(403,()->service.detail(2,"TEACHER",id)); fail(403,()->service.lessons(1,"SECRETARY",date,date));
    }
    @Test void counselorIsClassBoundAndSecretaryCollegeBoundAndRevocationAppliesImmediately() {
        String a=lesson(classA); course(classB,5,"示例课程B",List.of(1)); course(classC,5,"示例课程C",List.of(1));
        service.grant(1,new TeachingService.GrantInput(6L,"COUNSELOR",classA),false);
        service.grant(1,new TeachingService.GrantInput(7L,"SECRETARY","示例学院甲"),false);
        assertEquals(1,service.lessons(6,"COUNSELOR",date,date).size()); assertEquals(2,service.lessons(7,"SECRETARY",date,date).size());
        assertEquals(2,service.detail(6,"COUNSELOR",a).entries().size());
        service.grant(1,new TeachingService.GrantInput(6L,"COUNSELOR",classA),true); fail(403,()->service.detail(6,"COUNSELOR",a));
    }
    @Test void tenantInactiveAccountAndUnapprovedRolesCannotReadOrWrite() {
        String id=lesson(classA);
        fail(403,()->service.createClass(2,new TeachingService.ClassInput(UUID.randomUUID().toString(),"A","B",List.of())));
        fail(400,()->service.grant(1,new TeachingService.GrantInput(9L,"SECRETARY","示例学院甲"),false));
        fail(403,()->service.lessons(9,"TEACHER",date,date));
        db.update("UPDATE users SET status=0 WHERE id=5"); fail(403,()->service.detail(5,"TEACHER",id));
    }
    @Test void attendanceIsManualUnknownDoesNotBecomeAbsenceAndFinalizationRequiresCompletion() {
        String id=lesson(classA); var entries=service.detail(5,"TEACHER",id).entries();
        clock.value=Instant.parse("2026-10-14T02:00:00Z");
        fail(400,()->service.mark(5,id,marks(0,true,"",new TeachingService.Mark(entries.get(0).studentId(),"ON_TIME"))));
        assertEquals(2,service.detail(5,"TEACHER",id).lesson().counts().unknown());
        var saved=tx.execute(s->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(entries.get(0).studentId(),"ON_TIME"))));
        assertEquals(1,saved.lesson().counts().onTime()); assertEquals(1,saved.lesson().counts().unknown()); assertEquals(0,saved.lesson().counts().absent());
        var done=tx.execute(s->service.mark(5,id,marks(1,true,"",new TeachingService.Mark(entries.get(1).studentId(),"LATE"))));
        assertTrue(done.lesson().finalized()); assertEquals(1,done.lesson().counts().late());
    }
    @Test void correctionsAreAuditedAndStaleTabsCannotOverwrite() {
        String id=lesson(classA); String student=service.detail(5,"TEACHER",id).entries().get(0).studentId(); clock.value=Instant.parse("2026-10-14T02:05:00Z");
        tx.execute(s->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(student,"ABSENT"))));
        fail(409,()->service.mark(5,id,marks(0,false,"更正",new TeachingService.Mark(student,"LATE"))));
        fail(400,()->service.mark(5,id,marks(1,false,"",new TeachingService.Mark(student,"LATE"))));
        tx.execute(s->service.mark(5,id,marks(1,false,"迟到补记",new TeachingService.Mark(student,"LATE"))));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,id));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE old_status='ABSENT' AND new_status='LATE' AND reason='迟到补记'",Integer.class));
    }
    @Test void rejectsEarlyRollCallAbsentBeforeStartDuplicateAndForeignStudents() {
        String id=lesson(classA); String student=service.detail(5,"TEACHER",id).entries().get(0).studentId();
        fail(409,()->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(student,"ON_TIME"))));
        clock.value=Instant.parse("2026-10-14T01:55:00Z");
        fail(400,()->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(student,"ABSENT"))));
        fail(400,()->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(student,"LATE"),new TeachingService.Mark(student,"ON_TIME"))));
        fail(400,()->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(UUID.randomUUID().toString(),"ON_TIME"))));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
    }
    @Test void remindersAreOneHourFiveMinutesIdempotentAndPrivate() {
        String id=lesson(classA);
        clock.value=Instant.parse("2026-10-14T00:59:59Z"); assertEquals(0,service.dispatchDueNotices());
        clock.value=Instant.parse("2026-10-14T01:00:00Z"); assertEquals(2,service.dispatchDueNotices()); assertEquals(0,service.dispatchDueNotices());
        assertEquals(1,service.notices(2).size()); assertEquals(0,service.notices(5).size()); assertEquals(0,service.notices(4).size());
        clock.value=Instant.parse("2026-10-14T01:54:59Z"); assertEquals(0,service.dispatchDueNotices());
        clock.value=Instant.parse("2026-10-14T01:55:00Z"); assertEquals(1,service.dispatchDueNotices()); assertEquals("TEACHER_ROSTER",service.notices(5).get(0).kind());
        var notice=service.notices(2).get(0); fail(404,()->service.readNotice(3,notice.id())); service.readNotice(2,notice.id()); assertNotNull(service.notices(2).get(0).readAt());
        assertEquals(id,notice.lessonId());
    }
    @Test void canceledLessonsWithdrawNoticesAndCannotBeMarkedWithoutErasingHistory() {
        String id=lesson(classA); service.dispatchDueNotices(); assertEquals(1,service.notices(2).size());
        service.cancel(1,id,0); assertTrue(service.detail(5,"TEACHER",id).lesson().cancelled()); assertEquals(0,service.notices(2).size());
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance WHERE lesson_id=?",Integer.class,id));
        clock.value=Instant.parse("2026-10-14T02:00:00Z"); fail(409,()->service.mark(5,id,marks(1,false,"")));
    }
    @Test void missedWindowsDoNotEmitOldNotificationsAndDisabledModuleDoesNotTouchMissingTables() {
        lesson(classA); clock.value=Instant.parse("2026-10-14T02:00:01Z"); assertEquals(0,service.dispatchDueNotices());
        var disabled=new TeachingService(new JdbcTemplate(),new ObjectMapper(),false,clock); assertFalse(disabled.access(1).enabled()); assertEquals(0,disabled.dispatchDueNotices());
        assertTrue(disabled.localAnswer(1,"我今天上什么课").contains("尚未启用"));
    }
    @Test void generatedSemesterLessonsKeepWeeksAndChinaTimezoneAndNoDuplicateImport() {
        String id=UUID.randomUUID().toString(); var in=new TeachingService.CourseInput(id,classA,5L,"隔周示例","示例学期",LocalDate.of(2026,10,12),3,"10:00","11:40",List.of(1,3,3),"示例教室");
        assertEquals(id,tx.execute(s->service.createCourse(1,in))); assertEquals(id,tx.execute(s->service.createCourse(1,in)));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_lessons",Integer.class));
        assertEquals(Instant.parse("2026-10-14T02:00:00Z"),service.lessons(5,"TEACHER",date,date).get(0).startsAt());
        assertEquals(0,service.lessons(5,"TEACHER",date.plusWeeks(1),date.plusWeeks(1)).size());
        fail(409,()->service.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),classA,5L,in.name(),in.semester(),in.firstMonday(),3,"10:00","11:40",List.of(1,3),in.room())));
    }
    @Test void dayAnswerOnlyContainsOwnClassAndRequiresActualBinding() {
        lesson(classA); course(classB,5,"别班课程示例",List.of(1));
        String answer=service.myDay(2,date).answer(); assertTrue(answer.contains("示例课程")); assertTrue(answer.contains("示例教室A101")); assertTrue(answer.contains("任课教师")); assertFalse(answer.contains("别班课程"));
        assertTrue(service.myDay(8,date).answer().contains("还没有绑定")); assertTrue(TeachingService.isMyDayQuestion("我今天上什么课，在哪上")); assertFalse(TeachingService.isMyDayQuestion("全校今天谁旷课"));
    }
    @Test void invalidDatesClockTimesAndOtherSchoolBindingsFailBeforeWriting() {
        int before=db.queryForObject("SELECT COUNT(*) FROM teaching_courses",Integer.class);
        fail(400,()->service.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),classA,9L,"A","B",LocalDate.of(2026,10,12),3,"10:00","11:00",List.of(1),"教室")));
        fail(400,()->service.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),classA,5L,"A","B",LocalDate.of(2026,10,12),3,"第1节","第2节",List.of(1),"教室")));
        assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM teaching_courses",Integer.class));
    }
    @Test void explicitStudentBindingIsSchoolScopedRevisionCheckedAndAudited() {
        var member=service.members(1,classC).get(0); assertNull(member.userId());
        fail(400,()->service.bindMember(1,member.id(),new TeachingService.AccountBinding(9L,null)));
        tx.execute(s->{ service.bindMember(1,member.id(),new TeachingService.AccountBinding(8L,null)); return null; });
        assertEquals(8L,service.members(1,classC).get(0).userId());
        fail(409,()->service.bindMember(1,member.id(),new TeachingService.AccountBinding(6L,null)));
        fail(403,()->service.members(2,classC));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_binding_audit",Integer.class));
    }
    @Test void recordedCorrectionsKeepCompletionAndNullStatusesRejectCleanly() {
        String id=lesson(classA); var e=service.detail(5,"TEACHER",id).entries(); clock.value=Instant.parse("2026-10-14T02:10:00Z");
        fail(400,()->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(e.get(0).studentId(),null))));
        tx.execute(s->service.mark(5,id,marks(0,true,"",new TeachingService.Mark(e.get(0).studentId(),"ON_TIME"),new TeachingService.Mark(e.get(1).studentId(),"ON_TIME"))));
        var changed=tx.execute(s->service.mark(5,id,marks(1,false,"实际迟到",new TeachingService.Mark(e.get(1).studentId(),"LATE"))));
        assertTrue(changed.lesson().finalized());
    }
    @Test void batchedListCountsMatchDetailAndStudentFilteringNeverBorrowsClassmateRows() {
        lesson(classA);course(classA,5,"同班第二门课程",List.of(1));course(classB,5,"别班课程",List.of(1));
        clock.value=Instant.parse("2026-10-14T02:10:00Z");
        var teacher=service.lessons(5,"TEACHER",date,date);assertEquals(3,teacher.size());
        for(var lesson:teacher){var entries=service.detail(5,"TEACHER",lesson.id()).entries();tx.execute(s->service.mark(5,lesson.id(),marks(0,false,"",new TeachingService.Mark(entries.get(0).studentId(),"ON_TIME"))));}
        for(var lesson:service.lessons(5,"TEACHER",date,date))assertEquals(service.detail(5,"TEACHER",lesson.id()).lesson().counts(),lesson.counts());
        var self=service.lessons(2,"STUDENT",date,date);assertEquals(2,self.size());
        for(var lesson:self){assertEquals(1,lesson.counts().total());assertEquals(1,lesson.counts().onTime());assertEquals(service.detail(2,"STUDENT",lesson.id()).lesson().counts(),lesson.counts());}
        for(var lesson:service.lessons(3,"STUDENT",date,date)){assertEquals(1,lesson.counts().unknown());assertEquals(0,lesson.counts().onTime());}
    }
    @Test void missingSchoolCannotBecomeImplicitZeroTenantEvenForAnAdmin() {
        db.update("UPDATE users SET school_id=NULL WHERE id=1");
        fail(403,()->service.createClass(1,new TeachingService.ClassInput(UUID.randomUUID().toString(),"合成学院","合成班",List.of(new TeachingService.Member("invalid-tenant","合成未绑定同学",null)))));
        db.update("UPDATE users SET school_id=0 WHERE id=5");fail(403,()->service.access(5));
    }
    @Test void additiveTeachingSchemaCanBeReappliedWithoutDuplicateIndexFailure() throws Exception {
        for(String sql:Files.readString(Path.of("../deploy/migrations/2026-10-14-teaching-attendance.sql")).split(";")) if(!sql.isBlank())db.execute(sql);
        assertEquals(3,service.classes(1).size());assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));
    }
    @Test void adminConfigurationPagesReachEveryClassWithoutUsingLegacyArrayAndPinSelectedOutsideSearch() {
        for(int i=0;i<501;i++) db.update("INSERT INTO teaching_classes(id,school_id,college,name,request_hash) VALUES(?,1,?,?,?)",UUID.randomUUID().toString(),"容量学院","容量班"+String.format("%03d",i),"synthetic-"+i);
        fail(400,()->service.classes(1));
        Set<String> ids=new HashSet<>();
        for(int i=0;i<21;i++) {var p=service.configurationPage(1,"CLASS",i,25,"",classA);assertEquals(504,p.total());assertEquals(classA,p.selected().value());for(var row:p.items())assertTrue(ids.add(row.value()));}
        assertEquals(504,ids.size());
        var none=service.configurationPage(1,"CLASS",0,25,"not-existing",classA);assertEquals(0,none.total());assertEquals(classA,none.selected().value());
        var colleges=service.configurationPage(1,"COLLEGE",0,1,"","示例学院乙");assertEquals(3,colleges.total());assertEquals("示例学院乙",colleges.selected().value());
        var foreign=UUID.randomUUID().toString();db.update("INSERT INTO teaching_classes(id,school_id,college,name,request_hash) VALUES(?,2,'私有学院','外校班','foreign')",foreign);
        assertNull(service.configurationPage(1,"CLASS",0,25,"",foreign).selected());
        fail(403,()->service.configurationPage(2,"CLASS",0,25,"",classA));
        fail(400,()->service.configurationPage(1,"CLASS",22,25,"",classA));
        fail(400,()->service.configurationPage(1,"CLASS",0,101,"",classA));
    }
    @Test void configurationSearchTreatsWildcardCharactersAsLiteralText() {
        var id=UUID.randomUUID().toString();db.update("INSERT INTO teaching_classes(id,school_id,college,name,request_hash) VALUES(?,1,'合成!学院','合成_班%','literal')",id);
        for(String search:List.of("_","%","!")) assertEquals(1,service.configurationPage(1,"CLASS",0,25,search,"").total());
        assertEquals(0,service.configurationPage(1,"COLLEGE",0,25,"%","").total());
    }
    @Test void returningCompletedRecordToUnknownReopensPendingAndPreservesAuditedHistory() {
        String id=lesson(classA);var e=service.detail(5,"TEACHER",id).entries();clock.value=Instant.parse("2026-10-14T02:10:00Z");
        tx.execute(s->service.mark(5,id,marks(0,true,"",new TeachingService.Mark(e.get(0).studentId(),"ON_TIME"),new TeachingService.Mark(e.get(1).studentId(),"ON_TIME"))));
        fail(400,()->service.mark(5,id,marks(1,false,"",new TeachingService.Mark(e.get(0).studentId(),"UNKNOWN"))));
        var reopened=tx.execute(s->service.mark(5,id,marks(1,false,"记录待重新核对",new TeachingService.Mark(e.get(0).studentId(),"UNKNOWN"))));
        assertFalse(reopened.lesson().finalized());assertEquals(1,reopened.lesson().counts().unknown());assertEquals(0,reopened.lesson().counts().absent());assertEquals(2,reopened.lesson().revision());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=? AND old_status='ON_TIME' AND new_status='UNKNOWN' AND reason='记录待重新核对'",Integer.class,id));
        fail(400,()->service.mark(5,id,marks(2,true,"")));
        var restored=tx.execute(s->service.mark(5,id,marks(2,true,"",new TeachingService.Mark(e.get(0).studentId(),"ON_TIME"))));assertTrue(restored.lesson().finalized());
    }
    @Test void missingTeacherAccountDoesNotEraseAuthorizedCourseOrAttendanceHistory() {
        String id=lesson(classA);service.grant(1,new TeachingService.GrantInput(6L,"COUNSELOR",classA),false);service.grant(1,new TeachingService.GrantInput(7L,"SECRETARY","示例学院甲"),false);
        clock.value=Instant.parse("2026-10-14T02:10:00Z");var entry=service.detail(5,"TEACHER",id).entries().get(0);
        tx.execute(s->service.mark(5,id,marks(0,false,"",new TeachingService.Mark(entry.studentId(),"LATE"))));
        // Deletion is only in this disposable H2 fixture. Never apply to a real account.
        db.update("DELETE FROM users WHERE id=5");
        for(long user:new long[]{2,6,7}) {String role=user==2?"STUDENT":user==6?"COUNSELOR":"SECRETARY";var records=service.lessons(user,role,date,date);assertEquals(1,records.size());assertEquals("教师账号未绑定",records.get(0).teacher());assertEquals(1,records.get(0).counts().late());assertEquals(id,service.detail(user,role,id).lesson().id());}
        fail(403,()->service.detail(5,"TEACHER",id));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
    }
    @Test void repeatedReminderScanSkipsExistingRecipientsWithoutAnotherInsertAttempt() {
        lesson(classA);var tracedDb=org.mockito.Mockito.spy(db);var traced=new TeachingService(tracedDb,new ObjectMapper(),true,clock);
        assertEquals(2,traced.dispatchDueNotices());org.mockito.Mockito.clearInvocations(tracedDb);assertEquals(0,traced.dispatchDueNotices());
        org.mockito.Mockito.verify(tracedDb,org.mockito.Mockito.never()).update(org.mockito.ArgumentMatchers.startsWith("INSERT INTO teaching_notices"),org.mockito.ArgumentMatchers.any(Object[].class));
        clock.value=Instant.parse("2026-10-14T01:55:00Z");assertEquals(1,traced.dispatchDueNotices());org.mockito.Mockito.clearInvocations(tracedDb);assertEquals(0,traced.dispatchDueNotices());
        org.mockito.Mockito.verify(tracedDb,org.mockito.Mockito.never()).update(org.mockito.ArgumentMatchers.startsWith("INSERT INTO teaching_notices"),org.mockito.ArgumentMatchers.any(Object[].class));
        assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
    }
    @Test void inactiveTeacherDoesNotSuppressStudentRemindersOrReceiveRosterReminder() {
        lesson(classA);db.update("UPDATE users SET status=0 WHERE id=5");
        assertEquals(2,service.dispatchDueNotices());assertEquals(1,service.notices(2).size());
        clock.value=Instant.parse("2026-10-14T01:55:00Z");assertEquals(0,service.dispatchDueNotices());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE user_id=5",Integer.class));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
    }
    @Test void studentCanStillReadAndAcknowledgeReminderAfterTeacherAccountIsDeleted() {
        String id=lesson(classA);assertEquals(2,service.dispatchDueNotices());String notice=service.notices(2).get(0).id();
        // Only the disposable fixture loses its teacher account; the real database is untouched.
        db.update("DELETE FROM users WHERE id=5");
        var inbox=service.notices(2);assertEquals(1,inbox.size());assertEquals(id,inbox.get(0).lessonId());assertEquals("教师账号未绑定",inbox.get(0).teacher());
        service.readNotice(2,notice);assertNotNull(service.notices(2).get(0).readAt());
        clock.value=Instant.parse("2026-10-14T01:55:00Z");assertEquals(0,service.dispatchDueNotices());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE user_id=5",Integer.class));
        service.cancel(1,id,0);assertTrue(service.notices(2).isEmpty());fail(404,()->service.readNotice(2,notice));
    }
    @Test void teacherAccountMovedToAnotherSchoolCannotLeakCurrentNameOrReceiveReminder() {
        String id=lesson(classA);db.update("UPDATE users SET school_id=2,nickname='其他学校私有姓名' WHERE id=5");
        assertEquals("教师账号未绑定",service.detail(2,"STUDENT",id).lesson().teacher());
        assertEquals(2,service.dispatchDueNotices());assertEquals("教师账号未绑定",service.notices(2).get(0).teacher());
        clock.value=Instant.parse("2026-10-14T01:55:00Z");assertEquals(0,service.dispatchDueNotices());assertTrue(service.notices(5).isEmpty());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE user_id=5",Integer.class));
        fail(403,()->service.detail(5,"TEACHER",id));
    }
    @Test @Timeout(20) void largeDueWindowMakesBoundedProgressAndDoesNotStarveLaterStudentOrTeacherPass() {
        for(int i=0;i<501;i++)course(classA,5,"批次合成课程"+i,List.of(1));
        clock.value=Instant.parse("2026-10-14T01:00:00Z");
        assertEquals(200,dispatchInTransaction());
        assertEquals(100,db.queryForObject("SELECT COUNT(DISTINCT lesson_id) FROM teaching_notices",Integer.class));
        for(int i=0;i<4;i++)assertEquals(200,dispatchInTransaction());
        assertEquals(2,dispatchInTransaction());assertEquals(0,dispatchInTransaction());
        assertEquals(501,db.queryForObject("SELECT COUNT(DISTINCT lesson_id) FROM teaching_notices",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE kind='TEACHER_ROSTER'",Integer.class));
        clock.value=Instant.parse("2026-10-14T01:55:00Z");
        for(int i=0;i<5;i++)assertEquals(100,dispatchInTransaction());
        assertEquals(1,dispatchInTransaction());assertEquals(0,dispatchInTransaction());
        assertEquals(1503,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
        assertEquals(501,db.queryForObject("SELECT COUNT(*) FROM teaching_notices WHERE kind='TEACHER_ROSTER'",Integer.class));
    }
    @Test @Timeout(20) void unavailableRecipientLessonsDoNotConsumeThePendingReminderBatch() {
        for(int i=0;i<501;i++)course(classC,8,"无活跃收件人合成课程"+i,List.of(1));
        lesson(classA);db.update("UPDATE users SET status=0 WHERE id=8");clock.value=Instant.parse("2026-10-14T01:55:00Z");
        assertEquals(3,dispatchInTransaction());assertEquals(0,dispatchInTransaction());
        assertEquals(1,db.queryForObject("SELECT COUNT(DISTINCT lesson_id) FROM teaching_notices",Integer.class));
        assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
    }
}
