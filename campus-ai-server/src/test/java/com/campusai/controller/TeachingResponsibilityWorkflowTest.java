package com.campusai.controller;

import com.campusai.teaching.*;
import com.campusai.security.*;
import com.campusai.user.entity.User;
import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** H2 synthetic fixtures, actual transactions/controllers and signed synthetic sessions only. */
@Timeout(25)
class TeachingResponsibilityWorkflowTest {
    TeachingRosterWorkflowTest f;AnnotationConfigApplicationContext context;TeachingResponsibilityService service;
    TeachingIdentityService identities;TeachingAdministrativeAuditService audit;MockMvc mvc;Map<Long,String> tokens=new HashMap<>();
    String root="/api/admin/teaching/responsibilities";
    javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{
        f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();f.migration("2026-10-15-teaching-identities.sql");f.migration("2026-10-17-teaching-responsibilities.sql");
        context=new AnnotationConfigApplicationContext();context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("synthetic-flags",Map.of("app.teaching.responsibility-enabled","true")));
        context.register(TeachingRosterWorkflowTest.Tx.class);context.registerBean(PlatformTransactionManager.class,()->new DataSourceTransactionManager(f.db.getDataSource()));
        context.registerBean(TeachingIdentityService.class,()->new TeachingIdentityService(f.db,true,f.clock));
        context.registerBean(TeachingResponsibilityService.class,()->new TeachingResponsibilityService(f.db,f.service,context.getBean(TeachingIdentityService.class),true,f.clock));
        context.registerBean(TeachingAdministrativeAuditService.class,()->new TeachingAdministrativeAuditService(f.db,f.service,context.getBean(TeachingIdentityService.class),f.clock));context.refresh();
        identities=context.getBean(TeachingIdentityService.class);service=context.getBean(TeachingResponsibilityService.class);audit=context.getBean(TeachingAdministrativeAuditService.class);
        TeachingService actualTeaching=AopTestUtils.getTargetObject(f.service);
        ReflectionTestUtils.setField(actualTeaching,"responsibilityEnabled",true);
        approve(7,"COUNSELOR");approve(8,"SECRETARY");
        var key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=mock(AuthSessionService.class);
        for(long id:List.of(1L,7L,8L,11L)){User user=new User();user.setId(id);user.setUsername("synthetic-"+id);user.setRole(id==1?"ADMIN":"STUDENT");tokens.put(id,jwt.generateToken(user,"scope-demo-"+id));when(sessions.active("scope-demo-"+id,id,user.getRole())).thenReturn(true);}
        mvc=MockMvcBuilders.standaloneSetup(new TeachingResponsibilityController(service,f.json),new AdminTeachingController(f.service,f.json)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    void approve(long user,String role){var item=identities.apply(user,new TeachingIdentityService.Apply(role,0));identities.review(1,item.id(),new TeachingIdentityService.Review(1,"APPROVE","模拟审核"));}
    @AfterEach void close(){if(context!=null)context.close();if(f!=null)f.close();}
    TeachingResponsibilityService.Change input(long user,String role,String key,int revision,String action,String reason){return new TeachingResponsibilityService.Change(UUID.randomUUID().toString(),user,role,key,revision,action,reason);}
    int code(Runnable action){return assertThrows(ResponseStatusException.class,action::run).getStatusCode().value();}
    int count(String table){return f.db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class);}
    @Test void revokeImmediatelyRemovesOnlyTheNamedScopeAndNeverErasesAttendance(){
        var current=service.check(1,7,"COUNSELOR",f.a);assertTrue(current.active());assertEquals(0,current.revision());assertTrue(current.baselineNote().contains("迁移"));
        int records=count("teaching_attendance"),notices=count("teaching_notices");
        var receipt=service.change(1,input(7,"COUNSELOR",f.a,0,"REVOKE","模拟负责范围交接"));
        assertFalse(receipt.newActive());assertEquals(1,receipt.revision());assertEquals(403,code(()->f.service.lessons(7,"COUNSELOR",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14))));
        assertEquals(records,count("teaching_attendance"));assertEquals(notices,count("teaching_notices"));assertTrue(service.check(1,8,"SECRETARY","合成学院甲").active());
        assertEquals("STUDENT",f.db.queryForObject("SELECT role FROM users WHERE id=7",String.class));
    }
    @Test void approvedIdentityIsRequiredForGrantButNotForRemovingARevokedIdentity(){
        assertEquals(403,code(()->service.change(1,input(10,"COUNSELOR",f.a,0,"GRANT","模拟负责配置"))));
        approve(10,"COUNSELOR");var grant=service.change(1,input(10,"COUNSELOR",f.a,0,"GRANT","模拟负责配置"));assertEquals(1,grant.revision());
        var item=identities.mine(10).items().get(0);identities.review(1,item.id(),new TeachingIdentityService.Review(item.revision(),"REVOKE","模拟身份撤销"));
        assertEquals(2,service.change(1,input(10,"COUNSELOR",f.a,1,"REVOKE","模拟清除保留范围")).revision());
        assertEquals(409,code(()->service.change(1,input(10,"COUNSELOR",f.a,0,"GRANT","旧版本不能覆盖"))));
    }
    @Test void secretaryRevokesOnlyOneCollegeWithoutRemovingAnotherCollegeOrTeacherAccess(){
        service.change(1,input(8,"SECRETARY","合成学院乙",0,"GRANT","模拟兼任学院负责"));
        service.change(1,input(8,"SECRETARY","合成学院甲",1,"REVOKE","模拟移交一个学院"));
        var remaining=service.page(1,8,"SECRETARY",0,25);assertEquals(1,remaining.total());assertEquals("合成学院乙",remaining.items().get(0).scopeKey());
        var date=LocalDate.of(2026,10,14);
        assertEquals(1,f.service.lessonPage(8,"SECRETARY",date,date,null,0,25).summary().counts().total());
        assertEquals(2,f.service.lessonPage(6,"TEACHER",date,date,null,0,25).summary().counts().total());
        assertTrue(service.check(1,7,"COUNSELOR",f.a).active());assertEquals(2,count("teaching_grant_audit"));
    }
    @Test void immutableRequestReceiptIsIdempotentAndCannotBeBorrowedOrRewritten(){
        var input=input(7,"COUNSELOR",f.a,0,"REVOKE","模拟精确撤销");var one=service.change(1,input);assertEquals(one,service.change(1,input));assertEquals(1,count("teaching_grant_audit"));
        assertEquals(409,code(()->service.change(1,new TeachingResponsibilityService.Change(input.requestId(),7,"COUNSELOR",f.a,0,"REVOKE","另一内容"))));
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");assertEquals(404,code(()->service.request(10,input.requestId())));
        assertEquals(409,code(()->service.change(10,input)));assertEquals(one,service.request(1,input.requestId()));
        assertEquals(409,code(()->service.change(1,input(7,"COUNSELOR",f.a,1,"REVOKE","已撤销不冒认成功"))));
    }
    @Test void competingAdminsUseARealVersionAndOnlyOneMutationCommits()throws Exception{
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");var pool=Executors.newFixedThreadPool(2);
        try{var gate=new CountDownLatch(1);List<Future<Integer>> jobs=new ArrayList<>();for(long actor:List.of(1L,10L))jobs.add(pool.submit(()->{gate.await();try{service.change(actor,input(7,"COUNSELOR",f.c,0,"GRANT","模拟并发配置"));return 200;}catch(ResponseStatusException failure){return failure.getStatusCode().value();}}));gate.countDown();var results=new ArrayList<Integer>();for(var job:jobs)results.add(job.get(8,TimeUnit.SECONDS));Collections.sort(results);assertEquals(List.of(200,409),results);assertEquals(1,count("teaching_grant_audit"));assertEquals(1,service.check(1,7,"COUNSELOR",f.c).revision());}
        finally{pool.shutdownNow();assertTrue(pool.awaitTermination(5,TimeUnit.SECONDS));}
    }
    @Test void auditFailureRollsBackTheGrantAndTheVersion(){
        f.db.execute("ALTER TABLE teaching_grant_audit ADD CONSTRAINT synthetic_audit_failure CHECK(reason<>'模拟审计失败')");
        assertThrows(org.springframework.dao.DataAccessException.class,()->service.change(1,input(7,"COUNSELOR",f.a,0,"REVOKE","模拟审计失败")));
        var unchanged=service.check(1,7,"COUNSELOR",f.a);assertTrue(unchanged.active());assertEquals(0,unchanged.revision());assertEquals(0,count("teaching_grant_audit"));
    }
    @Test void completeScopePaginationHasNoFiveHundredArrayAndNoCrossSchoolLeak(){
        for(int n=0;n<124;n++){String id=UUID.randomUUID().toString();f.db.update("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",id,1,"模拟分页学院","模拟分页班"+n,"scope-fixture-"+n);f.db.update("INSERT INTO teaching_grants VALUES(?,?,?,?)",1,7,"COUNSELOR",id);}
        Set<String> seen=new HashSet<>();for(int page=0;page<5;page++){var result=service.page(1,7,"COUNSELOR",page,25);assertEquals(125,result.total());for(var item:result.items())assertTrue(seen.add(item.scopeKey()));}assertEquals(125,seen.size());
        assertEquals(409,code(()->service.page(1,7,"COUNSELOR",5,25)));assertEquals(400,code(()->service.page(1,7,"COUNSELOR",0,101)));
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=11");assertEquals(404,code(()->service.page(11,7,"COUNSELOR",0,25)));
        assertEquals(0,service.page(11,11,"COUNSELOR",0,25).total());
    }
    @Test void centralAuditAndCsvRetainSnapshotsWhenTargetAndActorAccountsAreDeleted(){
        var input=input(7,"COUNSELOR",f.a,0,"REVOKE","模拟历史留存");service.change(1,input);
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");f.db.update("DELETE FROM users WHERE id IN (1,7)");
        var filter=new TeachingAdministrativeAuditService.Filter("RESPONSIBILITY",LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),"");
        var page=audit.page(10,filter,0,25);assertEquals(1,page.total());var row=page.items().get(0);assertTrue(row.target().contains("模拟账号7"));assertTrue(row.actorName().contains("模拟账号1"));assertTrue(row.context().contains("行政班甲"));assertEquals("REVOKE",row.action());
        var preview=audit.preview(10,filter);var artifact=audit.download(10,new TeachingAdministrativeAuditService.ExportRequest(preview.token()));String csv=new String(artifact.bytes(),java.nio.charset.StandardCharsets.UTF_8);assertTrue(csv.contains("模拟历史留存"));assertTrue(csv.contains("负责范围使用当次快照"));assertTrue(csv.contains("对象（见历史依据）"));
    }
    @Test void controllerChecksRealAdminAndLegacyWritesCannotBypassTheNewWorkflow()throws Exception{
        mvc.perform(get(root+"/access")).andExpect(status().isUnauthorized());mvc.perform(get(root+"/access").header("Authorization","Bearer "+tokens.get(7L))).andExpect(status().isForbidden());
        mvc.perform(get(root+"/check").param("userId","7").param("viewRole","COUNSELOR").param("scopeKey",f.a).header("Authorization","Bearer "+tokens.get(1L))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(post("/api/admin/teaching/grants/revoke").contentType("application/json").content(f.json.writeValueAsString(new TeachingService.GrantInput(7L,"COUNSELOR",f.a))).header("Authorization","Bearer "+tokens.get(1L))).andExpect(status().isConflict());
        var bad=input(7,"COUNSELOR",f.a,0,"REVOKE","");mvc.perform(post(root+"/change").contentType("application/json").content(f.json.writeValueAsString(bad)).header("Authorization","Bearer "+tokens.get(1L))).andExpect(status().isBadRequest());assertTrue(service.check(1,7,"COUNSELOR",f.a).active());
    }
    @Test void featureOffAndMissingBaselineAreExplicitNotPartialSuccess(){
        var off=new TeachingResponsibilityService(f.db,f.service,identities,false,f.clock);assertFalse(off.access(1).enabled());assertEquals(503,code(()->off.check(1,7,"COUNSELOR",f.a)));
        f.db.update("DELETE FROM teaching_grant_versions WHERE user_id=7");assertEquals(503,code(()->service.page(1,7,"COUNSELOR",0,25)));assertEquals(0,count("teaching_grant_audit"));
    }
    @Test void revisionDoesNotWrapAndControlCharactersCannotEnterTheAudit(){
        assertEquals(400,code(()->service.change(1,input(7,"COUNSELOR",f.a,0,"REVOKE","模拟\u0085控制字符"))));
        f.db.update("UPDATE teaching_grant_versions SET revision=? WHERE user_id=7",Integer.MAX_VALUE);
        assertEquals(409,code(()->service.change(1,input(7,"COUNSELOR",f.a,Integer.MAX_VALUE,"REVOKE","模拟上限"))));
        assertTrue(service.check(1,7,"COUNSELOR",f.a).active());assertEquals(0,count("teaching_grant_audit"));
    }
}
