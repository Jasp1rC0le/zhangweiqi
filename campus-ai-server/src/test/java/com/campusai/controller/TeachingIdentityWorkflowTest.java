package com.campusai.controller;

import com.campusai.dto.CreateUserRequest;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.mapper.*;
import com.campusai.security.*;
import com.campusai.service.impl.UserServiceImpl;
import com.campusai.teaching.*;
import com.campusai.user.entity.User;
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
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Timeout(20)
class TeachingIdentityWorkflowTest {
    @Configuration @EnableTransactionManagement(proxyTargetClass=true) static class Tx {}
    JdbcTemplate db; ObjectMapper json; MockMvc mvc; AnnotationConfigApplicationContext context;
    TeachingIdentityService identities; TeachingService teaching; UserServiceImpl registration;
    AuthSessionService sessions; Map<Long,String> tokens=new HashMap<>();
    final Clock clock=Clock.fixed(Instant.parse("2026-10-16T00:25:00Z"),ZoneOffset.UTC);
    final String classId=UUID.randomUUID().toString();
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:identity"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds);json=new ObjectMapper();
        db.execute("CREATE TABLE users(id BIGINT PRIMARY KEY,school_id BIGINT,role VARCHAR(16),status INT,nickname VARCHAR(100),username VARCHAR(100) UNIQUE,password_hash VARCHAR(255))");
        db.execute("CREATE TABLE user_privacy_consents(user_id BIGINT PRIMARY KEY,policy_version VARCHAR(32))");
        for(int i=1;i<=9;i++) db.update("INSERT INTO users(id,school_id,role,status,nickname,username) VALUES(?,?,?,?,?,?)",i,i==9?2:1,i==1||i==8?"ADMIN":"STUDENT",1,"合成用户"+i,"identity"+i);
        for(String file:List.of("2026-10-14-teaching-attendance.sql","2026-10-15-teaching-identities.sql"))
            for(String sql:Files.readString(Path.of("../deploy/migrations/"+file)).split(";")) if(!sql.isBlank()) db.execute(sql);
        var mapper=mock(UserMapper.class);var schools=mock(SchoolMapper.class);
        when(schools.findActiveById(1L)).thenReturn(new com.campusai.school.entity.School());
        when(mapper.findByUsername(anyString())).thenAnswer(call->{
            var list=db.queryForList("SELECT id FROM users WHERE username=?",Long.class,call.<String>getArgument(0));return list.isEmpty()?null:user(list.get(0));
        });
        when(mapper.findById(anyLong())).thenAnswer(call->user(call.getArgument(0)));
        when(mapper.insert(any())).thenAnswer(call->{
            User u=call.getArgument(0);u.setId(100L);
            return db.update("INSERT INTO users VALUES(?,?,?,?,?,?,?)",u.getId(),u.getSchoolId(),u.getRole(),u.getStatus(),u.getNickname(),u.getUsername(),u.getPasswordHash());
        });
        context=new AnnotationConfigApplicationContext();context.register(Tx.class);
        context.registerBean(PlatformTransactionManager.class,()->new DataSourceTransactionManager(ds));
        context.registerBean(TeachingIdentityService.class,()->new TeachingIdentityService(db,true,clock));
        context.registerBean(TeachingService.class,()->new TeachingService(db,json,true,clock,context.getBean(TeachingIdentityService.class)));
        context.registerBean(UserServiceImpl.class,()->new UserServiceImpl(mapper,schools,new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4),db,context.getBean(TeachingIdentityService.class)));
        context.refresh();identities=context.getBean(TeachingIdentityService.class);teaching=context.getBean(TeachingService.class);registration=context.getBean(UserServiceImpl.class);
        byte[] key=new byte[64];new SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),60000);sessions=mock(AuthSessionService.class);
        for(long i=1;i<=9;i++){User u=user(i);tokens.put(i,jwt.generateToken(u,"identity-"+i));when(sessions.active("identity-"+i,i,u.getRole())).thenReturn(true);}
        mvc=MockMvcBuilders.standaloneSetup(new TeachingIdentityController(identities,json),new TeachingController(teaching,json),new AdminTeachingController(teaching,json),new UserController(registration))
                .setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        teaching.createClass(1,new TeachingService.ClassInput(classId,"合成学院","合成班",List.of(new TeachingService.Member("synthetic-2","合成同学",2L))));
    }
    User user(long id) {
        var rows=db.query("SELECT * FROM users WHERE id=?",(r,n)->{User u=new User();u.setId(r.getLong("id"));u.setSchoolId(r.getLong("school_id"));u.setRole(r.getString("role"));u.setStatus(r.getInt("status"));u.setUsername(r.getString("username"));u.setNickname(r.getString("nickname"));return u;},id);
        return rows.isEmpty()?null:rows.get(0);
    }
    @AfterEach void close(){if(context!=null)context.close();}
    MockHttpServletRequestBuilder auth(long actor,MockHttpServletRequestBuilder req){return req.header("Authorization","Bearer "+tokens.get(actor));}
    JsonNode send(long actor,MockHttpServletRequestBuilder req,Object data,int code) throws Exception {
        var result=mvc.perform(auth(actor,req).contentType("application/json").content(json.writeValueAsString(data))).andExpect(status().is(code)).andExpect(header().string("Cache-Control","no-store")).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }
    JsonNode apply(long actor,String role,int revision) throws Exception {return send(actor,post("/api/account/teaching-identities"),new TeachingIdentityService.Apply(role,revision),200);}
    JsonNode review(long actor,JsonNode row,String decision,String reason,int code) throws Exception {
        return send(actor,post("/api/admin/teaching-identities/"+row.get("id").asString()+"/review"),new TeachingIdentityService.Review(row.get("revision").asInt(),decision,reason),code);
    }
    TeachingService.CourseInput course(long teacher){return new TeachingService.CourseInput(UUID.randomUUID().toString(),classId,teacher,"合成课程","合成学期",LocalDate.of(2026,10,12),5,"08:30","10:05",List.of(1),"合成教室");}
    @Test void registrationStoresPendingIdentityWithoutElevatingPlatformRoleOrGrantingAnyScope() throws Exception {
        String password=UUID.randomUUID().toString();
        var result=mvc.perform(post("/api/users").contentType("application/json").content(json.writeValueAsString(Map.of("schoolId",1,"username","synthetic-registration","nickname","合成新用户","password",password,"privacyAccepted",true,"policyVersion",PrivacyPolicyVersion.CURRENT,"teachingIdentity","TEACHER"))))
                .andExpect(status().isCreated()).andReturn();
        assertFalse(result.getResponse().getContentAsString().contains(password));assertEquals("STUDENT",user(100).getRole());
        var own=identities.mine(100);assertEquals("PENDING",own.items().get(0).status());assertTrue(teaching.access(100).views().isEmpty());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM teaching_grants",Integer.class));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM teaching_identity_audit",Integer.class));
        var invalid=new CreateUserRequest();invalid.setTeachingIdentity("ADMIN");assertEquals(400,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->registration.register(invalid)).getStatusCode().value());
    }
    @Test void pendingApprovalThenExplicitBindingRevokeAndRestoreProtectPrivateReadsAndTeacherNotices() throws Exception {
        var request=apply(4,"TEACHER",0);assertEquals(request,apply(4,"TEACHER",0));assertTrue(teaching.access(4).views().isEmpty());
        send(1,post("/api/admin/teaching/courses"),course(4),403);
        var approved=review(1,request,"APPROVE","已核对合成身份",200);assertTrue(teaching.access(4).views().isEmpty());
        send(1,post("/api/admin/teaching/courses"),course(4),200);assertEquals(List.of("TEACHER"),teaching.access(4).views());
        assertEquals(2,teaching.dispatchDueNotices());assertEquals(1,teaching.notices(4).size());
        var revoked=review(1,approved,"REVOKE","合成离岗测试",200);assertTrue(teaching.access(4).views().isEmpty());assertTrue(teaching.notices(4).isEmpty());
        mvc.perform(auth(4,get("/api/teaching/lessons").param("view","TEACHER").param("from","2026-10-16").param("to","2026-10-16"))).andExpect(status().isForbidden());
        review(1,revoked,"RESTORE","重新核对合成任课身份",200);assertEquals(List.of("TEACHER"),teaching.access(4).views());assertEquals("STUDENT",user(4).getRole());
    }
    @Test void leadershipIdentityApprovalDoesNotGrantWholeSchoolAndEachRoleNeedsSeparateApproval() throws Exception {
        var counselor=apply(5,"COUNSELOR",0);review(1,counselor,"APPROVE","",200);assertTrue(teaching.access(5).views().isEmpty());
        send(1,post("/api/admin/teaching/grants"),new TeachingService.GrantInput(5L,"COUNSELOR",classId),200);assertEquals(List.of("COUNSELOR"),teaching.access(5).views());
        send(1,post("/api/admin/teaching/grants"),new TeachingService.GrantInput(5L,"SECRETARY","合成学院"),403);
        review(1,apply(5,"SECRETARY",0),"APPROVE","",200);assertEquals(List.of("COUNSELOR"),teaching.access(5).views());
    }
    @Test void rejectedApplicantCanReapplyButStaleReviewCannotApproveNewAttempt() throws Exception {
        var request=apply(4,"TEACHER",0);review(1,request,"REJECT","请核对归属",200);var next=apply(4,"TEACHER",2);
        assertEquals(3,next.get("revision").asInt());review(1,request,"APPROVE","",409);review(1,next,"APPROVE","",200);
        assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM teaching_identity_audit",Integer.class));
    }
    @Test void anonymousForgedSubjectStaffAdminCrossSchoolAndSelfReviewAreRejected() throws Exception {
        for(String path:List.of("/api/account/teaching-identities","/api/admin/teaching-identities"))mvc.perform(get(path)).andExpect(status().isUnauthorized());
        var request=apply(9,"TEACHER",0);review(1,request,"APPROVE","",404);
        var ownAdmin=apply(1,"TEACHER",0);review(1,ownAdmin,"APPROVE","",403);
        send(4,post("/api/admin/teaching-identities/"+ownAdmin.get("id").asString()+"/review"),new TeachingIdentityService.Review(1,"APPROVE",""),403);
        send(4,post("/api/account/teaching-identities"),Map.of("role","TEACHER","revision",0,"userId",1),400);
        send(4,post("/api/account/teaching-identities"),Map.of("role","ADMIN","revision",0),400);
        send(4,post("/api/account/teaching-identities"),Map.of("role","TEACHER","revision",0.5),400);
        send(4,post("/api/account/teaching-identities"),Map.of("role","TEACHER"),400);
        when(sessions.active("identity-4",4L,"STUDENT")).thenReturn(false);
        mvc.perform(auth(4,get("/api/account/teaching-identities"))).andExpect(status().isUnauthorized());
    }
    @Test void concurrentReviewCommitsOneDecisionAndOneAudit() throws Exception {
        var request=apply(4,"TEACHER",0);var pool=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
        try {
            List<Future<Integer>> jobs=new ArrayList<>();
            for(long actor:new long[]{1,8})jobs.add(pool.submit(()->{start.await(5,TimeUnit.SECONDS);var result=mvc.perform(auth(actor,post("/api/admin/teaching-identities/"+request.get("id").asString()+"/review")).contentType("application/json").content(json.writeValueAsString(new TeachingIdentityService.Review(1,"APPROVE","")))).andReturn();return result.getResponse().getStatus();}));
            List<Integer> codes=new ArrayList<>();for(var job:jobs)codes.add(job.get(5,TimeUnit.SECONDS));Collections.sort(codes);assertEquals(List.of(200,409),codes);
            assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_identity_audit",Integer.class));
        } finally {pool.shutdownNow();assertTrue(pool.awaitTermination(3,TimeUnit.SECONDS));}
    }
    @Test void auditFailureRollsBackReviewAndRegistrationAtomically() throws Exception {
        var request=apply(4,"TEACHER",0);db.execute("ALTER TABLE teaching_identity_audit ADD CONSTRAINT synthetic_failure CHECK(new_status<>'APPROVED')");
        review(1,request,"APPROVE","",500);assertEquals("PENDING",identities.mine(4).items().get(0).status());assertEquals(1,identities.mine(4).items().get(0).revision());
        db.execute("ALTER TABLE teaching_identity_audit ADD CONSTRAINT synthetic_register_failure CHECK(actor_id<>100)");
        var data=new CreateUserRequest();data.setSchoolId(1L);data.setUsername("synthetic-rollback");data.setNickname("合成用户");data.setPassword(UUID.randomUUID().toString());data.setPrivacyAccepted(true);data.setPolicyVersion(PrivacyPolicyVersion.CURRENT);data.setTeachingIdentity("TEACHER");
        assertThrows(Exception.class,()->registration.register(data));assertNull(user(100));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM user_privacy_consents",Integer.class));
    }
    @Test void pagedReviewUsesWholeSameSchoolCountAndLiteralSearchWithoutPasswordFields() throws Exception {
        apply(4,"TEACHER",0);apply(5,"COUNSELOR",0);apply(9,"SECRETARY",0);
        var result=mvc.perform(auth(1,get("/api/admin/teaching-identities").param("size","1"))).andExpect(status().isOk()).andReturn();var page=json.readTree(result.getResponse().getContentAsString());
        assertEquals(2,page.get("total").asInt());assertEquals(2,page.get("totalPages").asInt());assertEquals(1,page.get("items").size());assertFalse(page.toString().contains("password"));
        var wildcard=identities.pending(1,"ALL",0,25,"%");assertEquals(0,wildcard.total());
        mvc.perform(auth(1,get("/api/admin/teaching-identities").param("size","101"))).andExpect(status().isBadRequest());
        var disabled=new TeachingIdentityService(db,false,clock);assertFalse(disabled.mine(4).enabled());assertTrue(disabled.mine(4).items().isEmpty());
        assertEquals("STUDENT",disabled.registrationRole(null));assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->disabled.registrationRole("TEACHER")).getStatusCode().value());
    }
    @Test void isolatedAccountRemovalDoesNotBlockExistingClosureOrEraseIdentityAudit() throws Exception {
        var request=apply(4,"TEACHER",0);review(1,request,"REJECT","合成核验未通过",200);
        db.update("DELETE FROM users WHERE id=4");
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM teaching_identity_audit",Integer.class));
        assertNull(db.queryForObject("SELECT user_id FROM teaching_identities WHERE id=?",Long.class,request.get("id").asString()));
        assertEquals(0,identities.pending(1,"ALL",0,25,"").total());review(1,request,"APPROVE","",404);
    }
}
