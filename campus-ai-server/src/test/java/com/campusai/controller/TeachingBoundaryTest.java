package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import com.campusai.teaching.TeachingService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Timeout(10)
class TeachingBoundaryTest {
    TeachingService service; MockMvc mvc; AuthSessionService sessions;
    @BeforeEach void setup() {
        service=mock(TeachingService.class); sessions=mock(AuthSessionService.class);
        var jwt=mock(JwtService.class); var claims=mock(Claims.class);
        when(claims.getSubject()).thenReturn("1"); when(claims.get("role",String.class)).thenReturn("STUDENT"); when(claims.get("sid",String.class)).thenReturn("synthetic");
        when(jwt.parseToken("synthetic-only")).thenReturn(claims); when(sessions.active("synthetic",1L,"STUDENT")).thenReturn(true);
        var json=new ObjectMapper();
        mvc=MockMvcBuilders.standaloneSetup(new TeachingController(service,json),new AdminTeachingController(service,json)).setControllerAdvice(new GlobalExceptionHandler()).addFilters(new ApiBoundaryFilter("http://localhost:5173")).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
    }
    @Test void anonymousAndRevokedSessionsNeverReachPrivateData() throws Exception {
        for(String path:new String[]{"/api/teaching/access","/api/teaching/notices","/api/teaching/my-day","/api/admin/teaching/classes"}) mvc.perform(get(path)).andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control","no-store"));
        when(sessions.active("synthetic",1L,"STUDENT")).thenReturn(false);
        mvc.perform(get("/api/teaching/notices").header("Authorization","Bearer synthetic-only")).andExpect(status().isUnauthorized()); verifyNoInteractions(service);
    }
    @Test void studentCannotConfigureEvenWithClientClaimAndCrossOriginWritesStopBeforeParse() throws Exception {
        mvc.perform(post("/api/admin/teaching/grants").header("Authorization","Bearer synthetic-only").contentType("application/json").content("{\"viewRole\":\"SECRETARY\",\"userId\":1}")) .andExpect(status().isForbidden());
        mvc.perform(put("/api/teaching/lessons/00000000-0000-4000-8000-000000000001/attendance").header("Authorization","Bearer synthetic-only").header("Origin","https://untrusted.example").contentType("application/json").content("bad")) .andExpect(status().isForbidden()); verifyNoInteractions(service);
    }
    @Test void principalIsTakenFromVerifiedSessionNotQueryAndBodiesAreStrictAndBounded() throws Exception {
        when(service.access(1L)).thenReturn(new TeachingService.Access(false,java.util.List.of()));
        mvc.perform(get("/api/teaching/access?userId=2").header("Authorization","Bearer synthetic-only")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")); verify(service).access(1L);
        String path="/api/teaching/lessons/00000000-0000-4000-8000-000000000001/attendance";
        for(String body:new String[]{"{\"revision\":0.5,\"marks\":[],\"reason\":\"\",\"finish\":false}","{\"role\":\"ADMIN\"}","bad"}) mvc.perform(put(path).header("Authorization","Bearer synthetic-only").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        mvc.perform(put(path).header("Authorization","Bearer synthetic-only").contentType("application/json").content("x".repeat(100001))).andExpect(status().isPayloadTooLarge());
        verifyNoMoreInteractions(service);
    }
}
