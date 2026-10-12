package com.campusai.controller;

import com.campusai.dto.AdminOverviewResponse;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/overview")
public class AdminOverviewController {
    private final JdbcTemplate jdbc;
    private final UserService users;

    public AdminOverviewController(JdbcTemplate jdbc, UserService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @GetMapping
    public AdminOverviewResponse overview(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role) {
        if (!"ADMIN".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
        User admin = users.getById(userId);
        if (admin == null || !"ADMIN".equals(admin.getRole())
                || admin.getStatus() == null || admin.getStatus() != 1) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "管理员账户无效");
        }
        Long schoolId = admin.getSchoolId();
        return new AdminOverviewResponse(
                count("SELECT COUNT(*) FROM knowledge_submissions "
                        + "WHERE school_id = ? AND status = 'PENDING'", schoolId),
                count("SELECT COUNT(*) FROM ai_message_feedback feedback "
                        + "JOIN users account ON account.id = feedback.user_id "
                        + "WHERE account.school_id = ? AND feedback.helpful = 0 "
                        + "AND NOT EXISTS (SELECT 1 FROM ai_feedback_resolutions resolution "
                        + "WHERE resolution.feedback_id = feedback.id "
                        + "AND resolution.resolved_at >= feedback.updated_at)", schoolId),
                count("SELECT COUNT(*) FROM contact_messages WHERE status = 'NEW'"),
                count("SELECT COUNT(*) FROM knowledge_documents "
                        + "WHERE school_id = ? AND status = 'PUBLISHED' "
                        + "AND (effective_at IS NULL OR effective_at <= NOW()) "
                        + "AND (expires_at IS NULL OR expires_at > NOW())", schoolId),
                count("SELECT COUNT(*) FROM ai_model_usage model_usage "
                        + "JOIN users account ON account.id = model_usage.user_id "
                        + "WHERE account.school_id = ? "
                        + "AND model_usage.created_at >= NOW() - INTERVAL 24 HOUR", schoolId),
                jdbc.queryForObject("SELECT CASE WHEN COUNT(model_usage.total_tokens) = COUNT(*) "
                        + "THEN SUM(model_usage.total_tokens) END FROM ai_model_usage model_usage "
                        + "JOIN users account ON account.id = model_usage.user_id "
                        + "WHERE account.school_id = ? "
                        + "AND model_usage.created_at >= NOW() - INTERVAL 24 HOUR", Long.class, schoolId),
                count("SELECT COUNT(*) FROM campus_employer_candidates "
                        + "WHERE school_id = ? AND status = 'PENDING'", schoolId),
                count("SELECT COUNT(*) FROM background_jobs "
                        + "WHERE school_id = ? AND status IN ('PENDING', 'RUNNING')", schoolId),
                count("SELECT COUNT(*) FROM background_jobs "
                        + "WHERE school_id = ? AND status = 'FAILED'", schoolId)
        );
    }

    private long count(String sql, Object... params) {
        Long value = jdbc.queryForObject(sql, Long.class, params);
        return value == null ? 0 : value;
    }
}
