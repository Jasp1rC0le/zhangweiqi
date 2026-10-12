package com.campusai.controller;

import com.campusai.security.AccountSessionService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/account/sessions")
public class AccountSessionController {
    private final AccountSessionService sessions;
    public AccountSessionController(AccountSessionService sessions) { this.sessions = sessions; }
    @GetMapping
    public ResponseEntity<List<AccountSessionService.SessionInfo>> list(
            @RequestAttribute("currentUserId") Long userId, @RequestAttribute("currentSessionId") String sessionId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(sessions.list(userId, sessionId));
    }
    @PostMapping("/revoke-others")
    public Map<String, Integer> revokeOthers(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentSessionId") String sessionId) {
        return Map.of("revoked", sessions.revokeOthers(userId, sessionId));
    }
}
