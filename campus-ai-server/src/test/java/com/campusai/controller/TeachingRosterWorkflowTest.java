package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.user.entity.User;
import com.campusai.teaching.TeachingService;
import com.campusai.teaching.TeachingLifecycleService;
import com.campusai.teaching.TeachingReenrollmentService;
import com.campusai.teaching.TeachingGovernanceService;
import com.campusai.timetable.*;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real services/transactions/controllers with signed synthetic sessions. No school DB or names. */
@Timeout(15)
class TeachingRosterWorkflowTest {
    @Configuration @EnableTransactionManagement(proxyTargetClass=true) static class Tx {}
    static class MutableClock extends Clock {
        Instant value=Instant.parse("2026-10-14T05:00:00Z");
        public Instant instant(){return value;}public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return Clock.fixed(value,z);}
    }
    AnnotationConfigApplicationContext context;JdbcTemplate db;TeachingService service;UnifiedTimetableService unified;TeachingLifecycleService lifecycle;
    javax.sql.DataSource syntheticDataSource;
    ObjectMapper json;MockMvc mvc;MutableClock clock;Map<Long,String> tokens=new HashMap<>();
    String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString(),c=UUID.randomUUID().toString(),course,first,second,studentA,studentB;
    @BeforeEach void setup() throws Exception {
        javax.sql.DataSource ds=syntheticDataSource==null?new DriverManagerDataSource("jdbc:h2:mem:roster"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""):syntheticDataSource;db=new JdbcTemplate(ds);json=new ObjectMapper();clock=new MutableClock();
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(16),status INT,nickname VARCHAR(100),username VARCHAR(100))");
        for(int i=1;i<=11;i++)db.update("INSERT INTO users VALUES(?,?,?,?,?,?)",i,i==11?2:1,i==1?"ADMIN":"STUDENT",1,"模拟账号"+i,"roster-demo-"+i);
        migration("2026-10-14-teaching-attendance.sql");migration("2026-10-15-teaching-rosters.sql");migration("2026-10-15-teaching-lifecycle.sql");migration("2026-10-17-teaching-reenrollment.sql");migration("2026-10-17-teaching-course-mode-reviews.sql");
        db.execute("CREATE TABLE student_course_schedule_versions(user_id BIGINT PRIMARY KEY,revision INT NOT NULL)");
        db.execute("CREATE TABLE student_timetables(user_id BIGINT PRIMARY KEY)");
        db.execute("CREATE TABLE student_course_schedules(user_id BIGINT PRIMARY KEY,revision INT,semester VARCHAR(100),first_monday DATE,remind_days INT,courses_json TEXT,imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        context=new AnnotationConfigApplicationContext();context.register(Tx.class);context.registerBean(PlatformTransactionManager.class,()->new DataSourceTransactionManager(ds));
        context.registerBean(TeachingService.class,()->new TeachingService(db,json,true,clock,null,100,1000,0,true,true));
        context.registerBean(TeachingLifecycleService.class,()->new TeachingLifecycleService(db,context.getBean(TeachingService.class),clock));
        context.registerBean(TeachingReenrollmentService.class,()->new TeachingReenrollmentService(db,context.getBean(TeachingService.class),context.getBean(TeachingLifecycleService.class),clock));
        context.registerBean(TeachingGovernanceService.class,()->new TeachingGovernanceService(db,context.getBean(TeachingService.class),clock));
        context.registerBean(CourseScheduleService.class,()->new CourseScheduleService(db,json));
        context.registerBean(UnifiedTimetableService.class,()->new UnifiedTimetableService(db,context.getBean(CourseScheduleService.class),context.getBean(TeachingService.class),1,clock));context.refresh();service=context.getBean(TeachingService.class);unified=context.getBean(UnifiedTimetableService.class);
        lifecycle=context.getBean(TeachingLifecycleService.class);
        byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=mock(AuthSessionService.class);
        for(long i=1;i<=11;i++){User u=new User();u.setId(i);u.setUsername("roster-demo-"+i);u.setRole(i==1?"ADMIN":"STUDENT");tokens.put(i,jwt.generateToken(u,"roster-demo-"+i));when(sessions.active("roster-demo-"+i,i,u.getRole())).thenReturn(true);}
        mvc=MockMvcBuilders.standaloneSetup(new TeachingController(service,json),new AdminTeachingController(service,json),new TeachingLifecycleController(lifecycle,context.getBean(TeachingReenrollmentService.class),json),new TeachingGovernanceController(context.getBean(TeachingGovernanceService.class),service,json),new UnifiedTimetableController(unified)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        service.createClass(1,new TeachingService.ClassInput(a,"合成学院甲","行政班甲",List.of(new TeachingService.Member("synthetic-2","模拟同学甲",2L),new TeachingService.Member("synthetic-3","模拟同学乙",3L))));
        service.createClass(1,new TeachingService.ClassInput(b,"合成学院乙","行政班乙",List.of(new TeachingService.Member("synthetic-4","模拟同学丙",4L))));
        service.createClass(1,new TeachingService.ClassInput(c,"合成学院甲","行政班丙",List.of(new TeachingService.Member("synthetic-5","模拟同学丁",5L))));
        studentA=service.members(1,a).get(0).id();studentB=service.members(1,b).get(0).id();
        service.grant(1,new TeachingService.GrantInput(7L,"COUNSELOR",a),false);service.grant(1,new TeachingService.GrantInput(8L,"SECRETARY","合成学院甲"),false);service.grant(1,new TeachingService.GrantInput(9L,"SECRETARY","合成学院乙"),false);
        course=UUID.randomUUID().toString();create(course,"合成合班选修",List.of(studentA,studentB),"14:00");
        var lessons=service.lessons(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,21));first=lessons.get(0).id();second=lessons.get(1).id();
    }
    void migration(String file) throws Exception {for(String sql:Files.readString(Path.of("../deploy/migrations/"+file)).split(";"))if(!sql.isBlank())db.execute(sql);}
    @AfterEach void close(){if(context!=null)context.close();}
    TeachingService.CourseInput input(String id,String name,String start){return new TeachingService.CourseInput(id,a,6L,name,"合成学期",LocalDate.of(2026,10,12),3,start,"15:35",List.of(1,2),"合成教学室");}
    void create(String id,String name,List<String> members,String start)throws Exception{send(1,post("/api/admin/teaching/courses/roster"),new TeachingService.RosterCourseInput(input(id,name,start),name,members),200);}
    JsonNode read(long actor,MockHttpServletRequestBuilder req,int code)throws Exception{var r=mvc.perform(req.header("Authorization","Bearer "+tokens.get(actor))).andExpect(status().is(code)).andExpect(header().string("Cache-Control","no-store")).andReturn();String body=r.getResponse().getContentAsString();return body.isBlank()?null:json.readTree(body);}
    JsonNode send(long actor,MockHttpServletRequestBuilder req,Object value,int code)throws Exception{return read(actor,req.contentType("application/json").content(json.writeValueAsString(value)),code);}
    JsonNode detail(long actor,String view,String lesson)throws Exception{return read(actor,get("/api/teaching/lessons/"+lesson).param("view",view),200);}
    @Test void teacherCoursePagingSearchAndFullStatisticsNeverStopAtFiveHundred()throws Exception{
        Instant base=Instant.parse("2026-10-14T06:00:00Z");
        for(int i=1;i<=501;i++){
            String id=UUID.randomUUID().toString();
            db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at,cancelled) VALUES(?,?,?,?,?,?,?)",id,1,course,a,java.sql.Timestamp.from(base.plusSeconds(i*60L)),java.sql.Timestamp.from(base.plusSeconds(i*60L+2700)),i==501);
            db.update("INSERT INTO teaching_attendance SELECT ?,student_id,student_number,student_name,status FROM teaching_attendance WHERE lesson_id=?",id,first);
            db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source) SELECT ?,student_id,school_id,admin_class_id,college,withdrawn,source FROM teaching_attendance_scopes WHERE lesson_id=?",id,first);
        }
        db.update("UPDATE teaching_attendance SET status='ABSENT' WHERE lesson_id=? AND student_id=?",first,studentA);
        db.update("UPDATE teaching_course_rosters SET group_name='合成%_!教学组' WHERE course_id=?",course);
        Set<String> seen=new HashSet<>();
        for(int page=0;page<11;page++){
            var value=read(6,get("/api/teaching/lessons/page").param("view","TEACHER").param("from","2026-10-14").param("to","2026-10-14").param("page",String.valueOf(page)),200);
            assertEquals(502,value.get("total").asInt());assertEquals(11,value.get("totalPages").asInt());
            assertEquals(1,value.get("summary").get("counts").get("absent").asInt());assertEquals(1001,value.get("summary").get("counts").get("unknown").asInt());
            assertEquals(1,value.get("summary").get("absentStudents").asInt());
            for(var item:value.get("items"))assertTrue(seen.add(item.get("id").asString()));
        }
        assertEquals(502,seen.size());
        for(String search:List.of("%_!","模拟账号6","合成教学室"))assertEquals(502,service.lessonPage(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),null,0,50,search).total());
        assertEquals(0,service.lessonPage(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),null,0,50,"不存在_班").total());
        read(6,get("/api/teaching/lessons/page").param("view","TEACHER").param("from","2026-10-14").param("to","2026-10-14").param("page","11"),400);
        read(2,get("/api/teaching/lessons/page").param("view","TEACHER").param("from","2026-10-14").param("to","2026-10-14"),403);
        read(11,get("/api/teaching/lessons/page").param("view","TEACHER").param("from","2026-10-14").param("to","2026-10-14"),403);
        mvc.perform(get("/api/teaching/lessons/page").param("view","TEACHER").param("from","2026-10-14").param("to","2026-10-14")).andExpect(status().isUnauthorized());
    }
    @Test void selectedMembersMayJoinMultipleCoursesWithoutDuplicatingIdentityAndOthersInTheirAdminClassDoNotEnroll()throws Exception{
        create(UUID.randomUUID().toString(),"第二门选修",List.of(studentA),"08:30");
        assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));
        assertEquals(2,service.lessons(2,"STUDENT",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14)).size());assertEquals(0,service.lessons(3,"STUDENT",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14)).size());
        assertEquals(1,detail(2,"STUDENT",first).get("entries").size());assertEquals(2,detail(6,"TEACHER",first).get("entries").size());
        assertEquals("跨学院教学",detail(6,"TEACHER",first).get("lesson").get("college").asString());
        read(3,get("/api/teaching/lessons/"+first).param("view","STUDENT"),404);
        var roster=read(1,get("/api/admin/teaching/courses/"+course+"/roster"),200);assertEquals(2,roster.get("members").size());assertEquals(0,roster.get("revision").asInt());
        assertEquals(1,service.lessons(4,"STUDENT",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),b).size());assertEquals(2,service.classesForView(6,"TEACHER").size());
    }
    @Test void fullRangeMemberAggregationKeepsSchoolClassTeacherAndLiteralSearchWithoutDoubleLessonScope()throws Exception{
        create(UUID.randomUUID().toString(),"另一个合成选修",List.of(studentA),"08:30");
        service.createCourse(1,new TeachingService.CourseInput(UUID.randomUUID().toString(),c,10L,"另一教师的合成课程","合成学期",LocalDate.of(2026,10,12),3,"14:00","15:35",List.of(1),"合成教室"));
        LocalDate date=LocalDate.of(2026,10,14);
        assertEquals(3,service.lessonPage(8,"SECRETARY",date,date,null,0,1,"").summary().counts().total());
        assertEquals(2,service.lessonPage(7,"COUNSELOR",date,date,null,0,1,"").summary().counts().total());
        assertEquals(1,service.lessonPage(9,"SECRETARY",date,date,null,0,1,"").summary().counts().total());
        assertEquals(3,service.lessonPage(6,"TEACHER",date,date,null,0,1,"").summary().counts().total());
        assertEquals(1,service.lessonPage(10,"TEACHER",date,date,null,0,1,"").summary().counts().total());
        assertEquals(2,service.lessonPage(2,"STUDENT",date,date,null,0,1,"").summary().counts().total());
        assertEquals(2,service.lessonPage(8,"SECRETARY",date,date,a,0,1,"").summary().counts().total());
        db.update("UPDATE teaching_course_rosters SET group_name='合成%_!限定' WHERE course_id=?",course);
        assertEquals(1,service.lessonPage(8,"SECRETARY",date,date,null,0,1,"%_!").summary().counts().total());
        assertEquals(1,service.lessonPage(9,"SECRETARY",date,date,null,0,1,"%_!").summary().counts().total());
        assertEquals(0,service.lessonPage(8,"SECRETARY",date,date,null,0,1,"不存在%_").summary().counts().total());
        db.update("UPDATE teaching_attendance_scopes SET withdrawn=TRUE WHERE lesson_id=? AND student_id=?",first,studentA);
        assertEquals(2,service.lessonPage(6,"TEACHER",date,date,null,0,1,"").summary().counts().total());
        assertEquals(2,service.lessonPage(8,"SECRETARY",date,date,null,0,1,"").summary().counts().total());
        assertEquals(1,service.lessonPage(7,"COUNSELOR",date,date,null,0,1,"").summary().counts().total());
    }
    @Test void mixedClassRosterCountsAndNamesAreFilteredByAdministrativeGrantAtEveryReadPath()throws Exception{
        clock.value=Instant.parse("2026-10-14T06:02:00Z");
        send(6,put("/api/teaching/lessons/"+first+"/attendance"),new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"ON_TIME"),new TeachingService.Mark(studentB,"ABSENT")),"",true),200);
        for(long actor:new long[]{7,8}){
            String role=actor==7?"COUNSELOR":"SECRETARY";var d=detail(actor,role,first);assertEquals(1,d.get("entries").size());assertFalse(d.toString().contains("synthetic-4"));assertEquals(0,d.get("lesson").get("counts").get("absent").asInt());
            var page=service.lessonPage(actor,role,LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),null,0,1);assertEquals(0,page.summary().absentStudents());assertEquals(1,page.summary().counts().onTime());
            assertEquals(0,unified.week(actor,role,LocalDate.of(2026,10,12),null).summary().absentStudents());
        }
        assertEquals(1,detail(9,"SECRETARY",first).get("lesson").get("counts").get("absent").asInt());assertEquals(1,detail(9,"SECRETARY",first).get("entries").size());
        read(7,get("/api/timetable/unified/page").param("view","COUNSELOR").param("monday","2026-10-12").param("classId",b),404);
        assertEquals(1,service.lessonPage(9,"SECRETARY",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),b,0,1).summary().absentStudents());
    }
    @Test void remindersUseActualCourseMembersAndWithdrawalPreservesPastButHidesFutureAndBumpsDraftVersion()throws Exception{
        assertEquals(2,service.dispatchDueNotices());assertEquals(0,service.dispatchDueNotices());assertEquals(0,service.notices(3).size());assertEquals(1,service.notices(4).size());
        clock.value=Instant.parse("2026-10-21T05:00:00Z");assertEquals(2,service.dispatchDueNotices());assertEquals(2,service.notices(4).size());
        send(1,post("/api/admin/teaching/courses/"+course+"/members/"+studentB+"/withdraw"),new TeachingService.WithdrawInput(0,"合成退课核对"),200);
        assertEquals(1,service.notices(4).size());assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));assertEquals(1,detail(6,"TEACHER",second).get("entries").size());assertEquals(2,detail(6,"TEACHER",first).get("entries").size());
        read(4,get("/api/teaching/lessons/"+second).param("view","STUDENT"),404);detail(4,"STUDENT",first);
        clock.value=Instant.parse("2026-10-21T06:02:00Z");send(6,put("/api/teaching/lessons/"+second+"/attendance"),new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"ON_TIME")),"",false),409);
        send(6,put("/api/teaching/lessons/"+second+"/attendance"),new TeachingService.RollCall(1,List.of(new TeachingService.Mark(studentB,"ON_TIME")),"",false),400);
        assertEquals(1,service.withdrawMember(1,course,studentB,new TeachingService.WithdrawInput(1,"重复核对")));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_enrollment_audit WHERE action='WITHDRAW'",Integer.class));
        migration("2026-10-15-teaching-rosters.sql");assertFalse(service.courseRoster(1,course).members().stream().filter(m->m.studentId().equals(studentB)).findFirst().orElseThrow().active());
    }
    @Test void crossSchoolDuplicateAndUnapprovedConfigurationFailWithoutPartialCourseOrPrivilege()throws Exception{
        String id=UUID.randomUUID().toString(),path="/api/admin/teaching/courses/roster";int before=db.queryForObject("SELECT COUNT(*) FROM teaching_courses",Integer.class);
        var in=new TeachingService.RosterCourseInput(input(id,"拒绝示例","14:00"),"拒绝示例",List.of(studentA,studentA));send(1,post(path),in,400);send(2,post(path),in,403);
        send(1,post(path),new TeachingService.RosterCourseInput(input(id,"拒绝示例","14:00"),"拒绝示例",List.of(UUID.randomUUID().toString())),400);
        db.update("UPDATE users SET role='ADMIN' WHERE id=11");String foreignClass=UUID.randomUUID().toString();service.createClass(11,new TeachingService.ClassInput(foreignClass,"外校合成学院","外校合成行政班",List.of(new TeachingService.Member("foreign-mock","外校模拟同学",null))));
        String foreignStudent=service.members(11,foreignClass).get(0).id();
        send(1,post(path),new TeachingService.RosterCourseInput(input(id,"拒绝示例","14:00"),"拒绝示例",List.of(studentA,foreignStudent)),400);
        assertEquals(404,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.courseRoster(11,course)).getStatusCode().value());
        read(11,get("/api/admin/teaching/courses/"+course+"/roster"),403);db.update("UPDATE users SET role='STUDENT' WHERE id=11");
        assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM teaching_courses",Integer.class));
        read(11,get("/api/admin/teaching/courses/"+course+"/roster"),403);read(2,get("/api/admin/teaching/courses/"+course+"/roster"),403);
        send(1,post("/api/admin/teaching/courses/"+course+"/members/"+studentB+"/withdraw"),new TeachingService.WithdrawInput(4,"stale"),409);
        var disabled=new TeachingService(db,json,true,clock);assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->disabled.createRosterCourse(1,in)).getStatusCode().value());
    }
    @Test void historyUsesCapturedAdministrativeScopeAndWithdrawalAuditFailureRollsBack()throws Exception{
        db.update("UPDATE teaching_students SET class_id=? WHERE id=?",a,studentB);
        assertEquals(1,detail(9,"SECRETARY",first).get("entries").size());assertEquals(1,detail(8,"SECRETARY",first).get("entries").size());
        db.execute("ALTER TABLE teaching_enrollment_audit ADD CONSTRAINT synthetic_fail CHECK(action<>'WITHDRAW')");
        send(1,post("/api/admin/teaching/courses/"+course+"/members/"+studentB+"/withdraw"),new TeachingService.WithdrawInput(0,"模拟回滚"),500);
        assertEquals(0,detail(6,"TEACHER",first).get("lesson").get("revision").asInt());assertEquals(2,detail(6,"TEACHER",first).get("entries").size());assertTrue(service.courseRoster(1,course).members().stream().allMatch(TeachingService.Enrollment::active));
    }
    @Test void overlapChecksUseManagedStudentsRatherThanCourseAnchorOrGroupName()throws Exception{
        create(UUID.randomUUID().toString(),"只涉及另一学院的重叠课",List.of(studentB),"14:00");
        var from=LocalDate.of(2026,10,14);assertEquals(0,service.lessonPage(7,"COUNSELOR",from,from,null,0,25).conflicts());assertEquals(0,unified.week(7,"COUNSELOR",LocalDate.of(2026,10,12),null).summary().conflicts());
        create(UUID.randomUUID().toString(),"不同教学组的本人重叠课",List.of(studentA),"14:00");
        assertEquals(2,service.lessonPage(7,"COUNSELOR",from,from,null,0,25).conflicts());assertEquals(2,unified.week(7,"COUNSELOR",LocalDate.of(2026,10,12),null).summary().conflicts());
    }
    @Test void parallelPointNameAndWithdrawalCannotHideAlreadyRecordedAttendance()throws Exception{
        clock.value=Instant.parse("2026-10-14T05:55:00Z");
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var start=new java.util.concurrent.CyclicBarrier(2);
        try{
            var mark=pool.submit(()->{start.await(3,java.util.concurrent.TimeUnit.SECONDS);try{service.mark(6,first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentB,"ON_TIME")),"",false));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
            var withdraw=pool.submit(()->{start.await(3,java.util.concurrent.TimeUnit.SECONDS);try{service.withdrawMember(1,course,studentB,new TeachingService.WithdrawInput(0,"模拟并发核对"));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
            var codes=List.of(mark.get(5,java.util.concurrent.TimeUnit.SECONDS),withdraw.get(5,java.util.concurrent.TimeUnit.SECONDS));assertEquals(1,codes.stream().filter(n->n==200).count());assertEquals(1,codes.stream().filter(n->n==409).count());
            String status=db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,first,studentB);
            boolean removed=db.queryForObject("SELECT withdrawn FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",Boolean.class,first,studentB);
            assertFalse(removed && !"UNKNOWN".equals(status));
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(2,java.util.concurrent.TimeUnit.SECONDS));}
    }
    @Test void partialAdministrativeSnapshotFailsClosedInsteadOfShowingAnIncompleteRoster()throws Exception{
        db.update("DELETE FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",first,studentB);
        read(6,get("/api/teaching/lessons/"+first).param("view","TEACHER"),503);
        read(7,get("/api/teaching/lessons/"+first).param("view","COUNSELOR"),503);
        clock.value=Instant.parse("2026-10-14T06:02:00Z");send(6,put("/api/teaching/lessons/"+first+"/attendance"),new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"ON_TIME")),"",true),503);
        assertEquals(0,db.queryForObject("SELECT revision FROM teaching_lessons WHERE id=?",Integer.class,first));
    }
    @Test void capabilitiesAndCourseLookupStayBehindActualAdminAndDoNotLoadEverySemester()throws Exception{
        var capability=read(1,get("/api/admin/teaching/capabilities"),200);assertTrue(capability.get("rosterEnabled").asBoolean());assertEquals(2000,capability.get("maxCourseMembers").asInt());
        read(2,get("/api/admin/teaching/capabilities").param("userId","1"),403);
        create(UUID.randomUUID().toString(),"合成课_100%",List.of(studentA),"08:30");
        var page=read(1,get("/api/admin/teaching/scopes/page").param("kind","COURSE").param("size","1").param("selected",course),200);assertEquals(2,page.get("total").asInt());assertEquals(1,page.get("items").size());assertEquals(course,page.get("selected").get("value").asString());
        var literal=service.configurationPage(1,"COURSE",0,1,"%",course);assertEquals(1,literal.total());assertEquals(course,literal.selected().value());
        var disabled=new TeachingService(db,json,true,clock);assertFalse(disabled.capabilities(1).rosterEnabled());assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->disabled.configurationPage(1,"COURSE",0,25,"","")).getStatusCode().value());
    }
    @Test @Timeout(30) void largeMergedClassUsesAuthorizedSqlPagesAndCannotFinalizeOnlyCurrentPage()throws Exception{
        var ids=new ArrayList<String>();
        for(int g=0;g<3;g++){
            String cls=UUID.randomUUID().toString();var members=new ArrayList<TeachingService.Member>();
            for(int n=0;n<234;n++)members.add(new TeachingService.Member("large-"+g+"-"+String.format("%03d",n),"合成大班"+g+"-"+n,null));
            service.createClass(1,new TeachingService.ClassInput(cls,g==0?"合成学院甲":"合成学院乙","大班行政"+g,members));
            ids.addAll(service.members(1,cls).stream().map(TeachingService.MemberRow::id).toList());
        }
        String big=UUID.randomUUID().toString();create(big,"702人大合班",ids,"14:00");String lesson=service.lessons(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14)).stream().filter(x->x.course().equals("702人大合班")).findFirst().orElseThrow().id();
        var all=new HashSet<String>();int revision=0;
        clock.value=Instant.parse("2026-10-14T06:02:00Z");
        read(6,get("/api/teaching/lessons/"+lesson).param("view","TEACHER"),400);
        read(1,get("/api/admin/teaching/courses/"+big+"/roster"),400);
        send(6,put("/api/teaching/lessons/"+lesson+"/attendance"),new TeachingService.RollCall(0,List.of(new TeachingService.Mark(ids.get(0),"ON_TIME")),"",false),400);
        for(int p=0;p<8;p++){
            var page=service.detailPage(6,"TEACHER",lesson,p,100,"");assertEquals(702,page.total());assertEquals(702,page.detail().lesson().counts().total());
            var marks=page.detail().entries().stream().map(x->{assertTrue(all.add(x.studentId()));return new TeachingService.Mark(x.studentId(),"ON_TIME");}).toList();
            if(p==0){send(6,put("/api/teaching/lessons/"+lesson+"/attendance/page").param("size","100"),new TeachingService.RollCall(0,marks,"",true),400);assertEquals(0,service.detailPage(6,"TEACHER",lesson,0,100,"").detail().lesson().revision());}
            var saved=service.markPage(6,lesson,new TeachingService.RollCall(revision,marks,"",p==7),p,100,"");revision=saved.detail().lesson().revision();assertEquals(702-all.size(),saved.detail().lesson().counts().unknown());
            assertEquals(702,service.courseRosterPage(1,big,p,100,"",false).total());
        }
        assertEquals(702,all.size());assertTrue(service.detailPage(6,"TEACHER",lesson,0,100,"").detail().lesson().finalized());
        assertEquals(234,service.detailPage(8,"SECRETARY",lesson,0,100,"").total());assertEquals(468,service.detailPage(9,"SECRETARY",lesson,0,100,"").total());
        assertEquals(1,service.courseRosterPage(1,big,0,25,"large-2-233",false).total());assertEquals(0,service.courseRosterPage(1,big,0,25,"%",false).total());
        read(2,get("/api/admin/teaching/courses/"+big+"/roster/page"),403);read(3,get("/api/teaching/lessons/"+lesson+"/page").param("view","STUDENT"),404);
        send(6,put("/api/teaching/lessons/"+lesson+"/attendance/page"),new TeachingService.RollCall(revision,List.of(new TeachingService.Mark(ids.get(0),"LATE")),"",false),400);
        assertEquals(702,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=?",Integer.class,lesson));
    }
    TeachingLifecycleService.Transition transition(String action,String target,int version,String cls){return new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),version,cls,action,target,"合成学籍变更核对");}
    @Test void transferPreservesPastScopesAndMovesOnlyFutureAdministrativeLessonsAndReminders()throws Exception{
        String oldCourse=UUID.randomUUID().toString(),newCourse=UUID.randomUUID().toString();
        service.createCourse(1,input(oldCourse,"原班必修","08:30"));
        var next=new TeachingService.CourseInput(newCourse,b,10L,"新班必修","合成学期",LocalDate.of(2026,10,12),3,"08:30","10:05",List.of(1,2),"合成新教室");service.createCourse(1,next);
        clock.value=Instant.parse("2026-10-14T06:02:00Z");service.mark(6,first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"LATE")),"",false));
        clock.value=Instant.parse("2026-10-15T05:00:00Z");
        var in=transition("TRANSFER",b,0,a);var out=send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),in,200);assertEquals(b,out.get("classId").asString());
        assertEquals(out,send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),in,200));
        assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));assertEquals(1,detail(7,"COUNSELOR",first).get("entries").size());
        assertEquals(1,detail(8,"SECRETARY",first).get("entries").size());assertEquals(1,detail(9,"SECRETARY",first).get("entries").size());
        read(7,get("/api/teaching/lessons/"+second+"/page").param("view","COUNSELOR"),404);
        read(8,get("/api/teaching/lessons/"+second+"/page").param("view","SECRETARY"),404);
        assertEquals(2,service.detailPage(9,"SECRETARY",second,0,25,"").total());
        assertEquals(Set.of("合成合班选修","新班必修"),service.lessons(2,"STUDENT",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21)).stream().map(TeachingService.Lesson::course).collect(java.util.stream.Collectors.toSet()));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=? AND student_id=?",Integer.class,first,studentA));
        assertEquals("LATE",db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,first,studentA));
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("LEAVE",null,0,a),409);
        send(2,post("/api/admin/teaching/students/"+studentA+"/transition"),in,403);
        read(11,get("/api/admin/teaching/students/"+studentA+"/status"),403);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_student_transition_audit",Integer.class));
    }
    @Test void leavingRemovesFutureAccessAndNoticesNotHistoricalRecordsOrAccountAndCannotEnrollAgain()throws Exception{
        clock.value=Instant.parse("2026-10-21T05:00:00Z");service.dispatchDueNotices();assertEquals(1,service.notices(2).size());
        int rows=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class);
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("LEAVE",null,0,a),200);
        assertEquals(0,service.notices(2).size());assertEquals(rows,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));
        detail(2,"STUDENT",first);read(2,get("/api/teaching/lessons/"+second+"/page").param("view","STUDENT"),404);
        assertEquals(1,db.queryForObject("SELECT status FROM users WHERE id=2",Integer.class));
        assertEquals("LEFT",lifecycle.status(1,studentA).status());
        send(1,post("/api/admin/teaching/courses/roster"),new TeachingService.RosterCourseInput(input(UUID.randomUUID().toString(),"离校不得重选","14:00"),"离校不得重选",List.of(studentA)),400);
        String whole=UUID.randomUUID().toString();service.createCourse(1,input(whole,"整班排除离校","14:00"));assertFalse(service.courseRoster(1,whole).members().stream().anyMatch(x->x.studentId().equals(studentA)));
    }
    @Test void readmissionRestoresOnlyFutureAdministrativeCoursesWithoutResurrectingElectivesOrChangingHistory()throws Exception{
        String whole=UUID.randomUUID().toString();service.createCourse(1,input(whole,"复学整班课","08:30"));
        clock.value=Instant.parse("2026-10-14T06:02:00Z");service.markPage(6,first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"LATE")),"",false),0,50,"");
        clock.value=Instant.parse("2026-10-20T23:35:00Z");service.dispatchDueNotices();var oldNotice=service.notices(2).stream().filter(n->n.course().equals("复学整班课")).findFirst().orElseThrow();service.readNotice(2,oldNotice.id());
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("LEAVE",null,0,a),200);
        assertTrue(service.notices(2).isEmpty());
        int people=db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class),history=db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class);
        var restore=transition("RESTORE",a,1,a);var saved=send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),restore,200);
        assertEquals("ACTIVE",saved.get("status").asString());assertEquals(2,saved.get("revision").asInt());
        assertEquals(saved,send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),restore,200));
        assertEquals(Set.of("复学整班课"),service.lessons(2,"STUDENT",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21)).stream().map(TeachingService.Lesson::course).collect(java.util.stream.Collectors.toSet()));
        assertEquals(people,db.queryForObject("SELECT COUNT(*) FROM teaching_students",Integer.class));assertEquals(history,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
        assertEquals("LATE",detail(2,"STUDENT",first).get("entries").get(0).get("status").asString());
        assertEquals(a,db.queryForObject("SELECT admin_class_id FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,first,studentA));
        assertTrue(db.queryForObject("SELECT withdrawn FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",Boolean.class,second,studentA));
        assertFalse(db.queryForObject("SELECT active FROM teaching_course_members WHERE course_id=? AND student_id=?",Boolean.class,course,studentA));
        assertEquals(oldNotice.id(),service.notices(2).get(0).id());assertNotNull(service.notices(2).get(0).readAt());assertEquals(0,service.dispatchDueNotices());
        assertEquals("STUDENT",db.queryForObject("SELECT role FROM users WHERE id=2",String.class));assertEquals(1,db.queryForObject("SELECT status FROM users WHERE id=2",Integer.class));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_student_transition_audit WHERE action='RESTORE'",Integer.class));
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("RESTORE",a,2,a),409);
    }
    @Test void crossCollegeReadmissionUsesNewFutureScopesAndNormalAdminAuthorization()throws Exception{
        String next=UUID.randomUUID().toString();service.createCourse(1,new TeachingService.CourseInput(next,b,10L,"复学新班课程","合成学期",LocalDate.of(2026,10,12),3,"08:30","10:05",List.of(1,2),"合成新教室"));
        clock.value=Instant.parse("2026-10-15T05:00:00Z");lifecycle.transition(1,studentA,transition("LEAVE",null,0,a));
        var restore=transition("RESTORE",b,1,a);
        mvc.perform(post("/api/admin/teaching/students/"+studentA+"/transition").contentType("application/json").content(json.writeValueAsString(restore))).andExpect(status().isUnauthorized());
        for(long actor:new long[]{2,6,7,8,11})send(actor,post("/api/admin/teaching/students/"+studentA+"/transition"),restore,403);
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),1,a,"RESTORE",b,""),400);
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),restore,200);
        assertEquals(b,lifecycle.status(1,studentA).classId());
        var restored=service.lessons(2,"STUDENT",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21));assertEquals(1,restored.size());assertEquals("复学新班课程",restored.get(0).course());
        read(7,get("/api/teaching/lessons/"+restored.get(0).id()+"/page").param("view","COUNSELOR"),404);
        read(8,get("/api/teaching/lessons/"+restored.get(0).id()+"/page").param("view","SECRETARY"),404);
        assertEquals(2,service.detailPage(9,"SECRETARY",restored.get(0).id(),0,50,"").total());
        assertEquals(1,detail(7,"COUNSELOR",first).get("entries").size());
        assertEquals("LIFECYCLE_RESTORE",db.queryForObject("SELECT source FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",String.class,restored.get(0).id(),studentA));
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),new TeachingLifecycleService.Transition(restore.requestId(),1,a,"RESTORE",c,restore.reason()),409);
    }
    @Test void readmissionRollsBackOnHistoricalSourceAmbiguityOrAuditFailure()throws Exception{
        String whole=UUID.randomUUID().toString();service.createCourse(1,input(whole,"复学来源核对","08:30"));clock.value=Instant.parse("2026-10-15T05:00:00Z");
        lifecycle.transition(1,studentA,transition("LEAVE",null,0,a));
        db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",whole);
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("RESTORE",a,1,a),409);
        assertEquals("LEFT",lifecycle.status(1,studentA).status());
        int version=db.queryForObject("SELECT revision FROM teaching_course_rosters WHERE course_id=?",Integer.class,whole);
        lifecycle.reviewMode(1,whole,new TeachingLifecycleService.ModeReview("ADMIN_CLASS",version,"合成核对：整班课程"));
        int scopes=db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class);
        db.execute("ALTER TABLE teaching_student_transition_audit ADD CONSTRAINT synthetic_restore_fail CHECK(action<>'RESTORE')");
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("RESTORE",a,1,a),500);
        assertEquals("LEFT",lifecycle.status(1,studentA).status());assertEquals(1,lifecycle.status(1,studentA).revision());
        assertEquals(scopes,db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class));
        assertEquals(0,service.lessons(2,"STUDENT",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21)).size());
    }
    @Test void readmissionDoesNotRetroactivelyEnrollLessonsDuringTheLeftInterval()throws Exception{
        String whole=UUID.randomUUID().toString();service.createCourse(1,input(whole,"复学期间边界课","08:30"));
        var source=service.lessons(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14)).stream().filter(l->l.course().equals("复学期间边界课")).findFirst().orElseThrow();
        String during=UUID.randomUUID().toString();
        db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at,cancelled) VALUES(?,1,?,?,?, ?,FALSE)",during,whole,a,java.sql.Timestamp.from(Instant.parse("2026-10-16T00:30:00Z")),java.sql.Timestamp.from(Instant.parse("2026-10-16T02:05:00Z")));
        db.update("INSERT INTO teaching_attendance SELECT ?,student_id,student_number,student_name,status FROM teaching_attendance WHERE lesson_id=?",during,source.id());
        db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,withdrawn,source) SELECT ?,student_id,school_id,admin_class_id,college,withdrawn,source FROM teaching_attendance_scopes WHERE lesson_id=?",during,source.id());
        clock.value=Instant.parse("2026-10-15T05:00:00Z");lifecycle.transition(1,studentA,transition("LEAVE",null,0,a));
        clock.value=Instant.parse("2026-10-17T05:00:00Z");lifecycle.transition(1,studentA,transition("RESTORE",a,1,a));
        assertTrue(db.queryForObject("SELECT withdrawn FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",Boolean.class,during,studentA));
        assertEquals("UNKNOWN",db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,during,studentA));
        read(2,get("/api/teaching/lessons/"+during+"/page").param("view","STUDENT"),404);
        assertFalse(service.lessons(2,"STUDENT",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21)).isEmpty());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE student_id=?",Integer.class,studentA));
    }
    @Test void readmissionReopensCompletedFutureRosterWithoutOverwritingOtherStudentsAndInvalidatesOldTeacherDraft()throws Exception{
        String whole=UUID.randomUUID().toString();service.createCourse(1,input(whole,"复学与已点名同学","08:30"));
        clock.value=Instant.parse("2026-10-15T05:00:00Z");lifecycle.transition(1,studentA,transition("LEAVE",null,0,a));
        var lesson=service.lessons(6,"TEACHER",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21)).stream().filter(l->l.course().equals("复学与已点名同学")).findFirst().orElseThrow();
        clock.value=Instant.parse("2026-10-21T00:25:00Z");
        var before=service.detailPage(6,"TEACHER",lesson.id(),0,50,"").detail();assertEquals(1,before.entries().size());
        String other=before.entries().get(0).studentId();
        service.markPage(6,lesson.id(),new TeachingService.RollCall(before.lesson().revision(),List.of(new TeachingService.Mark(other,"ON_TIME")),"",true),0,50,"");
        int completedVersion=service.detailPage(6,"TEACHER",lesson.id(),0,50,"").detail().lesson().revision();
        clock.value=Instant.parse("2026-10-21T00:26:00Z");lifecycle.transition(1,studentA,transition("RESTORE",a,1,a));
        var after=service.detailPage(6,"TEACHER",lesson.id(),0,50,"").detail();assertEquals(2,after.entries().size());assertFalse(after.lesson().finalized());
        assertEquals(1,after.lesson().counts().unknown());assertEquals(1,after.lesson().counts().onTime());assertTrue(after.lesson().revision()>completedVersion);
        send(6,put("/api/teaching/lessons/"+lesson.id()+"/attendance/page"),new TeachingService.RollCall(completedVersion,List.of(new TeachingService.Mark(other,"ON_TIME")),"",true),409);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=? AND student_id=?",Integer.class,lesson.id(),other));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id=? AND student_id=?",Integer.class,lesson.id(),studentA));
    }
    @Test void transitionRejectsPreRecordedFutureAndUnknownLegacyModeAndRollsBackOnAuditFailure()throws Exception{
        clock.value=Instant.parse("2026-10-14T05:55:00Z");service.mark(6,first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"ON_TIME")),"",false));
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("TRANSFER",b,0,a),409);assertEquals(a,lifecycle.status(1,studentA).classId());
        clock.value=Instant.parse("2026-10-15T05:00:00Z");db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",course);
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("TRANSFER",b,0,a),409);
        send(1,put("/api/admin/teaching/courses/"+course+"/enrollment-mode"),new TeachingLifecycleService.ModeReview("EXPLICIT",0,"核对原始合班名单"),200);
        db.execute("ALTER TABLE teaching_student_transition_audit ADD CONSTRAINT synthetic_transition_fail CHECK(action<>'TRANSFER')");
        send(1,post("/api/admin/teaching/students/"+studentA+"/transition"),transition("TRANSFER",b,0,a),500);
        assertEquals(a,lifecycle.status(1,studentA).classId());assertEquals(0,lifecycle.status(1,studentA).revision());assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_future_scope_audit",Integer.class));assertEquals(0,service.detailPage(6,"TEACHER",second,0,25,"").detail().lesson().revision());
    }
    @Test void stalePrivateImportCannotResurrectWithdrawnFutureAfterTransferButOriginalAndHistoryRemain()throws Exception{
        var schedules=context.getBean(CourseScheduleService.class);var input=new CourseScheduleService.Input(0,"合成学期",LocalDate.of(2026,10,12),7,List.of(new CourseScheduleService.Course("合成合班选修",3,"14:00","15:35",List.of(1,2),"合成教学室"),new CourseScheduleService.Course("旧个人独立副本",3,"08:30","10:05",List.of(1,2),"合成教室")));
        // Synthetic storage only. Exact old timestamps avoid mixing the DB wall clock and test clock.
        db.update("INSERT INTO student_course_schedules VALUES(?,?,?,?,?,?,?,?)",2,1,input.semester(),java.sql.Date.valueOf(input.firstMonday()),7,json.writeValueAsString(input.courses()),java.sql.Timestamp.from(Instant.parse("2026-10-13T01:00:00Z")),java.sql.Timestamp.from(Instant.parse("2026-10-13T01:00:00Z")));
        var original=schedules.get(2L).schedule();clock.value=Instant.parse("2026-10-15T05:00:00Z");lifecycle.transition(1,studentA,transition("TRANSFER",b,0,a));
        var week=unified.week(2,"STUDENT",LocalDate.of(2026,10,19),null);var page=unified.page(2,"STUDENT",LocalDate.of(2026,10,19),null,0,50);
        assertEquals(week.entries(),page.week().entries());assertEquals(1,page.week().summary().plannedClasses());assertTrue(page.week().entries().stream().filter(x->x.sources().equals(List.of("PERSONAL"))).allMatch(UnifiedTimetableService.Entry::cancelled));
        assertFalse(page.week().entries().stream().filter(x->x.lessonId()!=null).findFirst().orElseThrow().cancelled());assertEquals(original,schedules.get(2L).schedule());
        assertTrue(unified.week(2,"STUDENT",LocalDate.of(2026,10,12),null).entries().stream().filter(x->x.sources().equals(List.of("PERSONAL"))).noneMatch(UnifiedTimetableService.Entry::cancelled));
        lifecycle.transition(1,studentA,transition("LEAVE",null,1,b));assertEquals(0,unified.page(2,"STUDENT",LocalDate.of(2026,10,19),null,0,50).week().summary().plannedClasses());assertEquals(original,schedules.get(2L).schedule());
    }
    @Test void concurrentTransitionAndEarlyMarkPreserveEvidenceAndInvalidateTheLosingDraft()throws Exception{
        clock.value=Instant.parse("2026-10-14T05:55:00Z");var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var barrier=new java.util.concurrent.CyclicBarrier(2);
        try{
            var mark=pool.submit(()->{barrier.await(3,java.util.concurrent.TimeUnit.SECONDS);try{service.markPage(6,first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"ON_TIME")),"",false),0,50,"");return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
            var leave=pool.submit(()->{barrier.await(3,java.util.concurrent.TimeUnit.SECONDS);try{lifecycle.transition(1,studentA,transition("LEAVE",null,0,a));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}});
            var codes=List.of(mark.get(8,java.util.concurrent.TimeUnit.SECONDS),leave.get(8,java.util.concurrent.TimeUnit.SECONDS));assertEquals(1,codes.stream().filter(x->x==200).count());assertEquals(1,codes.stream().filter(x->x==409).count());
            assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance a JOIN teaching_attendance_scopes r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id WHERE a.student_id=? AND a.status<>'UNKNOWN' AND r.withdrawn=TRUE",Integer.class,studentA));
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(2,java.util.concurrent.TimeUnit.SECONDS));}
    }
    @Test void differentStudentsCannotRacePastAdministrativeClassCapacity()throws Exception{
        for(int n=0;n<298;n++)db.update("INSERT INTO teaching_students(id,school_id,class_id,student_number,name) VALUES(?,1,?,?,?)",UUID.randomUUID().toString(),b,"capacity-transfer-"+n,"合成容量"+n);
        clock.value=Instant.parse("2026-10-15T05:00:00Z");String other=service.members(1,a).stream().map(TeachingService.MemberRow::id).filter(x->!x.equals(studentA)).findFirst().orElseThrow();
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var barrier=new java.util.concurrent.CyclicBarrier(2);
        try{
            var tasks=new ArrayList<java.util.concurrent.Future<Integer>>();
            for(String id:List.of(studentA,other))tasks.add(pool.submit(()->{barrier.await(3,java.util.concurrent.TimeUnit.SECONDS);try{lifecycle.transition(1,id,transition("TRANSFER",b,0,a));return 200;}catch(org.springframework.web.server.ResponseStatusException e){return e.getStatusCode().value();}}));
            var codes=List.of(tasks.get(0).get(8,java.util.concurrent.TimeUnit.SECONDS),tasks.get(1).get(8,java.util.concurrent.TimeUnit.SECONDS));assertEquals(1,codes.stream().filter(x->x==200).count());assertEquals(1,codes.stream().filter(x->x==409).count());
            assertEquals(300,db.queryForObject("SELECT COUNT(*) FROM teaching_students WHERE class_id=?",Integer.class,b));
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(2,java.util.concurrent.TimeUnit.SECONDS));}
    }
    @Test void earlyLeaveHasSeparateCountsScopeAndMandatoryCorrectionAuditWithoutChangingLegacyStates()throws Exception{
        clock.value=Instant.parse("2026-10-14T05:55:00Z");
        send(6,put("/api/teaching/lessons/"+first+"/attendance/page"),new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"EARLY_LEAVE")),"",false),400);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit",Integer.class));
        clock.value=Instant.parse("2026-10-14T06:02:00Z");
        service.markPage(6,first,new TeachingService.RollCall(0,List.of(new TeachingService.Mark(studentA,"ON_TIME"),new TeachingService.Mark(studentB,"EXCUSED")),"",true),0,50,"");
        send(6,put("/api/teaching/lessons/"+first+"/attendance/page"),new TeachingService.RollCall(1,List.of(new TeachingService.Mark(studentA,"EARLY_LEAVE")),"",false),400);
        var saved=service.markPage(6,first,new TeachingService.RollCall(1,List.of(new TeachingService.Mark(studentA,"EARLY_LEAVE")),"合成早退核验原因",false),0,50,"");
        assertEquals(1,saved.detail().lesson().counts().earlyLeave());assertEquals(1,saved.detail().lesson().counts().excused());assertEquals(0,saved.detail().lesson().counts().onTime());assertEquals(2,saved.detail().lesson().counts().total());
        assertEquals("EXCUSED",db.queryForObject("SELECT status FROM teaching_attendance WHERE lesson_id=? AND student_id=?",String.class,first,studentB));
        assertEquals(1,service.detailPage(7,"COUNSELOR",first,0,50,"").detail().lesson().counts().earlyLeave());assertEquals(0,service.detailPage(9,"SECRETARY",first,0,50,"").detail().lesson().counts().earlyLeave());
        assertEquals("EARLY_LEAVE",service.detailPage(2,"STUDENT",first,0,50,"").detail().entries().get(0).status());
        assertEquals(1,service.lessonPage(8,"SECRETARY",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),null,0,25).summary().counts().earlyLeave());
        assertEquals(1,unified.page(2,"STUDENT",LocalDate.of(2026,10,12),null,0,50).week().summary().attendance().earlyLeave());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_attendance_audit WHERE old_status='ON_TIME' AND new_status='EARLY_LEAVE' AND reason='合成早退核验原因'",Integer.class));
        send(10,put("/api/teaching/lessons/"+first+"/attendance/page"),new TeachingService.RollCall(2,List.of(new TeachingService.Mark(studentA,"ABSENT")),"越权尝试",false),403);
    }
    @Test void missingScopeOrInvalidStatusOffCurrentPageCannotProduceApparentlyCompleteSummary()throws Exception{
        db.update("DELETE FROM teaching_attendance_scopes WHERE lesson_id=? AND student_id=?",second,studentB);
        assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.lessonPage(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,21),null,0,1)).getStatusCode().value());
        assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->unified.page(6,"TEACHER",LocalDate.of(2026,10,19),null,0,1)).getStatusCode().value());
        // An unrelated student's empty authorized view remains private and valid.
        assertEquals(0,unified.page(3,"STUDENT",LocalDate.of(2026,10,19),null,0,1).total());
        db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,source) VALUES(?,?,1,?,'合成学院乙','CAPTURED_AT_CREATION')",second,studentB,b);
        db.update("UPDATE teaching_attendance SET status='CORRUPT' WHERE lesson_id=? AND student_id=?",second,studentB);
        read(6,get("/api/teaching/lessons/"+second+"/page").param("view","TEACHER"),503);
        assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.lessonPage(6,"TEACHER",LocalDate.of(2026,10,14),LocalDate.of(2026,10,21),null,0,1)).getStatusCode().value());
    }
    @Test void unrelatedLegacyElectiveCannotBlockTransferAndLeavingDoesNotNeedToGuessEnrollmentMode()throws Exception{
        String ghost=UUID.randomUUID().toString();create(ghost,"同班但本人未选的历史选修",List.of(studentB),"08:30");
        db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",ghost);
        clock.value=Instant.parse("2026-10-15T05:00:00Z");
        assertEquals(b,lifecycle.transition(1,studentA,transition("TRANSFER",b,0,a)).classId());
        db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",course);
        assertEquals("LEFT",lifecycle.transition(1,studentA,transition("LEAVE",null,1,b)).status());
        assertEquals(0,service.lessons(2,"STUDENT",LocalDate.of(2026,10,21),LocalDate.of(2026,10,21)).size());detail(2,"STUDENT",first);
    }
    @Test void anAuthorizedNoticeBeyondInboxFirstHundredCanBeReadButRevokedOrForeignOneCannot()throws Exception{
        clock.value=Instant.parse("2026-10-14T05:00:00Z");String oldest=UUID.randomUUID().toString();
        db.update("INSERT INTO teaching_notices(id,user_id,lesson_id,kind,due_at) VALUES(?,2,?,'STUDENT_CLASS',?)",oldest,first,java.sql.Timestamp.from(clock.instant().minusSeconds(1000)));
        for(int n=0;n<100;n++){
            String lesson=UUID.randomUUID().toString();db.update("INSERT INTO teaching_lessons(id,school_id,course_id,class_id,starts_at,ends_at) VALUES(?,1,?,?,?,?)",lesson,course,a,java.sql.Timestamp.from(clock.instant().plusSeconds(4000+n)),java.sql.Timestamp.from(clock.instant().plusSeconds(5000+n)));
            db.update("INSERT INTO teaching_attendance VALUES(?,?,? ,?,'UNKNOWN')",lesson,studentA,"synthetic-2","模拟同学甲");
            db.update("INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,source) VALUES(?,?,1,?,'合成学院甲','CAPTURED_AT_CREATION')",lesson,studentA,a);
            db.update("INSERT INTO teaching_notices(id,user_id,lesson_id,kind,due_at) VALUES(?,2,?,'STUDENT_CLASS',?)",UUID.randomUUID().toString(),lesson,java.sql.Timestamp.from(clock.instant().minusSeconds(n)));
        }
        assertEquals(100,service.notices(2).size());assertFalse(service.notices(2).stream().anyMatch(n->n.id().equals(oldest)));service.readNotice(2,oldest);
        assertNotNull(db.queryForObject("SELECT read_at FROM teaching_notices WHERE id=?",java.sql.Timestamp.class,oldest));
        assertEquals(404,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.readNotice(4,oldest)).getStatusCode().value());
        service.cancel(1,first,0);assertEquals(404,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.readNotice(2,oldest)).getStatusCode().value());
    }
}
