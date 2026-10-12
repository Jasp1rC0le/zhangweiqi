package com.campusai.security;

import com.campusai.exception.UnauthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JwtInterceptorTest {

    @Test
    void rejectsStudentAtEveryAdminPathEvenWithValidSession() {
        JwtService jwt = mock(JwtService.class);
        AuthSessionService sessions = mock(AuthSessionService.class);
        var claims = mock(io.jsonwebtoken.Claims.class);
        when(jwt.parseToken("valid")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("7");
        when(claims.get("sid", String.class)).thenReturn("session");
        when(claims.get("role", String.class)).thenReturn("STUDENT");
        when(sessions.active("session", 7L, "STUDENT")).thenReturn(true);
        var request = mock(HttpServletRequest.class);
        when(request.getHeader("Authorization")).thenReturn("Bearer valid");
        when(request.getRequestURI()).thenReturn("/api/admin/future-feature");
        assertThatThrownBy(() -> new JwtInterceptor(jwt, sessions).preHandle(request, mock(HttpServletResponse.class), new Object()))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void adminUsesExistingSessionAndRevokedSessionsCannotEnter() {
        JwtService jwt = mock(JwtService.class);
        AuthSessionService sessions = mock(AuthSessionService.class);
        var claims = mock(io.jsonwebtoken.Claims.class);
        when(jwt.parseToken("valid")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("7");
        when(claims.get("sid", String.class)).thenReturn("existing-session");
        when(claims.get("role", String.class)).thenReturn("ADMIN");
        when(sessions.active("existing-session", 7L, "ADMIN")).thenReturn(true);
        var request = mock(HttpServletRequest.class);
        var response = mock(HttpServletResponse.class);
        when(request.getHeader("Authorization")).thenReturn("Bearer valid");
        when(request.getRequestURI()).thenReturn("/api/admin/overview");
        var interceptor = new JwtInterceptor(jwt, sessions);
        assertThat(interceptor.preHandle(request, response, new Object())).isTrue();
        org.mockito.Mockito.verify(request).setAttribute("currentSessionId", "existing-session");
        org.mockito.Mockito.verify(response).setHeader("Cache-Control", "no-store");
        when(sessions.active("existing-session", 7L, "ADMIN")).thenReturn(false);
        assertThatThrownBy(() -> interceptor.preHandle(request, response, new Object())).isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void shouldAllowAnonymousContactSubmission() {
        JwtService jwtService = mock(JwtService.class);
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/api/contact-messages");

        boolean allowed = new JwtInterceptor(jwtService, mock(AuthSessionService.class))
                .preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
        verifyNoInteractions(jwtService);
    }

    @Test
    void shouldRejectProtectedRequestWithoutToken() {
        JwtService jwtService = mock(JwtService.class);
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(request.getMethod()).thenReturn("GET");
        when(request.getHeader("Authorization")).thenReturn(null);

        assertThatThrownBy(() -> new JwtInterceptor(jwtService, mock(AuthSessionService.class))
                .preHandle(request, response, new Object()))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessageContaining("缺少有效的登录令牌");
    }

    @Test void signedInContactMustValidateTokenRatherThanBecomeAnonymous() {
        var jwt = mock(JwtService.class);
        var sessions = mock(AuthSessionService.class);
        var request = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/contact-messages");
        request.addHeader("Authorization","Bearer valid");
        var claims = mock(io.jsonwebtoken.Claims.class);
        when(jwt.parseToken("valid")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("7");
        when(claims.get("sid",String.class)).thenReturn("session");
        when(claims.get("role",String.class)).thenReturn("STUDENT");
        when(sessions.active("session",7L,"STUDENT")).thenReturn(true);
        var interceptor = new JwtInterceptor(jwt,sessions);
        interceptor.preHandle(request,new org.springframework.mock.web.MockHttpServletResponse(),new Object());
        assertThat(request.getAttribute("currentUserId")).isEqualTo(7L);
        when(sessions.active("session",7L,"STUDENT")).thenReturn(false);
        assertThatThrownBy(()->interceptor.preHandle(request,new org.springframework.mock.web.MockHttpServletResponse(),new Object())).isInstanceOf(UnauthorizedException.class);
    }
}
