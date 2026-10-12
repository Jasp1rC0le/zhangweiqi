package com.campusai.controller;

import com.campusai.ai.usage.AiSpendGuard;
import com.campusai.service.UserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/ai-budget")
public class AdminAiBudgetController {
    private final AiSpendGuard spend;
    private final UserService users;
    private final long operatorId;

    public AdminAiBudgetController(AiSpendGuard spend, UserService users,
            @Value("${app.ai.budget.admin-user-id:0}") long operatorId) {
        this.spend = spend; this.users = users; this.operatorId = operatorId;
    }

    @GetMapping
    public AiSpendGuard.Overview overview(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        requireOperator(userId, role);
        return spend.overview();
    }

    @GetMapping("/daily")
    public java.util.List<AiSpendGuard.DailyCost> daily(@RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate until) {
        requireOperator(userId, role);
        return spend.dailyCosts(from, until);
    }

    private void requireOperator(Long userId, String role) {
        // School administrators must not see other schools' platform expenses.
        if (!"ADMIN".equals(role) || operatorId <= 0 || userId == null || userId != operatorId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "仅配置的成本管理员可查看全站预算");
        }
        var user = users.getById(userId);
        if (user == null || !"ADMIN".equals(user.getRole()) || !Integer.valueOf(1).equals(user.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "管理员权限已失效");
        }
    }
}
