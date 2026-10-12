package com.campusai.controller;

import com.campusai.dto.AdminMessageFeedbackResponse;
import com.campusai.dto.ResolveMessageFeedbackRequest;
import com.campusai.service.AiMessageFeedbackService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/message-feedback")
public class AdminMessageFeedbackController {

    private final AiMessageFeedbackService feedbackService;
    private final UserService userService;

    public AdminMessageFeedbackController(
            AiMessageFeedbackService feedbackService,
            UserService userService) {
        this.feedbackService = feedbackService;
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<AdminMessageFeedbackResponse>> findRecent(
            @RequestAttribute("currentUserId") Long currentUserId,
            @RequestAttribute("currentUserRole") String currentUserRole) {

        if (!"ADMIN".equals(currentUserRole)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "需要管理员权限"
            );
        }

        User admin = userService.getById(currentUserId);
        if (admin == null || !"ADMIN".equals(admin.getRole())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "管理员账户不存在"
            );
        }

        return ResponseEntity.ok(
                feedbackService.findRecentBySchoolId(admin.getSchoolId())
        );
    }

    @PostMapping("/{id}/resolve")
    public AdminMessageFeedbackResponse resolve(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @PathVariable Long id,
            @Valid @RequestBody ResolveMessageFeedbackRequest request) {
        if (!"ADMIN".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
        User admin = userService.getById(userId);
        if (admin == null || !"ADMIN".equals(admin.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "管理员账户无效");
        }
        return feedbackService.resolve(admin.getSchoolId(), id, userId, request);
    }
}
