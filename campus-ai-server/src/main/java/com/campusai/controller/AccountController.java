package com.campusai.controller;

import com.campusai.service.AccountDataService;
import com.campusai.service.UserProfileService;
import com.campusai.dto.UserProfileRequest;
import com.campusai.dto.UserProfileResponse;
import com.campusai.security.AccountRecoveryService;
import com.campusai.security.LoginThrottle;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/account")
public class AccountController {
    private final AccountDataService data;
    private final AccountRecoveryService recovery;
    private final LoginThrottle throttle;
    private final UserProfileService profiles;

    public AccountController(AccountDataService data, AccountRecoveryService recovery,
            LoginThrottle throttle, UserProfileService profiles) {
        this.data = data;
        this.recovery = recovery;
        this.throttle = throttle;
        this.profiles = profiles;
    }

    @GetMapping("/profile")
    public UserProfileResponse profile(@RequestAttribute("currentUserId") Long userId) {
        return profiles.find(userId);
    }

    @PutMapping("/profile")
    public UserProfileResponse updateProfile(@RequestAttribute("currentUserId") Long userId,
                                              @Valid @RequestBody UserProfileRequest request) {
        return profiles.save(userId, request);
    }

    @GetMapping("/email")
    public ResponseEntity<Map<String, String>> email(@RequestAttribute("currentUserId") Long userId) {
        String email = recovery.verifiedEmail(userId);
        return ResponseEntity.ok(email == null ? Map.of() : Map.of("email", email));
    }

    @PostMapping("/email/verification")
    public ResponseEntity<Void> requestEmailVerification(@RequestAttribute("currentUserId") Long userId,
            @Valid @RequestBody EmailVerificationRequest request,
            HttpServletRequest servletRequest) {
        throttle.checkRecovery(String.valueOf(userId), servletRequest);
        recovery.requestEmailVerification(userId, request.email(), request.password());
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> export(@RequestAttribute("currentUserId") Long userId) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=campus-ai-account-data.json")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(data.export(userId));
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestAttribute("currentUserId") Long userId,
            @Valid @RequestBody DeleteRequest request) {
        data.delete(userId, request.password());
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    public record DeleteRequest(@NotBlank @jakarta.validation.constraints.Size(max = 72) String password) {}
    public record EmailVerificationRequest(@NotBlank @Email @jakarta.validation.constraints.Size(max = 254) String email,
            @NotBlank @jakarta.validation.constraints.Size(max = 72) String password) {}
}
