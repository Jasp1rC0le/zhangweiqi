package com.campusai.controller;

import com.campusai.dto.LoginRequest;
import com.campusai.exception.InvalidCredentialsException;
import com.campusai.security.JwtService;
import com.campusai.security.AuthSessionService;
import com.campusai.security.AuthCookieFactory;
import com.campusai.security.LoginThrottle;
import jakarta.servlet.http.HttpServletRequest;
import com.campusai.service.AuthService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AdminAuthControllerTest {
    private final AuthService authService = mock(AuthService.class);
    private final JwtService jwtService = mock(JwtService.class);
    private final AuthSessionService sessions = mock(AuthSessionService.class);
    private final AuthCookieFactory cookies = mock(AuthCookieFactory.class);
    private final LoginThrottle throttle = mock(LoginThrottle.class);
    private final HttpServletRequest servletRequest = mock(HttpServletRequest.class);
    private final AdminAuthController controller = new AdminAuthController(authService, jwtService, sessions, cookies, throttle);

    @Test
    void rejectsStudentWithoutIssuingToken() {
        LoginRequest request = new LoginRequest();
        request.setUsername("student");
        request.setPassword("password");
        User student = new User();
        student.setRole("STUDENT");
        student.setStatus(1);
        when(authService.login(request)).thenReturn(student);

        assertThatThrownBy(() -> controller.login(request, servletRequest))
                .isInstanceOf(InvalidCredentialsException.class);
        verifyNoInteractions(jwtService);
    }

    @Test
    void issuesTokenForActiveAdministrator() {
        LoginRequest request = new LoginRequest();
        request.setUsername("admin");
        request.setPassword("password");
        User admin = new User();
        admin.setId(1L);
        admin.setUsername("admin");
        admin.setRole("ADMIN");
        admin.setStatus(1);
        when(authService.login(request)).thenReturn(admin);
        when(sessions.issue(admin)).thenReturn(new AuthSessionService.IssuedSession(
                "admin-token", "refresh-token", admin));
        when(jwtService.getExpirationSeconds()).thenReturn(7200L);

        var response = controller.login(request, servletRequest).getBody();

        assertThat(response).isNotNull();
        assertThat(response.getToken()).isEqualTo("admin-token");
        assertThat(response.getUser().getRole()).isEqualTo("ADMIN");
    }

    @Test
    void logoutRevokesCookieAndBearerSession() {
        when(servletRequest.getHeader("Authorization")).thenReturn("Bearer access-token");

        var response = controller.logout("refresh-token", servletRequest);

        assertThat(response.getStatusCode().value()).isEqualTo(204);
        verify(sessions).revoke("refresh-token");
        verify(sessions).revokeAccessToken("Bearer access-token");
    }
}
