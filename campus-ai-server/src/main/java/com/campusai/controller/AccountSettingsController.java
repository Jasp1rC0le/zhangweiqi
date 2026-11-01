package com.campusai.controller;

import com.campusai.security.AccountSettingsService;
import com.campusai.security.AuthSessionService;
import com.campusai.security.LoginThrottle;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/account")
public class AccountSettingsController {
    private final AccountSettingsService settings;
    private final AuthSessionService sessions;
    private final LoginThrottle throttle;
    public AccountSettingsController(AccountSettingsService settings,AuthSessionService sessions,LoginThrottle throttle){this.settings=settings;this.sessions=sessions;this.throttle=throttle;}
    public record NicknameInput(@NotBlank @Size(max=50) String nickname) {}
    public record PasswordInput(@NotBlank @Size(max=72) String currentPassword,@NotBlank @Size(min=6,max=72) String password) {}
    @PutMapping("/nickname")
    public ResponseEntity<AccountSettingsService.Nickname> nickname(@RequestAttribute("currentUserId")Long user,
            @RequestAttribute("currentSessionId")String session,@RequestAttribute("currentUserRole")String role,
            @Valid @RequestBody NicknameInput input,HttpServletRequest request){
        throttle.checkAccountChange("nickname",user,request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(settings.nickname(user,input.nickname(),()->sessions.active(session,user,role)));
    }
    @PostMapping("/password")
    public ResponseEntity<Void> password(@RequestAttribute("currentUserId")Long user,
            @RequestAttribute("currentSessionId")String session,@RequestAttribute("currentUserRole")String role,
            @Valid @RequestBody PasswordInput input,HttpServletRequest request){
        throttle.checkAccountChange("password",user,request);
        settings.password(user,input.currentPassword(),input.password(),()->sessions.active(session,user,role));
        // The revoked cookie is inert. Avoid overwriting a different account's concurrent login cookie.
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
