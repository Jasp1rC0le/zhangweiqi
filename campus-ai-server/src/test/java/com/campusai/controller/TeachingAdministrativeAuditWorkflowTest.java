package com.campusai.controller;

import com.campusai.teaching.*;
import com.campusai.security.*;
import com.campusai.user.entity.User;
import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real transactions and signed synthetic actors. No real accounts or school schema. */
@Timeout(20)
class TeachingAdministrativeAuditWorkflowTest {
    TeachingRosterWorkflowTest f;AnnotationConfigApplicationContext context;TeachingAdministrativeAuditService service;TeachingIdentityService identities;MockMvc mvc;Map<Long,String> tokens=new HashMap<>();
    javax.sql.DataSource syntheticDataSource;
    @BeforeEach void setup()throws Exception{
        f=new TeachingRosterWorkflowTest();f.syntheticDataSource=syntheticDataSource;f.setup();f.migration("2026-10-15-teaching-identities.sql");
        context=new AnnotationConfigApplicationContext();context.register(TeachingRosterWorkflowTest.Tx.class);
        context.registerBean(PlatformTransactionManager.class,()->new DataSourceTransactionManager(f.db.getDataSource()));
        context.registerBean(TeachingIdentityService.class,()->new TeachingIdentityService(f.db,true,f.clock));
        context.registerBean(TeachingAdministrativeAuditService.class,()->new TeachingAdministrativeAuditService(f.db,f.service,context.getBean(TeachingIdentityService.class),f.clock));context.refresh();
        service=context.getBean(TeachingAdministrativeAuditService.class);identities=context.getBean(TeachingIdentityService.class);
        byte[] key=new byte[64];new java.security.SecureRandom().nextBytes(key);var jwt=new JwtService(Base64.getEncoder().encodeToString(key),3600000);var sessions=mock(AuthSessionService.class);
        for(long i=1;i<=11;i++){User user=new User();user.setId(i);user.setUsername("audit-demo-"+i);user.setRole(i==1?"ADMIN":"STUDENT");tokens.put(i,jwt.generateToken(user,"audit-demo-"+i));when(sessions.active("audit-demo-"+i,i,user.getRole())).thenReturn(true);}
        mvc=MockMvcBuilders.standaloneSetup(new TeachingAdministrativeAuditController(service)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @AfterEach void close(){if(context!=null)context.close();if(f!=null)f.close();}
    TeachingAdministrativeAuditService.Filter filter(String kind,String search){return new TeachingAdministrativeAuditService.Filter(kind,LocalDate.of(2026,10,14),LocalDate.of(2026,10,14),search);}
    String path="/api/admin/teaching/operations/audit";
    void seed(){
        f.service.bindMember(1,f.studentA,new TeachingService.AccountBinding(null,2L));
        var application=identities.apply(2,new TeachingIdentityService.Apply("TEACHER",0));identities.review(1,application.id(),new TeachingIdentityService.Review(1,"APPROVE","合成审核依据"));
        f.lifecycle.transition(1,f.studentA,new TeachingLifecycleService.Transition(UUID.randomUUID().toString(),0,f.a,"TRANSFER",f.c,"合成转班依据"));
        f.db.update("UPDATE teaching_course_enrollment_modes SET mode='LEGACY' WHERE course_id=?",f.course);
        f.lifecycle.reviewModeReceipt(1,f.course,new TeachingLifecycleService.ModeRequest(UUID.randomUUID().toString(),"EXPLICIT",1,"合成来源核定"));
    }
    @Test void normalAdminReadsFiveKindsWithCompleteCountsAndStableUnionPages()throws Exception{
        seed();var all=service.page(1,filter("ALL",""),0,2);assertEquals(8,all.total());assertEquals(4,all.totalPages());
        var ids=new HashSet<String>();var kinds=new HashSet<String>();for(int p=0;p<4;p++)for(var row:service.page(1,filter("ALL",""),p,2).items()){assertTrue(ids.add(row.id()));kinds.add(row.kind());assertEquals(Instant.parse("2026-10-14T05:00:00Z"),row.recordedAt());}
        assertEquals(5,kinds.size());assertEquals(1,service.page(1,filter("STUDENT_TRANSITION",""),0,25).total());assertEquals(3,service.page(1,filter("COURSE_ENROLLMENT",""),0,25).total());
        var response=mvc.perform(get(path+"/page").param("from","2026-10-14").param("to","2026-10-14").header("Authorization","Bearer "+tokens.get(1L))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn();
        assertEquals(8,f.json.readTree(response.getResponse().getContentAsString()).get("total").asInt());
    }
    @Test void teachingViewsOrActorQueryCannotGrantNormalAdminAndOtherSchoolsCannotReadRows()throws Exception{
        seed();mvc.perform(get(path+"/access")).andExpect(status().isUnauthorized());
        for(long actor:List.of(2L,6L,7L,8L,9L))mvc.perform(get(path+"/access").param("userId","1").param("view","ADMIN").header("Authorization","Bearer "+tokens.get(actor))).andExpect(status().isForbidden());
        f.db.update("UPDATE users SET role='ADMIN' WHERE id=11");assertEquals(0,service.page(11,filter("ALL",""),0,25).total());
        f.db.update("UPDATE users SET status=0 WHERE id=1");assertEquals(403,assertThrows(ResponseStatusException.class,()->service.access(1)).getStatusCode().value());
    }
    @Test void accountDeletionAndUnbindingNeverDropIdentityOrBindingAuditAndDoNotInventOldClass(){
        seed();var before=service.page(1,filter("ALL",""),0,25);f.db.update("DELETE FROM users WHERE id=2");
        var after=service.page(1,filter("ALL",""),0,25);assertEquals(before.total(),after.total());
        var identity=service.page(1,filter("IDENTITY_REVIEW",""),0,25);assertEquals(2,identity.total());assertTrue(identity.items().stream().allMatch(r->r.target().contains("历史申请")));
        var binding=service.page(1,filter("ACCOUNT_BINDING",""),0,25).items().get(0);assertEquals("2",binding.beforeValue());assertEquals("未绑定",binding.afterValue());assertTrue(binding.historyNote().contains("未保存当时行政班"));assertFalse(binding.context().contains("行政班丙"));
        f.db.update("DELETE FROM users WHERE id=1");f.db.update("UPDATE users SET role='ADMIN' WHERE id=10");
        assertEquals(before.total(),service.page(10,filter("ALL",""),0,25).total());assertTrue(service.page(10,filter("ACCOUNT_BINDING",""),0,25).items().get(0).actorName().contains("历史操作账号"));
    }
    @Test void literalSearchBoundsAndEmptyPagesAreNotSilentTruncation(){
        for(int i=0;i<63;i++)f.db.update("INSERT INTO teaching_binding_audit VALUES(?,?,?,?,?,?,?)",UUID.randomUUID().toString(),1,f.studentA,1,null,2,Timestamp.from(f.clock.instant()));
        var ids=new HashSet<String>();for(int p=0;p<3;p++){var page=service.page(1,filter("ACCOUNT_BINDING",""),p,25);assertEquals(63,page.total());page.items().forEach(r->assertTrue(ids.add(r.id())));}assertEquals(63,ids.size());
        f.db.update("UPDATE teaching_students SET name='合成_100%同学' WHERE id=?",f.studentA);assertEquals(63,service.page(1,filter("ACCOUNT_BINDING","%"),0,25).total());assertEquals(64,service.page(1,filter("ALL","%"),0,25).total());assertEquals(0,service.page(1,filter("ALL","不存在%_"),0,25).total());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.page(1,filter("ALL",""),3,25)).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.page(1,new TeachingAdministrativeAuditService.Filter("ALL",LocalDate.of(2026,1,1),LocalDate.of(2026,12,31),""),0,25)).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.page(1,filter("ALL","x".repeat(81)),0,25)).getStatusCode().value());
    }
    @Test void featureOffCategoriesAreExplicitAndAreNeverQueriedOrReturnedAsOtherKinds(){
        var minimal=new TeachingService(f.db,f.json,true,f.clock);var disabledIdentity=new TeachingIdentityService(f.db,false,f.clock);var partial=new TeachingAdministrativeAuditService(f.db,minimal,disabledIdentity);
        assertEquals(1,partial.access(1).categories().stream().filter(TeachingAdministrativeAuditService.Category::enabled).count());
        f.db.execute("DROP TABLE teaching_identity_audit");assertEquals(0,partial.page(1,filter("ALL",""),0,25).total());
        assertEquals(503,assertThrows(ResponseStatusException.class,()->partial.page(1,filter("IDENTITY_REVIEW",""),0,25)).getStatusCode().value());
        var off=new TeachingAdministrativeAuditService(f.db,new TeachingService(f.db,f.json,false,f.clock),disabledIdentity);assertEquals(503,assertThrows(ResponseStatusException.class,()->off.access(1)).getStatusCode().value());
    }
    @Test void damagedCrossSchoolLinksFailTheWholeSelectedRangeWithoutLeakingCurrentNames(){
        seed();String foreign=UUID.randomUUID().toString();f.db.update("INSERT INTO teaching_classes VALUES(?,?,?,?,?)",foreign,2,"外校私有学院","外校私有班","synthetic");
        f.db.update("UPDATE teaching_student_transition_audit SET old_class_id=? WHERE student_id=?",foreign,f.studentA);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(1,filter("ALL",""),0,25)).getStatusCode().value());
        assertEquals(1,service.page(1,filter("ACCOUNT_BINDING",""),0,25).total());
    }
    @Test void dateRangeIsEventTimeNotCourseDateAndReadingChangesNoBusinessRows(){
        seed();int before=f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class);int notices=f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class);
        var original=service.page(1,filter("ALL",""),0,25);f.clock.value=f.clock.value.plusSeconds(86400);assertEquals(original,service.page(1,filter("ALL",""),0,25));
        assertEquals(0,service.page(1,new TeachingAdministrativeAuditService.Filter("ALL",LocalDate.of(2026,10,15),LocalDate.of(2026,10,15),""),0,25).total());
        assertEquals(before,f.db.queryForObject("SELECT COUNT(*) FROM teaching_attendance",Integer.class));assertEquals(notices,f.db.queryForObject("SELECT COUNT(*) FROM teaching_notices",Integer.class));
    }
    @Test void unknownAuditStatesAreNotRenderedAsSuccessfulBusinessEvents(){
        seed();f.db.update("UPDATE teaching_identity_audit SET new_status='BROKEN' WHERE new_status='APPROVED'");
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(1,filter("IDENTITY_REVIEW",""),0,25)).getStatusCode().value());
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.page(1,filter("ALL",""),0,25)).getStatusCode().value());
        assertEquals(1,service.page(1,filter("COURSE_SOURCE",""),0,25).total());
    }
}
