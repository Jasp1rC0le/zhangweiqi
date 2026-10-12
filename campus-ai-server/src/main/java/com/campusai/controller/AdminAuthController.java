package com.campusai.controller;

import com.campusai.dto.LoginRequest;
import com.campusai.dto.LoginResponse;
import com.campusai.dto.UserResponse;
import com.campusai.exception.InvalidCredentialsException;
import com.campusai.security.JwtService;
import com.campusai.security.AuthSessionService;
import com.campusai.security.AuthCookieFactory;
import com.campusai.security.LoginThrottle;
import jakarta.servlet.http.HttpServletRequest;
import com.campusai.service.AuthService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {
    private final AuthService authService;
    private final JwtService jwtService;
    private final AuthSessionService sessions;
    private final AuthCookieFactory cookies;
    private final LoginThrottle throttle;

    public AdminAuthController(AuthService authService, JwtService jwtService,
            AuthSessionService sessions, AuthCookieFactory cookies, LoginThrottle throttle) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.sessions = sessions;
        this.cookies = cookies;
        this.throttle = throttle;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest) {
        throttle.check(request.getUsername(), servletRequest);
        User user = authService.login(request);
        if (!"ADMIN".equals(user.getRole()) || user.getStatus() == null || user.getStatus() != 1) {
            throw new InvalidCredentialsException("管理员账号或密码错误");
        }
        throttle.succeeded(request.getUsername());
        return issued(sessions.issue(user));
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(
            @CookieValue(name = "campus_admin_refresh", required = false) String refreshToken) {
        return issued(sessions.refresh(refreshToken, true));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "campus_admin_refresh", required = false) String refreshToken,
            HttpServletRequest servletRequest) {
        sessions.revoke(refreshToken);
        sessions.revokeAccessToken(servletRequest.getHeader(HttpHeaders.AUTHORIZATION));
        return ResponseEntity.status(HttpStatus.NO_CONTENT)
                .header(HttpHeaders.SET_COOKIE, cookies.clear(true)).build();
    }

    private ResponseEntity<LoginResponse> issued(AuthSessionService.IssuedSession session) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookies.set(session.refreshToken(), true))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new LoginResponse(session.accessToken(), "Bearer",
                        jwtService.getExpirationSeconds(), UserResponse.from(session.user())));
    }
}
