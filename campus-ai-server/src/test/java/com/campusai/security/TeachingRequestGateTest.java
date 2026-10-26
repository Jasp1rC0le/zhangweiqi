package com.campusai.security;

import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Timeout(10)
class TeachingRequestGateTest {
    final AtomicLong nanos=new AtomicLong();
    TeachingRequestGate gate(int slots,int users,int burst){return new TeachingRequestGate(true,slots,users,burst,burst,60,30,nanos::get);}
    MockHttpServletRequest request(long user,String method){var r=new MockHttpServletRequest(method,"/api/timetable/unified/page");r.setAttribute("currentUserId",user);return r;}
    @Test void concurrentCapIsFailFastAndEveryRequestReleasesOnlyItsOwnPermitOnce() {
        var gate=gate(2,100,10);var response=new MockHttpServletResponse();var a=request(1,"GET");var b=request(2,"GET");var c=request(3,"GET");
        assertTrue(gate.preHandle(a,response,null));assertTrue(gate.preHandle(a,response,null));assertTrue(gate.preHandle(b,response,null));
        var error=assertThrows(ResponseStatusException.class,()->gate.preHandle(c,response,null));assertEquals(503,error.getStatusCode().value());assertEquals("2",response.getHeader("Retry-After"));
        gate.afterCompletion(a,response,null,new IllegalStateException());gate.afterCompletion(a,response,null,null);assertEquals(1,gate.available());assertTrue(gate.preHandle(c,response,null));gate.afterCompletion(b,response,null,null);gate.afterCompletion(c,response,null,null);assertEquals(2,gate.available());
    }
    @Test void userReadAndWriteBucketsAreIndependentAndRefillWithoutGrowingTheVisitorMap() {
        var gate=gate(2,2,1);var response=new MockHttpServletResponse();
        for(String method:List.of("GET","POST")){var r=request(1,method);gate.preHandle(r,response,null);gate.afterCompletion(r,response,null,null);assertEquals(429,assertThrows(ResponseStatusException.class,()->gate.preHandle(request(1,method),response,null)).getStatusCode().value());assertEquals(2,gate.available());}
        nanos.set(TimeUnit.SECONDS.toNanos(2));var next=request(1,"POST");assertTrue(gate.preHandle(next,response,null));gate.afterCompletion(next,response,null,null);assertEquals(1,gate.tracked());
        var b=request(2,"GET");gate.preHandle(b,response,null);gate.afterCompletion(b,response,null,null);assertEquals(503,assertThrows(ResponseStatusException.class,()->gate.preHandle(request(3,"GET"),response,null)).getStatusCode().value());
        nanos.set(TimeUnit.MINUTES.toNanos(11));var c=request(3,"GET");gate.preHandle(c,response,null);gate.afterCompletion(c,response,null,null);assertEquals(1,gate.tracked());
    }
    @Test void anonymousAndPreflightCannotOccupySlotsOrAllocateUserBuckets() {
        var gate=gate(2,20,10);var response=new MockHttpServletResponse();assertThrows(com.campusai.exception.UnauthorizedException.class,()->gate.preHandle(new MockHttpServletRequest("GET","/api/timetable/unified/page"),response,null));
        assertTrue(gate.preHandle(new MockHttpServletRequest("OPTIONS","/api/timetable/unified/page"),response,null));assertEquals(2,gate.available());assertEquals(0,gate.tracked());
    }
    @Test void simultaneousNewVisitorsRespectExactMemoryCap() throws Exception {
        var gate=gate(16,2,10);var pool=Executors.newFixedThreadPool(8);var start=new CyclicBarrier(8);List<Future<Boolean>> jobs=new ArrayList<>();
        try {for(int i=1;i<=8;i++){long user=i;jobs.add(pool.submit(()->{start.await(3,TimeUnit.SECONDS);var r=request(user,"GET");var response=new MockHttpServletResponse();try{return gate.preHandle(r,response,null);}catch(ResponseStatusException e){return false;}finally{gate.afterCompletion(r,response,null,null);}}));}for(var job:jobs)job.get(3,TimeUnit.SECONDS);assertEquals(2,gate.tracked());assertEquals(16,gate.available());}
        finally {pool.shutdownNow();assertTrue(pool.awaitTermination(2,TimeUnit.SECONDS));}
    }
    @RestController static class Controller {
        @GetMapping("/api/timetable/test") Map<String,Boolean> read(){return Map.of("ok",true);}
        @GetMapping("/api/admin/teaching/test") void admin(){}
    }
    @Test void realMvcRunsAuthenticationBeforeAdmissionAndExceptionsDoNotLeakPermits() throws Exception {
        var gate=gate(2,20,1);var jwt=mock(JwtService.class);var sessions=mock(AuthSessionService.class);var claims=mock(io.jsonwebtoken.Claims.class);
        when(jwt.parseToken("synthetic")).thenReturn(claims);when(claims.getSubject()).thenReturn("1");when(claims.get("role",String.class)).thenReturn("STUDENT");when(claims.get("sid",String.class)).thenReturn("mock-session");when(sessions.active("mock-session",1L,"STUDENT")).thenReturn(true);
        var mvc=MockMvcBuilders.standaloneSetup(new Controller()).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions),gate).build();
        mvc.perform(get("/api/timetable/test")).andExpect(status().isUnauthorized());assertEquals(0,gate.tracked());
        mvc.perform(get("/api/admin/teaching/test").header("Authorization","Bearer synthetic")).andExpect(status().isForbidden());assertEquals(0,gate.tracked());
        mvc.perform(get("/api/timetable/test").header("Authorization","Bearer synthetic")).andExpect(status().isOk());assertEquals(2,gate.available());
        mvc.perform(get("/api/timetable/test").header("Authorization","Bearer synthetic")).andExpect(status().isTooManyRequests()).andExpect(header().string("Cache-Control","no-store"));assertEquals(2,gate.available());
    }
}
