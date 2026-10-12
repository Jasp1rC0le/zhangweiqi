package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.AuthSessionService;
import com.campusai.security.JwtInterceptor;
import com.campusai.security.JwtService;
import com.campusai.service.ContactMessageService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ContactMessageControllerTest {
    @Test void capabilitiesRequireSessionAndSubmissionUsesServerIdentity() throws Exception {
        var service=mock(ContactMessageService.class);var jwt=mock(JwtService.class);var sessions=mock(AuthSessionService.class);var claims=mock(Claims.class);
        when(claims.getSubject()).thenReturn("7");when(claims.get("role",String.class)).thenReturn("STUDENT");when(claims.get("sid",String.class)).thenReturn("session");when(jwt.parseToken("test")).thenReturn(claims);when(sessions.active("session",7L,"STUDENT")).thenReturn(true);
        var mvc=MockMvcBuilders.standaloneSetup(new ContactMessageController(service)).setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        mvc.perform(get("/api/contact-messages/capabilities")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/contact-messages/capabilities").header("Authorization","Bearer test"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.requestIdVersion").value(1));
        String data="{\"name\":\"同学\",\"contact\":\"test@example.invalid\",\"subject\":\"建议\",\"message\":\"测试内容\",\"userId\":999,\"requestId\":\"%s\"}";
        mvc.perform(post("/api/contact-messages").header("Authorization","Bearer test").contentType("application/json").content(data.formatted("invalid"))).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
        mvc.perform(post("/api/contact-messages").header("Authorization","Bearer test").contentType("application/json").content(data.formatted("11111111-1111-4111-8111-111111111111"))).andExpect(status().isCreated());
        verify(service).submit(argThat(r->r.getRequestId().equals("11111111-1111-4111-8111-111111111111")),eq(7L));
    }
}
