package com.campusai.controller;

import com.campusai.dto.LoginRequest;
import com.campusai.dto.LoginResponse;
import com.campusai.dto.UserResponse;
import com.campusai.exception.UnauthorizedException;
import com.campusai.security.JwtService;
import com.campusai.security.AuthSessionService;
import com.campusai.security.AuthCookieFactory;
import com.campusai.security.LoginThrottle;
import com.campusai.security.AccountRecoveryService;
import jakarta.servlet.http.HttpServletRequest;
import com.campusai.service.AuthService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserService userService;
    private final JwtService jwtService;
    private final AuthSessionService sessions;
    private final AuthCookieFactory cookies;
    private final LoginThrottle throttle;
    private final AccountRecoveryService recovery;

    public AuthController(
            AuthService authService,
            UserService userService,
            JwtService jwtService,
            AuthSessionService sessions,
            AuthCookieFactory cookies,
            LoginThrottle throttle,
            AccountRecoveryService recovery) {

        this.authService = authService;
        this.userService = userService;
        this.jwtService = jwtService;
        this.sessions = sessions;
        this.cookies = cookies;
        this.throttle = throttle;
        this.recovery = recovery;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest) {

        throttle.check(request.getUsername(), servletRequest);
        User user = authService.login(request);
        throttle.succeeded(request.getUsername());

        return issued(sessions.issue(user));
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(
            @CookieValue(name = "campus_refresh", required = false) String refreshToken) {
        return issued(sessions.refresh(refreshToken, false));
    }

    @PostMapping("/password-reset/request")
    public ResponseEntity<Void> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request,
            HttpServletRequest servletRequest) {
        throttle.checkRecovery(request.username(), servletRequest);
        recovery.requestPasswordReset(request.username(), request.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password-reset/confirm")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody PasswordResetConfirm request,
            HttpServletRequest servletRequest) {
        throttle.checkRecovery(request.token(), servletRequest);
        recovery.resetPassword(request.token(), request.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/email/verify")
    public ResponseEntity<Void> verifyEmail(@Valid @RequestBody VerifyTokenRequest request) {
        recovery.verifyEmail(request.token());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "campus_refresh", required = false) String refreshToken,
            HttpServletRequest servletRequest) {
        sessions.revoke(refreshToken);
        sessions.revokeAccessToken(servletRequest.getHeader(HttpHeaders.AUTHORIZATION));
        return ResponseEntity.status(HttpStatus.NO_CONTENT)
                .header(HttpHeaders.SET_COOKIE, cookies.clear(false)).build();
    }

    private ResponseEntity<LoginResponse> issued(AuthSessionService.IssuedSession session) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookies.set(session.refreshToken(), false))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new LoginResponse(session.accessToken(), "Bearer",
                        jwtService.getExpirationSeconds(), UserResponse.from(session.user())));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(
            @RequestAttribute("currentUserId") Long currentUserId) {

        User user = userService.getById(currentUserId);

        if (user == null || user.getStatus() != 1) {
            throw new UnauthorizedException(
                    "当前登录用户不存在或已被禁用"
            );
        }

        return ResponseEntity.ok(UserResponse.from(user));
    }

    public record PasswordResetRequest(@NotBlank @Size(max = 50) String username,
            @NotBlank @Email @Size(max = 254) String email) {}
    public record PasswordResetConfirm(@NotBlank @Size(max = 128) String token,
            @NotBlank @Size(min = 6, max = 72) String password) {}
    public record VerifyTokenRequest(@NotBlank @Size(max = 128) String token) {}
}
