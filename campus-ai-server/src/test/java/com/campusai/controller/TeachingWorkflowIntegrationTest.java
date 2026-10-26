package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.teaching.TeachingService;
import com.campusai.timetable.*;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.*;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.*;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Temporary H2 + real controllers/services/transaction proxies and signed test identities.
 * Session persistence is mocked; no configured secret, real account or MySQL is used. */
@Timeout(15)
class TeachingWorkflowIntegrationTest {
    @Configuration @EnableTransactionManagement(proxyTargetClass=true) static class TxConfiguration {}
    static class MutableClock extends Clock {
        Instant value=Instant.parse("2026-10-14T04:59:59Z");
        public Instant instant(){return value;} public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return Clock.fixed(value,zone);}
    }
    AnnotationConfigApplicationContext context; JdbcTemplate db; TeachingService teaching;
    CourseScheduleService personal; MockMvc mvc; ObjectMapper json; MutableClock clock;
    AuthSessionService sessions; final Map<Long,String> tokens=new HashMap<>();
    final String classA=UUID.randomUUID().toString(),classB=UUID.randomUUID().toString(),classC=UUID.randomUUID().toString();
    String lessonA;
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:workflow"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds); json=new ObjectMapper(); clock=new MutableClock();
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(16),status INT,nickname VARCHAR(100),username VARCHAR(100))");
        for(int i=1;i<=9;i++) db.update("INSERT INTO users VALUES(?,?,?,?,?,?)",i,i==9?2:1,i==1?"ADMIN":"STUDENT",1,"合成用户"+i,"workflow"+i);
        db.execute("CREATE TABLE student_course_schedule_versions(user_id BIGINT PRIMARY KEY,revision INT NOT NULL)");
        db.execute("CREATE TABLE student_timetables(user_id BIGINT PRIMARY KEY)");
        db.execute("CREATE TABLE student_course_schedules(user_id BIGINT PRIMARY KEY,revision INT,semester VARCHAR(100),first_monday DATE,remind_days INT,courses_json CLOB,imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        for(String sql:Files.readString(Path.of("../deploy/migrations/2026-10-14-teaching-attendance.sql")).split(";")) if(!sql.isBlank()) db.execute(sql);
        context=new AnnotationConfigApplicationContext(); context.register(TxConfiguration.class);
        context.registerBean(PlatformTransactionManager.class,()->new DataSourceTransactionManager(ds));
        context.registerBean(TeachingService.class,()->new TeachingService(db,json,true,clock));
        context.registerBean(CourseScheduleService.class,()->new CourseScheduleService(db,json));
        context.registerBean(UnifiedTimetableService.class,()->new UnifiedTimetableService(db,context.getBean(CourseScheduleService.class),context.getBean(TeachingService.class),1,clock));
        context.refresh(); teaching=context.getBean(TeachingService.class); personal=context.getBean(CourseScheduleService.class);
        assertTrue(AopUtils.isAopProxy(teaching)); assertTrue(AopUtils.isAopProxy(personal));
        byte[] key=new byte[64]; new SecureRandom().nextBytes(key);
        var jwt=new JwtService(Base64.getEncoder().encodeToString(key),60000); sessions=mock(AuthSessionService.class);
        for(long i=1;i<=9;i++) {
            User u=new User();u.setId(i);u.setRole(i==1?"ADMIN":"STUDENT");u.setUsername("workflow"+i);
            tokens.put(i,jwt.generateToken(u,"synthetic-"+i));when(sessions.active("synthetic-"+i,i,u.getRole())).thenReturn(true);
        }
        var unified=context.getBean(UnifiedTimetableService.class);assertTrue(AopUtils.isAopProxy(unified));
        mvc=MockMvcBuilders.standaloneSetup(new TeachingController(teaching,json),new AdminTeachingController(teaching,json),new UnifiedTimetableController(unified),new CourseScheduleController(personal,json))
                .setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        createClass(classA,"合成学院甲","合成班A",List.of(new TeachingService.Member("mock-2","合成学生甲",2L),new TeachingService.Member("mock-3","合成学生乙",3L)));
        createClass(classB,"合成学院甲","合成班B",List.of(new TeachingService.Member("mock-7","合成学生丙",7L)));
        createClass(classC,"合成学院乙","合成班C",List.of(new TeachingService.Member("mock-8","合成学生丁",8L)));
        createCourse(classA,4,"合成网络课","14:00","15:35");createCourse(classB,4,"合成处理器课","08:30","10:05");createCourse(classC,7,"合成设计课","16:40","17:25");
        send(1,post("/api/admin/teaching/grants"),new TeachingService.GrantInput(5L,"COUNSELOR",classA),200);
        send(1,post("/api/admin/teaching/grants"),new TeachingService.GrantInput(6L,"SECRETARY","合成学院甲"),200);
        lessonA=read(4,get("/api/teaching/lessons").param("view","TEACHER").param("from","2026-10-14").param("to","2026-10-14"),200).get(1).get("id").asString();
        send(2,put("/api/timetable/courses"),new CourseScheduleService.Input(0,"合成学期",LocalDate.of(2026,10,12),7,List.of(new CourseScheduleService.Course("合成网络课",3,null,null,List.of(1),"合成教室",5,6),new CourseScheduleService.Course("合成私有实验",3,null,null,List.of(1),"合成实验室",3,4))),200);
    }
    @AfterEach void close(){if(context!=null)context.close();}
    MockHttpServletRequestBuilder authenticated(long actor,MockHttpServletRequestBuilder request){return request.header("Authorization","Bearer "+tokens.get(actor));}
    JsonNode read(long actor,MockHttpServletRequestBuilder request,int status) throws Exception {
        var result=mvc.perform(authenticated(actor,request)).andExpect(status().is(status)).andExpect(header().string("Cache-Control","no-store")).andReturn();
        String body=result.getResponse().getContentAsString();return body.isBlank()?null:json.readTree(body);
    }
    JsonNode send(long actor,MockHttpServletRequestBuilder request,Object data,int status) throws Exception {return read(actor,request.contentType("application/json").content(json.writeValueAsString(data)),status);}
    void createClass(String id,String college,String name,List<TeachingService.Member> members) throws Exception {send(1,post("/api/admin/teaching/classes"),new TeachingService.ClassInput(id,college,name,members),200);}
    void createCourse(String classId,long teacher,String name,String start,String end) throws Exception {send(1,post("/api/admin/teaching/courses"),new TeachingService.CourseInput(UUID.randomUUID().toString(),classId,teacher,name,"合成学期",LocalDate.of(2026,10,12),3,start,end,List.of(1),"合成教室"),200);}
    JsonNode week(long actor,String view) throws Exception {return read(actor,get("/api/timetable/unified").param("monday","2026-10-12").param("view",view),200);}
    JsonNode detail(long actor,String view) throws Exception {return read(actor,get("/api/teaching/lessons/"+lessonA).param("view",view),200);}
    List<TeachingService.Mark> marks(JsonNode detail,String status) {List<TeachingService.Mark> out=new ArrayList<>();for(JsonNode e:detail.get("entries"))out.add(new TeachingService.Mark(e.get("studentId").asString(),status));return out;}
    @Test void fourActorsCompleteReminderRosterManualSaveCorrectionAndScopedReadOnlyFlow() throws Exception {
        assertEquals(0,teaching.dispatchDueNotices()); clock.value=Instant.parse("2026-10-14T05:00:00Z");
        assertEquals(2,teaching.dispatchDueNotices());assertEquals(0,teaching.dispatchDueNotices());
        var studentNotice=read(2,get("/api/teaching/notices"),200).get(0);assertEquals("STUDENT_CLASS",studentNotice.get("kind").asString());
        assertEquals(0,read(4,get("/api/teaching/notices"),200).size());read(4,post("/api/teaching/notices/"+studentNotice.get("id").asString()+"/read"),404);
        read(2,post("/api/teaching/notices/"+studentNotice.get("id").asString()+"/read"),200);assertFalse(read(2,get("/api/teaching/notices"),200).get(0).get("readAt").isNull());
        var personalBefore=personal.get(2L).schedule();var student=week(2,"STUDENT");assertEquals(2,student.get("entries").size());assertEquals(1,student.get("summary").get("mergedDuplicates").asInt());assertEquals(personalBefore,personal.get(2L).schedule());
        assertEquals(2,week(4,"TEACHER").get("entries").size());assertEquals(1,week(5,"COUNSELOR").get("entries").size());assertEquals(2,week(6,"SECRETARY").get("entries").size());
        clock.value=Instant.parse("2026-10-14T05:54:59Z");assertEquals(0,teaching.dispatchDueNotices());assertFalse(detail(4,"TEACHER").get("canMark").asBoolean());
        clock.value=Instant.parse("2026-10-14T05:55:00Z");assertEquals(1,teaching.dispatchDueNotices());assertEquals(0,teaching.dispatchDueNotices());
        var teacherNotice=read(4,get("/api/teaching/notices"),200).get(0);assertEquals(lessonA,teacherNotice.get("lessonId").asString());read(4,post("/api/teaching/notices/"+teacherNotice.get("id").asString()+"/read"),200);
        var roster=detail(4,"TEACHER");assertTrue(roster.get("canMark").asBoolean());assertFalse(roster.get("canRecordAbsence").asBoolean());
        String path="/api/teaching/lessons/"+lessonA+"/attendance";
        send(4,put(path),new TeachingService.RollCall(0,marks(roster,"ABSENT"),"",false),400);
        send(4,put(path),new TeachingService.RollCall(0,marks(roster,"ON_TIME"),"",true),200);
        clock.value=Instant.parse("2026-10-14T06:02:00Z");var correction=new TeachingService.RollCall(1,List.of(marks(roster,"LATE").get(0)),"迟到后与本人核对",false);
        send(4,put(path),correction,200);send(4,put(path),correction,409);
        assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,lessonA));
        var own=detail(2,"STUDENT");assertEquals(1,own.get("entries").size());assertEquals("LATE",own.get("entries").get(0).get("status").asString());assertFalse(own.get("canMark").asBoolean());
        for(long actor:new long[]{5,6}){assertEquals(1,week(actor,actor==5?"COUNSELOR":"SECRETARY").get("summary").get("attendance").get("late").asInt());send(actor,put(path),correction,403);}
        var answer=read(2,get("/api/timetable/unified/day").param("date","2026-10-14"),200).get("answer").asString();assertTrue(answer.contains("合成私有实验"));assertTrue(answer.contains("合成网络课"));assertFalse(answer.contains("合成处理器课"));assertTrue(answer.contains("不推断考勤"));
    }
    @Test void actualTransactionRollsBackEarlierMarksAndAuditWhenLaterRowFails() throws Exception {
        clock.value=Instant.parse("2026-10-14T06:02:00Z");var detail=detail(4,"TEACHER");
        db.execute("ALTER TABLE teaching_attendance_audit ADD CONSTRAINT synthetic_audit_failure CHECK(new_status<>'LATE')");
        var rows=new ArrayList<>(marks(detail,"ON_TIME"));rows.set(1,new TeachingService.Mark(rows.get(1).studentId(),"LATE"));
        send(4,put("/api/teaching/lessons/"+lessonA+"/attendance"),new TeachingService.RollCall(0,rows,"",false),500);
        assertEquals(2,detail(4,"TEACHER").get("lesson").get("counts").get("unknown").asInt());assertEquals(0,detail(4,"TEACHER").get("lesson").get("revision").asInt());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
    }
    @Test void revokedScopeSessionAndCanceledLessonsWithdrawReadsAndNoticesImmediately() throws Exception {
        clock.value=Instant.parse("2026-10-14T05:55:00Z");teaching.dispatchDueNotices();assertEquals(1,read(2,get("/api/teaching/notices"),200).size());
        send(1,post("/api/admin/teaching/grants/revoke"),new TeachingService.GrantInput(5L,"COUNSELOR",classA),200);
        read(5,get("/api/timetable/unified").param("view","COUNSELOR"),403);read(5,get("/api/teaching/lessons/"+lessonA).param("view","COUNSELOR"),403);
        read(1,post("/api/admin/teaching/lessons/"+lessonA+"/cancel").param("revision","0"),200);
        assertEquals(0,read(2,get("/api/teaching/notices"),200).size());assertTrue(week(2,"STUDENT").get("entries").get(1).get("cancelled").asBoolean());assertEquals(2,personal.get(2L).schedule().courses().size());
        send(4,put("/api/teaching/lessons/"+lessonA+"/attendance"),new TeachingService.RollCall(1,List.of(),"",false),409);
        when(sessions.active("synthetic-2",2L,"STUDENT")).thenReturn(false);read(2,get("/api/timetable/unified"),401);
    }
    @Test void forgedRoleAccountCrossClassAndAnonymousCannotObtainPrivateData() throws Exception {
        mvc.perform(get("/api/timetable/unified")).andExpect(status().isUnauthorized());
        read(2,get("/api/timetable/unified").param("view","SECRETARY").param("userId","6"),403);
        read(5,get("/api/timetable/unified").param("view","COUNSELOR").param("classId",classB),404);
        read(6,get("/api/timetable/unified").param("view","SECRETARY").param("classId",classC),404);
        read(8,get("/api/teaching/lessons/"+lessonA).param("view","STUDENT"),404);read(9,get("/api/teaching/lessons/"+lessonA).param("view","TEACHER"),403);
        send(2,post("/api/admin/teaching/grants"),new TeachingService.GrantInput(2L,"SECRETARY","合成学院甲"),403);
        var own=read(2,get("/api/timetable/unified").param("view","STUDENT").param("userId","8"),200);assertTrue(own.toString().contains("合成网络课"));assertFalse(own.toString().contains("合成设计课"));
    }
    @Test void semanticQueryUsesSignedOwnerClockAndCompletePrivateScopeNotCallerRoleOrUserId() throws Exception {
        String path="/api/timetable/unified/query";
        mvc.perform(get(path).param("from","2026-10-12").param("to","2026-10-18")).andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control","no-store"));
        var own=read(2,get(path).param("from","2026-10-12").param("to","2026-10-18").param("period","AM").param("userId","6").param("view","SECRETARY"),200);
        assertEquals(1,own.get("count").asInt());assertTrue(own.get("answer").asString().contains("合成私有实验"));assertFalse(own.get("answer").asString().contains("合成处理器课"));
        var next=read(2,get(path).param("from","2026-10-14").param("to","2026-10-27").param("selection","NEXT"),200);
        assertEquals(1,next.get("count").asInt());String anchor=next.get("focus").asString();assertTrue(anchor.startsWith("2026-10-14T14:00"));
        clock.value=Instant.parse("2026-10-14T10:00:00Z");
        var pinned=read(2,get(path).param("from","2026-10-14").param("to","2026-10-27").param("selection","AT").param("anchor",anchor).param("detail","TEACHER"),200);
        assertEquals(1,pinned.get("count").asInt());assertTrue(pinned.get("answer").asString().contains("合成用户4"));
        assertEquals(0,read(5,get(path).param("from","2026-10-12").param("to","2026-10-18"),200).get("count").asInt());
        read(2,get(path).param("from","2026-10-12").param("to","2026-11-18"),400);
        read(2,get(path).param("from","2026-10-12").param("to","2026-10-18").param("selection","AT"),400);
        when(sessions.active("synthetic-2",2L,"STUDENT")).thenReturn(false);
        read(2,get(path).param("from","2026-10-12").param("to","2026-10-18"),401);
    }
    @Test void explicitTeachingAndLearningUseTheSignedDualOwnersDifferentAssignments() throws Exception {
        String path="/api/timetable/unified/query";
        send(7,put("/api/timetable/courses"),new CourseScheduleService.Input(0,"合成学期",LocalDate.of(2026,10,12),7,
                List.of(new CourseScheduleService.Course("合成本人进修",3,null,null,List.of(1),"合成自习室",3,4))),200);
        var before=personal.get(7L).schedule();
        var teach=read(7,get(path).param("from","2026-10-14").param("to","2026-10-14")
                .param("perspective","TEACHER").param("userId","4").param("view","SECRETARY"),200);
        assertEquals(1,teach.get("count").asInt());
        assertTrue(teach.get("answer").asString().contains("合成设计课"));
        assertFalse(teach.toString().contains("合成处理器课"));assertFalse(teach.toString().contains("合成本人进修"));
        assertEquals("TEACHER",teach.get("queryScope").get("requested").asString());
        assertEquals("TEACHER",teach.get("queryScope").get("resolved").asString());
        var study=read(7,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","STUDENT"),200);
        assertEquals(2,study.get("count").asInt());assertTrue(study.toString().contains("合成处理器课"));assertTrue(study.toString().contains("合成本人进修"));
        assertFalse(study.toString().contains("合成设计课"));
        assertEquals(2,read(7,get(path).param("from","2026-10-14").param("to","2026-10-14"),200).get("count").asInt());
        assertEquals(before,personal.get(7L).schedule());
        var choices=read(7,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","TEACHER").param("course","不存在的合成课"),200);
        assertEquals(1,choices.get("refinement").get("courseChoices").size());
        assertEquals("合成设计课",choices.get("refinement").get("courseChoices").get(0).asString());
        // A corrupt private import cannot contaminate or block explicit authorized teaching reads.
        db.update("UPDATE student_course_schedules SET courses_json='not-json' WHERE user_id=7");
        assertEquals(1,read(7,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","TEACHER"),200).get("count").asInt());
    }
    @Test void legacySourceStatusUsesSignedOwnerWithoutReadingImageBytesOrCreatingFreeDates() throws Exception {
        String path="/api/timetable/unified/query";
        db.update("INSERT INTO student_timetables(user_id) VALUES(8)");
        var own=read(8,get(path).param("from","2026-10-15").param("to","2026-10-15").param("detail","FREE").param("userId","2"),200);
        assertEquals("UNRESOLVED",own.get("display").get("state").asString());
        assertEquals(0,own.get("display").get("freeDates").size());
        assertTrue(own.get("answer").asString().contains("旧课表图片"));
        var other=read(2,get(path).param("from","2026-10-15").param("to","2026-10-15").param("userId","8"),200);
        assertFalse(other.get("answer").asString().contains("本次未读取图片内容"));
        mvc.perform(get(path).param("from","2026-10-15").param("to","2026-10-15"))
            .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control","no-store"));
        read(8,get(path).param("from","2026-10-15").param("to","2026-10-15").param("perspective","TEACHER"),403);
        when(sessions.active("synthetic-8",8L,"STUDENT")).thenReturn(false);
        read(8,get(path).param("from","2026-10-15").param("to","2026-10-15"),401);
    }
    @Test void explicitTeachingRequiresActualAssignmentAndDoesNotGrantLeaderOrStudentAccess() throws Exception {
        String path="/api/timetable/unified/query";
        for(long actor:List.of(1L,2L,5L,6L,8L,9L))
            read(actor,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","TEACHER"),403);
        for(String invalid:List.of("SECRETARY","ADMIN","teacher",""))
            read(2,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective",invalid),400);
        assertEquals(2,read(4,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","TEACHER"),200).get("count").asInt());
        db.update("UPDATE teaching_courses SET teacher_id=4 WHERE teacher_id=7");
        read(7,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","TEACHER"),403);
        assertEquals(1,read(7,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","STUDENT"),200).get("count").asInt());
        when(sessions.active("synthetic-4",4L,"STUDENT")).thenReturn(false);
        read(4,get(path).param("from","2026-10-14").param("to","2026-10-14").param("perspective","TEACHER"),401);
    }
    @Test void privateCountdownUsesAuthenticatedScopeAndServerClockIgnoringCallerNow() throws Exception {
        clock.value=Instant.parse("2026-10-14T05:00:00Z");
        String path="/api/timetable/unified/query";
        var value=read(2,get(path).param("from","2026-10-14").param("to","2026-10-14")
                .param("selection","NEXT").param("detail","WAIT_START").param("perspective","STUDENT")
                .param("now","2099-01-01T00:00:00Z").param("userId","8"),200);
        assertEquals("2026-10-14T05:00:00Z",value.get("asOf").asString());
        assertTrue(value.get("display").get("summary").asString().contains("1小时"));
        assertEquals(1,value.get("count").asInt());assertFalse(value.toString().contains("合成设计课"));
        var fields=value.get("display").get("entries").get(0);
        assertFalse(fields.has("attendance"));assertFalse(fields.has("counts"));
        read(2,get(path).param("from","2026-10-14").param("to","2026-10-14").param("detail","WAIT_START").param("perspective","TEACHER"),403);
        when(sessions.active("synthetic-2",2L,"STUDENT")).thenReturn(false);
        read(2,get(path).param("from","2026-10-14").param("to","2026-10-14").param("detail","WAIT_START"),401);
    }
    @Test void correctionAuditIsPagedOwnerScopedReadOnlyAndOneYearExpiryNeverDeletesHistory() throws Exception {
        clock.value=Instant.parse("2026-10-14T06:01:00Z");var current=detail(4,"TEACHER");var first=marks(current,"LATE");
        send(4,put("/api/teaching/lessons/"+lessonA+"/attendance"),new TeachingService.RollCall(0,first,"",false),200);
        var corrected=new ArrayList<>(first);corrected.set(0,new TeachingService.Mark(first.get(0).studentId(),"ON_TIME"));
        send(4,put("/api/teaching/lessons/"+lessonA+"/attendance"),new TeachingService.RollCall(1,corrected,"核对后更正",false),200);
        String path="/api/teaching/lessons/"+lessonA+"/audit";
        var teacher=read(4,get(path).param("view","TEACHER").param("size","1"),200);assertEquals(3,teacher.get("total").asInt());assertEquals(3,teacher.get("totalPages").asInt());assertEquals(1,teacher.get("items").size());assertEquals(1,teacher.get("retentionYears").asInt());assertFalse(teacher.get("deletionEnabled").asBoolean());
        assertEquals(2,read(2,get(path).param("view","STUDENT"),200).get("total").asInt());assertEquals(1,read(3,get(path).param("view","STUDENT"),200).get("total").asInt());
        assertEquals(3,read(5,get(path).param("view","COUNSELOR"),200).get("total").asInt());
        read(7,get(path).param("view","TEACHER"),404);read(9,get(path).param("view","SECRETARY"),403);
        mvc.perform(get(path).param("view","TEACHER")).andExpect(status().isUnauthorized());
        db.update("UPDATE teaching_attendance_audit SET recorded_at=? WHERE lesson_id=?",java.sql.Timestamp.from(clock.value.minusSeconds(366*86400L)),lessonA);
        var expired=read(4,get(path).param("view","TEACHER"),200);assertEquals(3,expired.get("expiredWithinScope").asInt());assertTrue(expired.get("items").get(0).get("expired").asBoolean());
        assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,lessonA));
    }
    @Test void projectedPreviousCourseUsesSignedOwnerAndNeverReturnsRosterOrLeaderScope() throws Exception {
        String path="/api/timetable/unified/query";
        var previous=read(2,get(path).param("from","2026-10-01").param("to","2026-10-14")
                .param("selection","PREVIOUS").param("userId","8").param("view","SECRETARY"),200);
        assertEquals(1,previous.get("count").asInt());
        var display=previous.get("display");assertEquals("READY",display.get("state").asString());
        assertEquals(previous.get("count").asInt(),display.get("entries").size());
        var row=display.get("entries").get(0);
        assertEquals("合成私有实验",row.get("name").asString());
        for(String key:List.of("counts","attendance","studentId","className","originIds","userId"))assertFalse(row.has(key),key);
        assertFalse(display.toString().contains("合成设计课"));assertFalse(display.toString().contains("合成处理器课"));
        assertEquals(0,read(5,get(path).param("from","2026-10-01").param("to","2026-10-14").param("selection","PREVIOUS"),200).get("display").get("entries").size());
        when(sessions.active("synthetic-2",2L,"STUDENT")).thenReturn(false);
        read(2,get(path).param("from","2026-10-01").param("to","2026-10-14").param("selection","PREVIOUS"),401);
    }
    @Test void ambiguousCourseChoicesAreReadFromTheSignedOwnersCurrentRangeOnly() throws Exception {
        String path="/api/timetable/unified/query";
        var own=read(2,get(path).param("from","2026-10-14").param("to","2026-10-14")
                .param("course","不匹配的合成课名").param("userId","8").param("view","SECRETARY"),200);
        assertEquals(0,own.get("count").asInt());assertEquals("UNRESOLVED",own.get("display").get("state").asString());
        assertEquals(2,own.get("refinement").get("availableCount").asInt());
        assertTrue(own.get("refinement").get("choicesComplete").asBoolean());
        String choices=own.get("refinement").get("courseChoices").toString();
        assertTrue(choices.contains("合成私有实验"));assertTrue(choices.contains("合成网络课"));
        assertFalse(choices.contains("合成处理器课"));assertFalse(choices.contains("合成设计课"));
        var leader=read(5,get(path).param("from","2026-10-14").param("to","2026-10-14").param("course","不匹配的合成课名"),200);
        assertEquals("EMPTY",leader.get("display").get("state").asString());assertTrue(leader.get("refinement").isNull());
        when(sessions.active("synthetic-2",2L,"STUDENT")).thenReturn(false);
        read(2,get(path).param("from","2026-10-14").param("to","2026-10-14").param("course","不匹配的合成课名"),401);
    }
    @Test void scopeBootstrapControllerUsesSignedSubjectAndReturnsOnlyAuthorizedNavigation() throws Exception {
        String path="/api/timetable/unified/scopes";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        var student=read(2,get(path).param("view","STUDENT").param("userId","6"),200);
        assertEquals(1,student.get("version").asInt());assertEquals("STUDENT",student.get("view").asString());assertEquals(1,student.get("classes").size());assertEquals(classA,student.get("classes").get(0).get("id").asString());
        assertTrue(student.get("viewHasTeaching").asBoolean());assertNull(student.get("entries"));assertNull(student.get("summary"));assertFalse(student.toString().contains("studentNumber"));assertFalse(student.toString().contains("合成私有实验"));
        assertEquals(2,read(4,get(path),200).get("classes").size());assertEquals(1,read(5,get(path).param("view","COUNSELOR"),200).get("classes").size());assertEquals(2,read(6,get(path).param("view","SECRETARY"),200).get("classes").size());
        read(2,get(path).param("view","SECRETARY").param("userId","6"),403);read(9,get(path).param("view","SECRETARY"),403);
        assertFalse(read(1,get(path),200).get("viewHasTeaching").asBoolean());
        send(1,post("/api/admin/teaching/grants/revoke"),new TeachingService.GrantInput(5L,"COUNSELOR",classA),200);read(5,get(path).param("view","COUNSELOR"),403);
    }
    @Test void configurationPageUsesRealAdminAuthorizationAndIndependentCollegeSelection() throws Exception {
        String path="/api/admin/teaching/scopes/page";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        read(2,get(path).param("userId","1"),403);
        var one=read(1,get(path).param("size","1").param("selected",classC),200);
        assertEquals(3,one.get("total").asInt());assertEquals(1,one.get("items").size());assertEquals(classC,one.get("selected").get("value").asString());
        assertEquals(2,read(1,get(path).param("kind","COLLEGE").param("size","1"),200).get("total").asInt());
        read(1,get(path).param("page","3").param("size","1"),400);
        read(1,get(path).param("kind","ADMIN"),400);
        assertFalse(one.toString().contains("studentNumber"));assertFalse(one.toString().contains("userId"));
    }
    @Test void pageControllersRespectSignedIdentityAndKeepScopeStatisticsWhole() throws Exception {
        String scopes="/api/timetable/unified/scopes/page",pages="/api/timetable/unified/page";
        mvc.perform(get(scopes)).andExpect(status().isUnauthorized());mvc.perform(get(pages)).andExpect(status().isUnauthorized());
        var scope=read(6,get(scopes).param("view","SECRETARY").param("size","1"),200);
        assertEquals(2,scope.get("total").asInt());assertEquals(1,scope.get("scopes").get("classes").size());assertNull(scope.get("entries"));assertNull(scope.get("summary"));
        var first=read(6,get(pages).param("view","SECRETARY").param("monday","2026-10-12").param("size","1"),200);
        var second=read(6,get(pages).param("view","SECRETARY").param("monday","2026-10-12").param("size","1").param("page","1"),200);
        assertEquals(2,first.get("total").asInt());assertEquals(first.get("week").get("summary"),second.get("week").get("summary"));
        assertEquals(1,first.get("week").get("entries").size());assertEquals(1,second.get("week").get("entries").size());
        read(2,get(scopes).param("view","SECRETARY").param("userId","6"),403);
        read(6,get(pages).param("view","SECRETARY").param("classId",classC),404);
        read(2,get(pages).param("view","STUDENT").param("classId",classB),404);
        read(6,get(pages).param("view","SECRETARY").param("size","101"),400);
        send(1,post("/api/admin/teaching/grants/revoke"),new TeachingService.GrantInput(6L,"SECRETARY","合成学院甲"),200);
        read(6,get(scopes).param("view","SECRETARY"),403);read(6,get(pages).param("view","SECRETARY"),403);
    }
    private <T> List<T> concurrently(Callable<T> first,Callable<T> second) throws Exception {
        var pool=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
        try {
            var a=pool.submit(()->{start.await(5,TimeUnit.SECONDS);return first.call();});
            var b=pool.submit(()->{start.await(5,TimeUnit.SECONDS);return second.call();});
            return List.of(a.get(5,TimeUnit.SECONDS),b.get(5,TimeUnit.SECONDS));
        } finally {pool.shutdownNow();assertTrue(pool.awaitTermination(3,TimeUnit.SECONDS),"Only test-owned workers must terminate");}
    }
    @Test void competingAttendanceRequestsCommitOneVersionAndNoLosingMarksOrAudits() throws Exception {
        clock.value=Instant.parse("2026-10-14T06:02:00Z");var roster=detail(4,"TEACHER");String path="/api/teaching/lessons/"+lessonA+"/attendance";
        String onTime=json.writeValueAsString(new TeachingService.RollCall(0,marks(roster,"ON_TIME"),"",true));
        String late=json.writeValueAsString(new TeachingService.RollCall(0,marks(roster,"LATE"),"",true));
        var responses=concurrently(
                ()->mvc.perform(authenticated(4,put(path).contentType("application/json").content(onTime))).andReturn(),
                ()->mvc.perform(authenticated(4,put(path).contentType("application/json").content(late))).andReturn());
        assertEquals(List.of(200,409),responses.stream().map(r->r.getResponse().getStatus()).sorted().toList());
        assertTrue(responses.stream().allMatch(r->"no-store".equals(r.getResponse().getHeader("Cache-Control"))));
        var winner=json.readTree(responses.stream().filter(r->r.getResponse().getStatus()==200).findFirst().orElseThrow().getResponse().getContentAsString());
        String status=winner.get("entries").get(0).get("status").asString();assertTrue(Set.of("ON_TIME","LATE").contains(status));
        var persisted=detail(4,"TEACHER");assertEquals(1,persisted.get("lesson").get("revision").asInt());assertTrue(persisted.get("lesson").get("finalized").asBoolean());
        for(JsonNode e:persisted.get("entries"))assertEquals(status,e.get("status").asString());
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,lessonA));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=? AND new_status<>?",Integer.class,lessonA,status));
        assertEquals(status,detail(2,"STUDENT").get("entries").get(0).get("status").asString());
    }
    @Test void competingReminderTransactionsCreateEachAuthorizedRecipientOnlyOnce() throws Exception {
        clock.value=Instant.parse("2026-10-14T05:55:00Z");
        var additions=concurrently(teaching::dispatchDueNotices,teaching::dispatchDueNotices);
        assertEquals(3,additions.stream().mapToInt(Integer::intValue).sum());
        assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM (SELECT user_id,lesson_id,kind FROM teaching_notices GROUP BY user_id,lesson_id,kind HAVING COUNT(*)>1) duplicates",Integer.class));
        assertEquals(1,read(2,get("/api/teaching/notices"),200).size());assertEquals(1,read(3,get("/api/teaching/notices"),200).size());
        assertEquals("TEACHER_ROSTER",read(4,get("/api/teaching/notices"),200).get(0).get("kind").asString());assertEquals(0,read(5,get("/api/teaching/notices"),200).size());
        assertEquals(0,teaching.dispatchDueNotices());
    }
    @Test void unifiedReadKeepsLessonCountsAndDistinctPeopleInOneSnapshotDuringCommittedCorrection() throws Exception {
        clock.value=Instant.parse("2026-10-14T05:00:00Z");LocalDate date=LocalDate.of(2026,10,14);
        String morning=teaching.lessons(4,"TEACHER",date,date).stream().filter(l->l.course().equals("合成处理器课")).findFirst().orElseThrow().id();
        String student=teaching.detail(4,"TEACHER",morning).entries().get(0).studentId();
        var pool=Executors.newSingleThreadExecutor();var once=new java.util.concurrent.atomic.AtomicBoolean();
        var insideReadOnly=new java.util.concurrent.atomic.AtomicBoolean();
        var insidePagedReadOnly=new java.util.concurrent.atomic.AtomicBoolean();
        TeachingService hooked=new TeachingService(db,json,true,clock) {
            @Override public LessonRelation ownLessonRelation(long user,String view,LocalDate from,LocalDate to,String classId) {
                insidePagedReadOnly.set(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                        && org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                        && Objects.equals(org.springframework.transaction.support.TransactionSynchronizationManager.getCurrentTransactionIsolationLevel(),java.sql.Connection.TRANSACTION_REPEATABLE_READ));
                return super.ownLessonRelation(user,view,from,to,classId);
            }
            @Override public ScopeSummary summarize(long user,String view,List<Lesson> lessons) {
                insideReadOnly.set(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                        && org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                        && Objects.equals(org.springframework.transaction.support.TransactionSynchronizationManager.getCurrentTransactionIsolationLevel(),java.sql.Connection.TRANSACTION_REPEATABLE_READ));
                if(once.compareAndSet(false,true)) {
                    try {pool.submit(()->teaching.mark(4,morning,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(student,"ABSENT")),"",false))).get(5,TimeUnit.SECONDS);}
                    catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("Synthetic writer interrupted",interrupted);}
                    catch(Exception failure){throw new IllegalStateException("Synthetic committed correction failed",failure);}
                }
                return super.summarize(user,view,lessons);
            }
        };
        context.registerBean("syntheticSnapshotReader",UnifiedTimetableService.class,()->new UnifiedTimetableService(db,personal,hooked,1,clock));
        try {
            var reader=context.getBean("syntheticSnapshotReader",UnifiedTimetableService.class);
            var first=reader.week(6,"SECRETARY",LocalDate.of(2026,10,12),null);
            assertEquals(first.summary().attendance().absent(),first.summary().absentStudents(),"A response must not combine old attendance counts with newly committed people counts");
            assertEquals(0,first.summary().attendance().absent());assertEquals(3,first.summary().attendance().unknown());
            assertTrue(AopUtils.isAopProxy(reader));assertTrue(insideReadOnly.get());
            assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,morning));
            var next=reader.week(6,"SECRETARY",LocalDate.of(2026,10,12),null);assertEquals(1,next.summary().attendance().absent());assertEquals(1,next.summary().absentStudents());
            insidePagedReadOnly.set(false);var day=reader.day(2,date);assertTrue(insidePagedReadOnly.get(),"The day entry point must enclose every internal page in the same read-only snapshot");
            assertTrue(day.answer().contains("合成私有实验"));assertTrue(day.answer().contains("合成网络课"));assertFalse(day.answer().contains("合成处理器课"));
            insidePagedReadOnly.set(false);reader.query(2,date,date,"ALL","ALL","SUMMARY",null);assertTrue(insidePagedReadOnly.get(),"Private query page traversal must retain the outer read-only snapshot");
        } finally {pool.shutdownNow();assertTrue(pool.awaitTermination(3,TimeUnit.SECONDS));}
    }
}
