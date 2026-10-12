package com.campusai.controller;

import com.campusai.exception.GlobalExceptionHandler;
import com.campusai.security.*;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDateTime;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountSessionControllerTest {
    @Test void sessionManagementUsesVerifiedIdentityNotRequestFields() throws Exception {
        var service = mock(AccountSessionService.class); var jwt = mock(JwtService.class);
        var sessions = mock(AuthSessionService.class); var claims = mock(Claims.class);
        when(jwt.parseToken("test")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("7"); when(claims.get("sid", String.class)).thenReturn("current");
        when(claims.get("role", String.class)).thenReturn("STUDENT");
        when(sessions.active("current", 7L, "STUDENT")).thenReturn(true);
        var time = LocalDateTime.of(2026, 9, 23, 10, 0);
        when(service.list(7L, "current")).thenReturn(List.of(new AccountSessionService.SessionInfo(time, time.plusDays(1), true)));
        when(service.revokeOthers(7L,"current")).thenReturn(2);
        var mvc = MockMvcBuilders.standaloneSetup(new AccountSessionController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new JwtInterceptor(jwt,sessions)).build();
        mvc.perform(get("/api/account/sessions")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/account/sessions/revoke-others")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
        mvc.perform(get("/api/account/sessions?userId=99").header("Authorization","Bearer test"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$[0].current").value(true)).andExpect(jsonPath("$[0].id").doesNotExist())
                .andExpect(jsonPath("$[0].refreshToken").doesNotExist());
        mvc.perform(post("/api/account/sessions/revoke-others").header("Authorization","Bearer test")
                .contentType("application/json").content("{\"userId\":99,\"sessionId\":\"other\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revoked").value(2));
        verify(service).revokeOthers(7L,"current");
        verify(service).list(7L,"current");
        verifyNoMoreInteractions(service);
    }
}
