package com.campusai.timetable;

import com.campusai.teaching.TeachingService;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(10)
class UnifiedTimetableServiceTest {
    JdbcTemplate db; CourseScheduleService personal; TeachingService teaching; UnifiedTimetableService unified;
    final LocalDate monday=LocalDate.of(2026,10,12),wednesday=LocalDate.of(2026,10,14);
    final Clock clock=Clock.fixed(Instant.parse("2026-10-14T05:00:00Z"),ZoneOffset.UTC);
    final String classA=UUID.randomUUID().toString(),classB=UUID.randomUUID().toString(),classC=UUID.randomUUID().toString();
    @BeforeEach void setup() throws Exception {
        db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:unified"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(16),status INT,nickname VARCHAR(100),username VARCHAR(100))");
        for(int i=1;i<=8;i++) db.update("INSERT INTO users VALUES(?,?,?,?,?,?)",i,i==8?2:1,i==1?"ADMIN":"STUDENT",1,"合成账号"+i,"demo"+i);
        db.execute("CREATE TABLE student_course_schedule_versions(user_id BIGINT PRIMARY KEY,revision INT NOT NULL)");
        // The read path needs only existence, never image bytes or image metadata.
        db.execute("CREATE TABLE student_timetables(user_id BIGINT PRIMARY KEY)");
        db.execute("CREATE TABLE student_course_schedules(user_id BIGINT PRIMARY KEY,revision INT,semester VARCHAR(100),first_monday DATE,remind_days INT,courses_json CLOB,imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        for(String sql:Files.readString(Path.of("../deploy/migrations/2026-10-14-teaching-attendance.sql")).split(";")) if(!sql.isBlank()) db.execute(sql);
        var json=new ObjectMapper(); personal=new CourseScheduleService(db,json); teaching=new TeachingService(db,json,true,clock); unified=new UnifiedTimetableService(db,personal,teaching,1,clock);
        teaching.createClass(1,new TeachingService.ClassInput(classA,"合成学院甲","合成班A",List.of(new TeachingService.Member("demo-2","合成学生甲",2L),new TeachingService.Member("demo-3","合成学生乙",3L))));
        teaching.createClass(1,new TeachingService.ClassInput(classB,"合成学院甲","合成班B",List.of(new TeachingService.Member("demo-7","合成学生丙",7L))));
        teaching.createClass(1,new TeachingService.ClassInput(classC,"合成学院乙","合成班C",List.of(new TeachingService.Member("demo-c","合成学生丁",null))));
        teaching.grant(1,new TeachingService.GrantInput(5L,"COUNSELOR",classA),false); teaching.grant(1,new TeachingService.GrantInput(6L,"SECRETARY","合成学院甲"),false);
    }
    String course(String clazz,String name,String start,String end) {
        return teaching.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),clazz,4L,name,"合成学期",monday,3,start,end,List.of(1,3),"合成教室"));
    }
    CourseScheduleService.Course period(String name,int start,int end,List<Integer> weeks) { return new CourseScheduleService.Course(name,3,null,null,weeks,"合成教室",start,end); }
    void save(long user,List<CourseScheduleService.Course> rows) { personal.save(user,new CourseScheduleService.Input(0,"合成学期",monday,7,rows)); }
    void fail(int code,Runnable task) { assertEquals(code,assertThrows(ResponseStatusException.class,task::run).getStatusCode().value()); }
    @Test void givenEightPeriodsUseAfternoonAndNeverInventNinthPeriod() {
        assertEquals("08:30",CampusBellSchedule.span(1,2).start()); assertEquals("10:05",CampusBellSchedule.span(1,2).end());
        assertEquals("14:00",CampusBellSchedule.span(5,6).start()); assertEquals("15:35",CampusBellSchedule.span(5,6).end());
        assertEquals("17:25",CampusBellSchedule.span(7,8).end()); assertNull(CampusBellSchedule.span(9,10)); assertNull(CampusBellSchedule.exact("08:00","09:40"));
    }
    @Test void imageOnlySourceIsNotPresentedAsAnEmptyQueryableTimetableOrFreeWeek() {
        db.update("INSERT INTO student_timetables(user_id) VALUES(2)");
        var answer=unified.query(2,monday,monday.plusDays(6),"ALL","ALL","FREE",null);
        assertEquals("UNRESOLVED",answer.display().state());
        assertEquals(0,answer.count());assertTrue(answer.display().freeDates().isEmpty());
        assertTrue(answer.answer().contains("旧课表图片"));
        assertTrue(answer.answer().contains("未读取图片内容"));
        assertFalse(answer.answer().contains("未匹配到已存安排的日期："));
        course(classA,"仅已授权的合成课程","08:30","10:05");
        var known=unified.query(2,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null);
        assertEquals(1,known.count());assertEquals("READY",known.display().state());
        assertTrue(known.display().notices().stream().anyMatch(n->n.contains("未读取图片内容")));
        var noFree=unified.query(2,monday,monday.plusDays(6),"ALL","ALL","FREE",null);
        assertEquals("UNRESOLVED",noFree.display().state());assertTrue(noFree.display().entries().isEmpty());assertTrue(noFree.display().freeDates().isEmpty());
        assertTrue(unified.query(3,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null).display().notices().stream().noneMatch(n->n.contains("图片")));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM student_timetables",Integer.class));
    }
    @Test void structuredSourceOutsideDatesIsExplainedWithoutLeakingTitlesOrClaimingImageCoverage() {
        save(2,List.of(period("不会泄漏到范围外的合成课名",1,2,List.of(1))));
        var before=personal.get(2L).schedule();
        var answer=unified.query(2,monday.plusWeeks(8),monday.plusWeeks(8).plusDays(6),"ALL","ALL","SUMMARY",null);
        assertEquals(0,answer.count());assertEquals("EMPTY",answer.display().state());
        assertTrue(answer.display().notices().stream().anyMatch(n->n.contains("已保存的个人课表记录")));
        assertFalse(answer.answer().contains("不会泄漏到范围外的合成课名"));
        assertEquals(before,personal.get(2L).schedule());
    }
    @Test void anExplicitlyClearedTermIsNotMisclassifiedAsAnUnparsedImage() throws Exception {
        for(String sql:Files.readString(Path.of("../deploy/migrations/V20261019__personal_schedule_history.sql")).split(";"))if(!sql.isBlank())db.execute(sql);
        save(2,List.of(period("已经清空的合成课",1,2,List.of(1))));
        db.update("INSERT INTO student_timetables(user_id) VALUES(2)");
        personal.delete(2L,personal.get(2L).schedule().revision());
        var answer=unified.query(2,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null);
        assertEquals(0,answer.count());assertEquals("EMPTY",answer.display().state());
        assertTrue(answer.display().notices().stream().anyMatch(n->n.contains("已保存的个人课表记录")));
        assertFalse(answer.answer().contains("本次未读取图片内容"));
        assertNull(personal.get(2L).schedule());
        assertEquals(1,personal.terms(2L).size());assertTrue(personal.terms(2L).get(0).emptyConfirmed());
    }
    @Test void metadataIsReadAfterAuthorizationAndExplicitTeachingDoesNotReadPersonalSources() {
        course(classA,"实际任课的合成课","08:30","10:05");
        db.execute("DROP TABLE student_timetables");
        fail(403,()->unified.query(99,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null));
        assertEquals(1,unified.query(4,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null,"","TEACHER").count());
    }
    @Test void exactSourcesMergeOnceKeepTeacherAndDoNotOverwritePersonalInput() {
        course(classA,"合成网络课程","08:30","10:05"); save(2,List.of(period("合成网络课程",1,2,List.of(1,3))));
        var before=personal.get(2L).schedule(); var week=unified.week(2,"STUDENT",monday,null);
        assertEquals(1,week.entries().size()); assertEquals(1,week.summary().mergedDuplicates());
        var e=week.entries().get(0); assertEquals(List.of("PERSONAL","TEACHING"),e.sources()); assertEquals("合成账号4",e.teacher()); assertEquals("08:30",e.startTime()); assertEquals(1,e.startPeriod()); assertEquals("UNKNOWN",e.attendance());
        assertEquals(before,personal.get(2L).schedule()); assertNull(personal.get(3L).schedule());
    }
    @Test void importedTeacherFlowsIntoQueryButDoesNotGrantTeacherScope() {
        save(2,List.of(new CourseScheduleService.Course("个人教师课",3,null,null,List.of(1),"合成教室",1,2,"合成教师甲")));
        var result=unified.query(2,wednesday,wednesday,"ALL","ALL","TEACHER",null);assertEquals("合成教师甲",result.display().entries().get(0).teacher());assertTrue(result.answer().contains("合成教师甲"));
        fail(403,()->unified.query(2,wednesday,wednesday,"ALL","ALL","SUMMARY",null,"","TEACHER"));
    }
    @Test void conflictingTeacherNamesPreventFalsePersonalFormalMerge() {
        course(classA,"同名课程","08:30","10:05");save(2,List.of(new CourseScheduleService.Course("同名课程",3,null,null,List.of(1),"合成教室",1,2,"另一位合成教师")));
        var result=unified.week(2,"STUDENT",monday,null);assertEquals(2,result.entries().size());assertEquals(0,result.summary().mergedDuplicates());assertTrue(result.entries().stream().allMatch(UnifiedTimetableService.Entry::conflict));
        assertEquals(Set.of("合成账号4","另一位合成教师"),new HashSet<>(result.entries().stream().map(UnifiedTimetableService.Entry::teacher).toList()));
    }
    @Test void ambiguousPersonalTeacherRowsCannotDuplicateOrConsumeOneFormalLesson() {
        course(classA,"同名课程","08:30","10:05");save(2,List.of(period("同名课程",1,2,List.of(1)),new CourseScheduleService.Course("同名课程",3,null,null,List.of(1),"合成教室",1,2,"合成账号4")));
        var result=unified.week(2,"STUDENT",monday,null);assertEquals(3,result.entries().size());assertEquals(0,result.summary().mergedDuplicates());assertEquals(3,result.entries().stream().map(UnifiedTimetableService.Entry::id).distinct().count());
    }
    @Test void eachAssignedTeacherAndStudentReadTheSameDatedLessonIdsFromTheCourseOwner() {
        course(classA,"甲教师课程","08:30","10:05");teaching.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),classA,5L,"乙教师课程","合成学期",monday,4,"14:00","15:35",List.of(1,3),"合成教室"));
        var student=unified.week(2,"STUDENT",monday,null).entries();var first=unified.query(4,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null,"","TEACHER").display().entries();var second=unified.query(5,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null,"","TEACHER").display().entries();
        assertEquals(2,student.size());assertEquals(1,first.size());assertEquals(1,second.size());assertEquals("甲教师课程",first.get(0).name());assertEquals(wednesday,first.get(0).date());assertEquals("08:30",first.get(0).startTime());assertEquals("合成账号4",first.get(0).teacher());
        assertEquals("乙教师课程",second.get(0).name());assertEquals(wednesday.plusDays(1),second.get(0).date());assertEquals("合成账号5",second.get(0).teacher());assertTrue(student.stream().anyMatch(e->e.id().equals(first.get(0).id())));assertTrue(student.stream().anyMatch(e->e.id().equals(second.get(0).id())));
    }
    @Test void differentRoomsAndAmbiguousSameNamedLessonsRemainAndExposeConflict() {
        course(classA,"合成网络课程","08:30","10:05");
        save(2,List.of(new CourseScheduleService.Course("合成网络课程",3,null,null,List.of(1),"另一合成教室",1,2)));
        var week=unified.week(2,"STUDENT",monday,null); assertEquals(2,week.entries().size()); assertEquals(0,week.summary().mergedDuplicates()); assertEquals(2,week.summary().conflicts());
        assertTrue(week.entries().stream().allMatch(UnifiedTimetableService.Entry::conflict));
    }
    @Test void explicitOddWeeksAndUnknownClockRowsArePreservedNotMarkedAsCurrent() {
        save(2,List.of(period("已知钟点",5,6,List.of(1,3)),period("未知晚课",9,10,List.of(1))));
        var week=unified.week(2,"STUDENT",monday,null); assertEquals(2,week.entries().size()); assertTrue(week.entries().stream().anyMatch(e->e.startTime()==null && e.timeLabel().contains("待配置")));
        assertEquals("14:00",week.next().startTime()); assertEquals(0,unified.week(2,"STUDENT",monday.plusWeeks(1),null).entries().size());
    }
    @Test void schoolBoundClockDoesNotApplyToAnotherSchool() {
        save(8,List.of(period("其他学校合成课程",1,2,List.of(1)))); var week=unified.week(8,"STUDENT",monday,null);
        assertNull(week.entries().get(0).startTime()); assertEquals(List.of(),week.bells()); assertTrue(week.clockSource().contains("尚未配置"));
    }
    @Test void disabledTeachingStillShowsOwnerPrivateScheduleWithoutGuessingAuthorization() {
        save(2,List.of(period("私人课程",1,2,List.of(1))));
        var disabled=new TeachingService(db,new ObjectMapper(),false,clock); var local=new UnifiedTimetableService(db,personal,disabled,1,clock);
        assertEquals(1,local.week(2,null,monday,null).entries().size()); assertFalse(local.week(2,null,monday,null).teachingEnabled());
        fail(403,()->local.week(2,"SECRETARY",monday,null)); fail(403,()->local.week(2,"STUDENT",monday,classB));
        fail(403,()->local.query(2,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null,"","TEACHER"));
        assertEquals(1,local.query(2,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null,"","STUDENT").count());
    }
    @Test void allFourViewsAreScopedAndLeadersNeverReceiveTheirPrivateImportAlongsideOtherRecords() {
        course(classA,"课程A","08:30","10:05"); course(classB,"课程B","14:00","15:35"); course(classC,"课程C","16:40","17:25");
        save(5,List.of(period("辅导员私人课程",3,4,List.of(1)))); save(6,List.of(period("书记私人课程",3,4,List.of(1))));
        assertEquals(1,unified.week(2,null,monday,null).entries().size()); assertEquals(3,unified.week(4,null,monday,null).entries().size());
        var counselor=unified.week(5,null,monday,null); assertEquals("COUNSELOR",counselor.view()); assertEquals(1,counselor.entries().size()); assertEquals(1,counselor.classes().size());
        var secretary=unified.week(6,null,monday,null); assertEquals("SECRETARY",secretary.view()); assertEquals(2,secretary.entries().size()); assertEquals(2,secretary.classes().size());
        assertTrue(secretary.entries().stream().noneMatch(e->e.name().contains("私人"))); fail(403,()->unified.week(2,"TEACHER",monday,null)); fail(404,()->unified.week(5,"COUNSELOR",monday,classB));
    }
    @Test void classFilterIsAppliedInBackendNotInClientAndDoesNotRevealForeignClass() {
        course(classA,"课程A","08:30","10:05"); course(classB,"课程B","14:00","15:35"); course(classC,"课程C","16:40","17:25");
        assertEquals(1,unified.week(6,"SECRETARY",monday,classB).entries().size()); fail(404,()->unified.week(6,"SECRETARY",monday,classC)); fail(403,()->unified.week(8,"SECRETARY",monday,classA));
    }
    @Test void cancelledTeachingMarksMatchingImportForReviewAndStopsNextClassWithoutDeletingOriginal() {
        course(classA,"待取消课程","14:00","15:35"); save(2,List.of(period("待取消课程",5,6,List.of(1))));
        String id=teaching.lessons(4,"TEACHER",wednesday,wednesday).get(0).id(); teaching.cancel(1,id,0);
        var week=unified.week(2,"STUDENT",monday,null); assertTrue(week.entries().get(0).cancelled()); assertNull(week.next()); assertEquals(0,week.summary().plannedClasses()); assertEquals(1,personal.get(2L).schedule().courses().size()); assertTrue(week.warnings().stream().anyMatch(s->s.contains("原个人导入没有修改")));
        var answer=unified.query(2,wednesday,wednesday,"ALL","ALL","SUMMARY",null);
        assertEquals(0,answer.count());assertTrue(answer.display().notices().stream().anyMatch(n->n.contains("1项")&&n.contains("取消或待核对")));
    }
    @Test void backendCountsDistinctAbsentPeopleSeparatelyFromAbsenceInstances() {
        course(classA,"合成课A","08:30","09:15"); course(classA,"合成课B","09:20","10:05");
        for(var lesson:teaching.lessons(4,"TEACHER",wednesday,wednesday)) {
            var e=teaching.detail(4,"TEACHER",lesson.id()).entries().get(0);
            teaching.mark(4,lesson.id(),new TeachingService.RollCall(0,List.of(new TeachingService.Mark(e.studentId(),"ABSENT")),"",false));
        }
        var summary=unified.week(6,"SECRETARY",monday,null).summary(); assertEquals(2,summary.attendance().absent()); assertEquals(1,summary.absentStudents());
        assertEquals(1,unified.week(2,"STUDENT",monday,null).summary().absentStudents()); assertEquals(0,unified.week(3,"STUDENT",monday,null).summary().absentStudents());
    }
    @Test void privateDayUsesBothSavedSourcesAndNeverGuessesTeacherOrAttendance() {
        course(classA,"教学课程","14:00","15:35"); save(2,List.of(period("个人实验",3,4,List.of(1))));
        String answer=unified.day(2,wednesday).answer(); assertTrue(answer.contains("个人实验")); assertTrue(answer.contains("教学课程")); assertTrue(answer.contains("任课教师未绑定")); assertTrue(answer.contains("不推断考勤"));
    }
    @Test void personalNaturalLanguageQueryHasRealPeriodAndWeekSemanticsAcrossSources() {
        course(classA,"下午教学课程","14:00","15:35");save(2,List.of(period("上午个人课程",1,2,List.of(1)),period("下午个人课程",5,6,List.of(1))));
        var morning=unified.query(2,monday,monday.plusDays(6),"AM","ALL","SUMMARY",null);
        assertEquals(1,morning.count());assertTrue(morning.answer().contains("上午个人课程"));assertFalse(morning.answer().contains("下午教学课程"));
        assertEquals(3,unified.query(2,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null).count());
        assertTrue(unified.query(2,monday,monday.plusDays(6),"ALL","ALL","PERIODS",null).answer().contains("6节课"));
        assertEquals(2,unified.query(2,wednesday,wednesday,"ALL","REMAINING","SUMMARY",null).count());
        assertEquals(0,unified.query(3,monday,monday.plusDays(6),"AM","ALL","SUMMARY",null).count());
    }
    @Test void privateQueryDoesNotElevateLeadersAndRejectsUnavailableOwner() {
        course(classA,"负责班级课程","14:00","15:35");save(5,List.of(period("本人私课",1,2,List.of(1))));
        var mine=unified.query(5,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null);
        assertEquals(1,mine.count());assertTrue(mine.answer().contains("本人私课"));assertFalse(mine.answer().contains("负责班级课程"));
        fail(403,()->unified.query(999,monday,monday.plusDays(6),"ALL","ALL","SUMMARY",null));
        fail(400,()->unified.query(2,monday,monday.plusDays(14),"ALL","ALL","SUMMARY",null));
    }
    @Test void repeatedPersonalCourseAcrossWeeksHasDistinctOccurrencesAndNoDroppedDates() {
        save(2,List.of(period("跨周合成课程",1,2,List.of(1,2))));
        var result=unified.query(2,monday,monday.plusDays(13),"ALL","ALL","SUMMARY",null);
        assertEquals(2,result.count());
        assertEquals(List.of(wednesday,wednesday.plusWeeks(1)),result.display().entries().stream().map(ScheduleQueryEngine.DisplayEntry::date).toList());
        assertEquals(2,result.display().entries().stream().map(ScheduleQueryEngine.DisplayEntry::id).distinct().count());
    }
    @Test void teachingOnlyStudentAndTeacherPageBeyondLegacyCapWithoutChangingOldCompleteOrErrorContract() {
        String id=course(classA,"分页合成课程","08:30","09:15");Instant start=wednesday.atTime(8,30).atZone(com.campusai.teaching.TeachingService.ZONE).toInstant();
        for(int i=1;i<=500;i++) {
            String lesson=UUID.randomUUID().toString();
            db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,?,?,?,?,?)",lesson,1,id,classA,java.sql.Timestamp.from(start.plusSeconds(i*60L)),java.sql.Timestamp.from(start.plusSeconds(i*60L+2700)));
        }
        fail(400,()->unified.week(4,"TEACHER",monday,null));
        for(long actor:List.of(2L,4L)) {
            String view=actor==2?"STUDENT":"TEACHER";Set<String> reached=new HashSet<>();
            for(int page=0;page<11;page++) {
                var value=unified.page(actor,view,monday,null,page,50);assertEquals(501,value.total());assertEquals(501,value.week().summary().plannedClasses());
                value.week().entries().forEach(e->assertTrue(reached.add(e.id())));assertNull(value.week().next());assertFalse(value.week().gridSafe());
            }
            assertEquals(501,reached.size());
        }
        fail(403,()->unified.page(8,"TEACHER",monday,null,0,50));
        fail(404,()->unified.page(2,"STUDENT",monday,classB,0,50));
        var first=unified.query(4,wednesday,wednesday,"ALL","FIRST","SUMMARY",null,"","TEACHER");
        assertEquals(1,first.count());assertEquals("TEACHER",first.queryScope().resolved());
        assertEquals(List.of("TEACHING"),first.display().entries().get(0).sources());
    }
    @Test void teachingOnlyPageKeepsOwnStatusMarkingFocusGridAndCrossClassTeacherConflicts() {
        course(classA,"任课甲","14:00","15:35");
        var teacher=unified.page(4,"TEACHER",monday,null,0,50).week();assertNotNull(teacher.next());assertTrue(teacher.gridSafe());
        var student=unified.page(2,"STUDENT",monday,null,0,50).week();assertEquals("UNKNOWN",student.entries().get(0).attendance());
        course(classB,"任课乙","14:00","15:35");
        teacher=unified.page(4,"TEACHER",monday,null,0,50).week();assertEquals(2,teacher.summary().conflicts());assertTrue(teacher.entries().stream().allMatch(Entry->Entry.conflict()));
        assertFalse(teacher.gridSafe());
    }
    @Test @Timeout(30) void mixedSourcePagesCrossLegacyCapWithoutRepeatingOrDroppingMergedPersonalRows() {
        String courseId=course(classA,"混合分页课程","08:30","10:05");Instant start=wednesday.atTime(8,30).atZone(TeachingService.ZONE).toInstant();
        for(int i=1;i<=500;i++)db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID().toString(),1,courseId,classA,java.sql.Timestamp.from(start.plusSeconds(i*60L)),java.sql.Timestamp.from(start.plusSeconds(i*60L+2700)));
        save(2,List.of(period("混合分页课程",1,2,List.of(1)),period("仅本人副本",7,8,List.of(1))));
        var before=personal.get(2L).schedule();Set<String> reached=new HashSet<>();int mixed=0,onlyPersonal=0;
        for(int page=0;page<11;page++) {
            var result=unified.page(2,"STUDENT",monday,null,page,50);assertEquals(502,result.total());assertEquals(1,result.week().summary().mergedDuplicates());assertEquals(502,result.week().summary().plannedClasses());
            for(var e:result.week().entries()){assertTrue(reached.add(e.id()));if(e.sources().size()==2){mixed++;assertEquals(2,e.originIds().size());}if(e.sources().equals(List.of("PERSONAL")))onlyPersonal++;}
        }
        assertEquals(502,reached.size());assertEquals(1,mixed);assertEquals(1,onlyPersonal);assertEquals(before,personal.get(2L).schedule());
        fail(400,()->unified.week(2,"STUDENT",monday,null));fail(403,()->unified.page(8,"TEACHER",monday,null,0,50));
        var next=unified.query(2,wednesday,wednesday,"ALL","NEXT","SUMMARY",null);assertEquals(1,next.count());assertNotNull(next.focus());
        var selected=unified.query(2,wednesday,wednesday,"ALL","ALL","SUMMARY",null,"仅本人副本");assertEquals(1,selected.count());assertTrue(selected.answer().contains("仅本人副本"));
        assertEquals(before,personal.get(2L).schedule());
    }
    @Test void sqlMixedPageKeepsExactCaseAmbiguityCancellationAndUnknownClockSemantics() {
        String c=course(classA,"Exact课程","08:30","10:05");
        save(2,List.of(period("Exact课程",1,2,List.of(1)),period("exact课程",1,2,List.of(1)),period("未知钟点",9,10,List.of(1))));
        var legacy=unified.week(2,"STUDENT",monday,null);var paged=unified.page(2,"STUDENT",monday,null,0,50).week();
        assertEquals(legacy.entries(),paged.entries());assertEquals(legacy.summary(),paged.summary());
        teaching.cancel(1,teaching.lessons(4,"TEACHER",wednesday,wednesday).get(0).id(),0);
        paged=unified.page(2,"STUDENT",monday,null,0,50).week();assertEquals(2,paged.summary().plannedClasses());assertTrue(paged.entries().stream().filter(e->e.sources().size()==2).allMatch(UnifiedTimetableService.Entry::cancelled));
        assertEquals(3,personal.get(2L).schedule().courses().size());assertNotNull(c);
    }
    @Test void dateAndIdentityBoundariesStopBeforeReturningRecords() {
        fail(400,()->unified.week(2,"STUDENT",wednesday,null)); db.update("UPDATE users SET status=0 WHERE id=2"); fail(403,()->unified.week(2,"STUDENT",monday,null)); fail(403,()->unified.week(999,"STUDENT",monday,null));
    }
    @Test void personalOverlappingCoverageRowsDeduplicateOnlyThisWeekAndRetainBothSourceIds() {
        save(2,List.of(period("重复覆盖",1,2,List.of(1)),period("重复覆盖",1,2,List.of(1,3))));
        var week=unified.week(2,"STUDENT",monday,null); assertEquals(1,week.entries().size()); assertEquals(1,week.summary().mergedDuplicates()); assertEquals(2,week.entries().get(0).originIds().size());
        assertEquals(2,personal.get(2L).schedule().courses().size()); assertEquals(1,unified.week(2,"STUDENT",monday.plusWeeks(2),null).entries().size());
    }
    @Test void unknownDifferentPeriodRangesDoNotCollapseAndTodayDueAttendanceIsComputedByBackend() {
        save(2,List.of(period("未知课程",9,10,List.of(1)),period("未知课程",11,12,List.of(1)))); assertEquals(2,unified.week(2,"STUDENT",monday,null).entries().size());
        course(classA,"上午未完成点名","08:30","10:05"); course(classB,"下午下一节","14:00","15:35");
        var teacher=unified.week(4,null,monday,null); assertEquals("上午未完成点名",teacher.attention().name()); assertEquals("下午下一节",teacher.next().name());
        assertTrue(teacher.attention().canMark()); assertFalse(teacher.next().canMark());
    }
    @Test void legitimateConcurrentCollegeClassesCannotHideEachOtherInGrid() {
        course(classA,"同时间班A","14:00","15:35"); course(classB,"同时间班B","14:00","15:35");
        var secretary=unified.week(6,"SECRETARY",monday,null);
        assertEquals(0,secretary.summary().conflicts()); assertFalse(secretary.gridSafe()); assertEquals(2,secretary.entries().size());
        assertTrue(unified.week(6,"SECRETARY",monday,classA).gridSafe());
    }
    @Test void runningAndNextLabelsComeFromServerClock() {
        course(classA,"正在上的课","11:10","14:45");
        assertEquals("正在上课",unified.week(2,"STUDENT",monday,null).focusLabel());
        assertEquals("今天待完成点名",unified.week(4,"TEACHER",monday,null).focusLabel());
    }
    @Test void leadersPersonalDayQuestionNeverSubstitutesResponsibleClassForOwnImport() {
        course(classA,"所负责班级教学课","14:00","15:35"); save(5,List.of(period("辅导员本人私有课",3,4,List.of(1))));
        String day=unified.day(5,wednesday).answer();assertTrue(day.contains("辅导员本人私有课"));assertFalse(day.contains("所负责班级教学课"));
        assertFalse(unified.day(6,wednesday).answer().contains("所负责班级教学课"));
    }
    @Test void currentRosterTakesPriorityOverEarlierUnfinishedRollCall() {
        course(classA,"上午未完成","08:30","10:05");course(classB,"当前任课","14:00","15:35");
        Clock atFive=Clock.fixed(Instant.parse("2026-10-14T05:55:00Z"),ZoneOffset.UTC);
        var current=new UnifiedTimetableService(db,personal,teaching,1,atFive).week(4,"TEACHER",monday,null);
        assertEquals("当前任课",current.attention().name());assertEquals(3,current.summary().attendance().unknown());
    }
    @Test void sameClassLabelInDifferentCollegesDoesNotBecomeAFalseLeadershipConflict() {
        String sameLabel=UUID.randomUUID().toString();
        teaching.createClass(1,new TeachingService.ClassInput(sameLabel,"合成学院乙","合成班A",List.of(new TeachingService.Member("demo-other-a","另一学院合成学生",null))));
        teaching.grant(1,new TeachingService.GrantInput(6L,"SECRETARY","合成学院乙"),false);
        course(classA,"学院甲课程","14:00","15:35");course(sameLabel,"学院乙课程","14:00","15:35");
        var colleges=unified.week(6,"SECRETARY",monday,null);
        assertEquals(2,colleges.entries().size());assertEquals(0,colleges.summary().conflicts());assertFalse(colleges.gridSafe());
        course(classA,"学院甲实际重叠","14:00","14:45");
        var overlap=unified.week(6,"SECRETARY",monday,null);
        assertEquals(2,overlap.summary().conflicts());assertFalse(overlap.entries().stream().filter(e->e.name().equals("学院乙课程")).findFirst().orElseThrow().conflict());
    }
    @Test void scopeBootstrapUsesActualBindingsAndNeverReadsPersonalCoursesLessonsOrStatistics() {
        course(classA,"课程A","08:30","10:05");course(classB,"课程B","14:00","15:35");course(classC,"课程C","16:40","17:25");
        save(5,List.of(period("不会读出的私有课程",1,2,List.of(1))));
        var personalSpy=org.mockito.Mockito.spy(personal);var teachingSpy=org.mockito.Mockito.spy(teaching);
        var metadata=new UnifiedTimetableService(db,personalSpy,teachingSpy,1,clock);
        var student=metadata.scopes(2,null);assertEquals("STUDENT",student.view());assertTrue(student.viewHasTeaching());assertEquals(List.of(classA),student.classes().stream().map(TeachingService.ClassOption::id).toList());
        var teacher=metadata.scopes(4,null);assertEquals("TEACHER",teacher.view());assertEquals(3,teacher.classes().size());
        var counselor=metadata.scopes(5,null);assertEquals("COUNSELOR",counselor.view());assertEquals(List.of(classA),counselor.classes().stream().map(TeachingService.ClassOption::id).toList());
        var secretary=metadata.scopes(6,null);assertEquals("SECRETARY",secretary.view());assertEquals(2,secretary.classes().size());
        var admin=metadata.scopes(1,null);assertEquals(List.of("STUDENT"),admin.views());assertFalse(admin.viewHasTeaching());assertTrue(admin.classes().isEmpty());
        fail(403,()->metadata.scopes(1,"SECRETARY"));fail(403,()->metadata.scopes(2,"TEACHER"));fail(403,()->metadata.scopes(8,"SECRETARY"));
        org.mockito.Mockito.verify(personalSpy,org.mockito.Mockito.never()).get(org.mockito.ArgumentMatchers.anyLong());
        org.mockito.Mockito.verify(teachingSpy,org.mockito.Mockito.never()).lessons(org.mockito.ArgumentMatchers.anyLong(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.nullable(String.class));
        org.mockito.Mockito.verify(teachingSpy,org.mockito.Mockito.never()).notices(org.mockito.ArgumentMatchers.anyLong());
        org.mockito.Mockito.verify(teachingSpy,org.mockito.Mockito.never()).summarize(org.mockito.ArgumentMatchers.anyLong(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyList());
    }
    @Test void largeWeekCanBootstrapAuthorizedClassesAndReadOneWithoutTruncatingAllScopeData() {
        course(classA,"可按班查看的课程","08:30","10:05");String courseId=course(classB,"大范围合成课程","08:30","10:05");
        // Only the temporary H2 fixture is expanded to exercise the response cap, not a load benchmark.
        Instant base=wednesday.atTime(8,30).atZone(TeachingService.ZONE).toInstant();
        for(int i=1;i<=499;i++) db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID().toString(),1,courseId,classB,java.sql.Timestamp.from(base.plusSeconds(i*60L)),java.sql.Timestamp.from(base.plusSeconds(i*60L+2700)));
        fail(400,()->unified.week(6,"SECRETARY",monday,null));
        int before=db.queryForObject("SELECT COUNT(*) FROM teaching_lessons",Integer.class);
        var scopes=unified.scopes(6,"SECRETARY");assertEquals(2,scopes.classes().size());assertTrue(scopes.classes().stream().anyMatch(c->c.id().equals(classA)));
        var selected=unified.week(6,"SECRETARY",monday,classA);assertEquals(1,selected.entries().size());assertEquals(2,selected.summary().attendance().unknown());
        assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM teaching_lessons",Integer.class));
        fail(404,()->unified.week(6,"SECRETARY",monday,classC));fail(400,()->unified.week(6,"SECRETARY",monday,null));
    }
    @Test void disabledTeachingBootstrapIsPrivateOnlyAndCannotQueryMissingTeachingTables() {
        var disabled=new TeachingService(new JdbcTemplate(),new ObjectMapper(),false,clock);
        var metadata=new UnifiedTimetableService(db,org.mockito.Mockito.mock(CourseScheduleService.class),disabled,1,clock);
        var scopes=metadata.scopes(2,null);assertEquals(1,scopes.version());assertEquals("STUDENT",scopes.view());assertEquals(List.of("STUDENT"),scopes.views());assertTrue(scopes.classes().isEmpty());assertFalse(scopes.teachingEnabled());assertFalse(scopes.viewHasTeaching());
        fail(403,()->metadata.scopes(2,"TEACHER"));
    }
    @Test void metadataAndPrivateOnlyWeekRejectUnavailableOrImplicitZeroSchool() {
        var disabled=new TeachingService(db,new ObjectMapper(),false,clock);var metadata=new UnifiedTimetableService(db,personal,disabled,1,clock);
        for(Long school:new Long[]{null,0L,-1L}) {db.update("UPDATE users SET school_id=? WHERE id=2",school);fail(403,()->metadata.scopes(2,null));fail(403,()->metadata.week(2,null,monday,null));}
        db.update("UPDATE users SET school_id=1,status=0 WHERE id=2");fail(403,()->metadata.scopes(2,null));fail(403,()->metadata.scopes(999,null));
    }
    @Test void revokedScopeIsNotReturnedFromBootstrapCache() {
        assertEquals(1,unified.scopes(5,"COUNSELOR").classes().size());
        teaching.grant(1,new TeachingService.GrantInput(5L,"COUNSELOR",classA),true);
        fail(403,()->unified.scopes(5,"COUNSELOR"));var fallback=unified.scopes(5,null);assertEquals("STUDENT",fallback.view());assertFalse(fallback.viewHasTeaching());assertTrue(fallback.classes().isEmpty());
    }
    @Test void wholeWeekGridMustNotOmitAnActiveUnknownPeriodCourse() {
        save(2,List.of(period("白天课程",1,2,List.of(1)),period("未配置晚课",9,10,List.of(1))));
        var before=personal.get(2L).schedule();var week=unified.week(2,"STUDENT",monday,null);
        assertEquals(2,week.entries().size());assertFalse(week.gridSafe());assertEquals(before,personal.get(2L).schedule());
        assertTrue(unified.day(2,wednesday).answer().contains("未配置晚课"));
    }
    @Test void wholeWeekGridMustNotOmitExplicitTimesOutsideTheConfiguredSlots() {
        save(2,List.of(period("有节次的课程",1,2,List.of(1)),new CourseScheduleService.Course("特殊钟点课程",3,"10:10","10:15",List.of(1),"合成教室",null,null)));
        var week=unified.week(2,"STUDENT",monday,null);assertEquals(2,week.entries().size());assertEquals(0,week.summary().conflicts());assertFalse(week.gridSafe());
        var special=week.entries().stream().filter(e->e.name().equals("特殊钟点课程")).findFirst().orElseThrow();assertEquals("10:10",special.startTime());assertNull(special.startPeriod());
    }
    @Test void unrenderableCanceledCourseIsRetainedButDoesNotBlockCompleteActiveGrid() {
        course(classA,"正常节次课程","08:30","09:15");course(classA,"特殊钟点课程","10:10","10:15");
        assertFalse(unified.week(2,"STUDENT",monday,null).gridSafe());
        String id=teaching.lessons(4,"TEACHER",wednesday,wednesday).stream().filter(l->l.course().equals("特殊钟点课程")).findFirst().orElseThrow().id();teaching.cancel(1,id,0);
        var after=unified.week(2,"STUDENT",monday,null);assertEquals(2,after.entries().size());assertEquals(1,after.summary().plannedClasses());assertTrue(after.gridSafe());
        assertTrue(after.entries().stream().filter(e->e.lessonId().equals(id)).findFirst().orElseThrow().cancelled());
    }
    @Test void ambiguousMatchingTeachingCoursesAcrossClassesNeverConsumeOnePersonalOrigin() {
        course(classA,"同名同地点课程","08:30","10:05");course(classB,"同名同地点课程","08:30","10:05");save(4,List.of(period("同名同地点课程",1,2,List.of(1))));
        var before=personal.get(4L).schedule();var week=unified.week(4,"TEACHER",monday,null);
        assertEquals(3,week.entries().size());assertEquals(0,week.summary().mergedDuplicates());assertEquals(1,week.entries().stream().filter(e->e.sources().equals(List.of("PERSONAL"))).count());assertEquals(2,week.entries().stream().filter(e->e.sources().equals(List.of("TEACHING"))).count());
        assertEquals(before,personal.get(4L).schedule());assertEquals(3,week.summary().conflicts());assertFalse(week.gridSafe());
    }
    @Test void classPaginationCrossesOldFiveHundredCapAndUsesStableAuthorizedOrder() {
        Set<String> inserted=new HashSet<>();
        for(int i=0;i<501;i++) {
            String id=UUID.randomUUID().toString();inserted.add(id);
            db.update("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",id,1,"合成学院甲",String.format("分页合成班%04d",i),id);
        }
        Set<String> collected=new HashSet<>();
        for(int page=0;page<11;page++) {
            var result=unified.scopePage(6,"SECRETARY",page,50,"");
            assertEquals(503,result.total());assertEquals(11,result.totalPages());assertEquals(page,result.page());
            for(var item:result.scopes().classes()) assertTrue(collected.add(item.id()),"Stable pages must not repeat IDs");
        }
        assertEquals(503,collected.size());assertTrue(collected.containsAll(inserted));assertFalse(collected.contains(classC));
        fail(400,()->unified.scopes(6,"SECRETARY")); // Legacy cannot silently pretend the first page is the full list.
        var selected=unified.page(6,"SECRETARY",monday,inserted.iterator().next(),0,50);
        assertEquals(0,selected.total());assertEquals(0,selected.week().summary().plannedClasses());
        fail(404,()->unified.page(6,"SECRETARY",monday,classC,0,50));
        fail(400,()->unified.scopePage(6,"SECRETARY",11,50,""));
    }
    @Test void classSearchTreatsWildcardAsTextAndNeverRevealsForeignCollege() {
        String literal=UUID.randomUUID().toString();
        db.update("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",literal,1,"合成学院甲","合成%_!班",literal);
        assertEquals(List.of(literal),unified.scopePage(6,"SECRETARY",0,50,"%_!").scopes().classes().stream().map(TeachingService.ClassOption::id).toList());
        assertEquals(0,unified.scopePage(6,"SECRETARY",0,50,"合成学院乙").total());
        fail(403,()->unified.scopePage(2,"SECRETARY",0,50,""));fail(400,()->unified.scopePage(6,"SECRETARY",0,101,""));
    }
    @Test void lessonPagesDoNotTruncateGlobalStatisticsOrCountRepeatedAbsentPeopleTwice() {
        course(classA,"单班课程","08:30","10:05");String courseId=course(classB,"大量课程","08:30","10:05");
        String student=db.queryForObject("SELECT id FROM teaching_students WHERE class_id=?",String.class,classB);
        Instant base=wednesday.atTime(8,30).atZone(TeachingService.ZONE).toInstant();
        for(int i=1;i<=520;i++) {
            String id=UUID.randomUUID().toString();
            db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at,cancelled) VALUES(?,?,?,?,?,?,?)",id,1,courseId,classB,java.sql.Timestamp.from(base.plusSeconds(i*60L)),java.sql.Timestamp.from(base.plusSeconds(i*60L+2700)),i==520);
            db.update("INSERT INTO teaching_attendance VALUES(?,?,?,?,?)",id,student,"demo-7","合成学生丙",i<=2?"ABSENT":"UNKNOWN");
        }
        save(6,List.of(period("书记本人私人课程不得混入",1,2,List.of(1))));
        Set<String> all=new HashSet<>();
        for(int page=0;page<11;page++) {
            var result=unified.page(6,"SECRETARY",monday,null,page,50);
            assertEquals(522,result.total());assertEquals(11,result.totalPages());assertEquals(521,result.week().summary().plannedClasses());
            assertEquals(521,result.week().summary().todayClasses());assertEquals(2,result.week().summary().attendance().absent());
            assertEquals(1,result.week().summary().absentStudents());assertEquals(520,result.week().summary().attendance().unknown());
            assertEquals(520,result.week().summary().conflicts());assertFalse(result.week().gridSafe());
            for(var e:result.week().entries()) {assertTrue(all.add(e.id()));assertFalse(e.sources().contains("PERSONAL"));assertFalse(e.canMark());}
        }
        assertEquals(522,all.size());
        var selected=unified.page(6,"SECRETARY",monday,classA,0,50);assertEquals(1,selected.total());assertEquals(0,selected.week().summary().attendance().absent());
        fail(400,()->unified.page(6,"SECRETARY",monday,null,11,50));fail(400,()->unified.page(6,"SECRETARY",monday,null,-1,50));
    }
    @Test void privatePaginationRetainsExactMergingAndGlobalSummaryWithoutInventingWholeWeekGrid() {
        course(classA,"教学课程","14:00","15:35");save(2,List.of(period("教学课程",5,6,List.of(1)),period("私人实验",3,4,List.of(1))));
        var first=unified.page(2,"STUDENT",monday,null,0,1);
        var second=unified.page(2,"STUDENT",monday,null,1,1);
        assertEquals(2,first.total());assertEquals(1,first.week().summary().mergedDuplicates());assertEquals(first.week().summary(),second.week().summary());
        assertEquals(1,first.week().entries().size());assertEquals(1,second.week().entries().size());assertFalse(first.week().gridSafe());
        assertNotEquals(first.week().entries().get(0).id(),second.week().entries().get(0).id());assertEquals(2,personal.get(2L).schedule().courses().size());
        for(var result:List.of(first,second)) if(result.week().next()!=null) assertTrue(result.week().entries().contains(result.week().next()));
    }
}
