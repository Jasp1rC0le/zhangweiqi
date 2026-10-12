package com.campusai.controller;
import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.project.ProjectReviewService;
import com.campusai.security.*;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class ProjectReviewControllerTest {
    @Test void requiresSessionValidatesPayloadAndIgnoresForgedOwner() throws Exception {
        var service=mock(ProjectReviewService.class);var jwt=mock(JwtService.class);var sessions=mock(AuthSessionService.class);var claims=mock(Claims.class);
        when(claims.getSubject()).thenReturn("7");when(claims.get("role",String.class)).thenReturn("STUDENT");when(claims.get("sid",String.class)).thenReturn("session");when(jwt.parseToken("test")).thenReturn(claims);when(sessions.active("session",7L,"STUDENT")).thenReturn(true);
        var mvc=MockMvcBuilders.standaloneSetup(new ProjectReviewController(service)).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        mvc.perform(get("/api/project-reviews")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/projects/p/reviews").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/project-reviews?ownerId=999").header("Authorization","Bearer test")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).incoming(7L);
        mvc.perform(post("/api/projects/p/reviews").header("Authorization","Bearer test").contentType("application/json").content("{\"requestId\":\"request\",\"revision\":1,\"recipient\":\"peer\",\"includeMaterial\":false,\"includeData\":false,\"ownerId\":999}")).andExpect(status().isOk());
        verify(service).create(7L,"p","request",1,"peer",false,false);
        clearInvocations(service);
        mvc.perform(put("/api/project-reviews/id").header("Authorization","Bearer test").contentType("application/json").content("{\"note\":\"\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
        mvc.perform(put("/api/project-reviews/id").header("Authorization","Bearer test").contentType("application/json").content("{\"note\":\"修改意见\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
        mvc.perform(put("/api/project-reviews/id").header("Authorization","Bearer test").contentType("application/json").content("{\"note\":\"修改意见\",\"baseNote\":\"原意见\",\"reviewer\":999}")).andExpect(status().isNoContent());
        verify(service).review(7L,"id","修改意见","原意见");
    }
}
