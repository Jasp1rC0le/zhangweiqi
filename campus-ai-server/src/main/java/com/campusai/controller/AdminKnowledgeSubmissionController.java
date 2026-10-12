package com.campusai.controller;

import com.campusai.dto.KnowledgeSubmissionResponse;
import com.campusai.dto.CreateKnowledgeDocumentRequest;
import com.campusai.dto.ReviewKnowledgeSubmissionRequest;
import com.campusai.service.KnowledgeSubmissionService;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/knowledge-submissions")
public class AdminKnowledgeSubmissionController {

    private final KnowledgeSubmissionService submissionService;
    private final UserService userService;

    public AdminKnowledgeSubmissionController(
            KnowledgeSubmissionService submissionService,
            UserService userService) {
        this.submissionService = submissionService;
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<KnowledgeSubmissionResponse>> findPending(
            @RequestAttribute("currentUserId") Long currentUserId,
            @RequestAttribute("currentUserRole") String currentUserRole) {

        User admin = requireAdmin(currentUserId, currentUserRole);
        return ResponseEntity.ok(
                submissionService.findPending(admin.getSchoolId())
        );
    }

    @PostMapping("/{submissionId}/approve")
    public ResponseEntity<KnowledgeSubmissionResponse> approve(
            @RequestAttribute("currentUserId") Long currentUserId,
            @RequestAttribute("currentUserRole") String currentUserRole,
            @PathVariable Long submissionId) {

        User admin = requireAdmin(currentUserId, currentUserRole);
        return ResponseEntity.ok(
                submissionService.approve(
                        currentUserId,
                        admin.getSchoolId(),
                        submissionId
                )
        );
    }

    @PostMapping("/{submissionId}/reject")
    public ResponseEntity<KnowledgeSubmissionResponse> reject(
            @RequestAttribute("currentUserId") Long currentUserId,
            @RequestAttribute("currentUserRole") String currentUserRole,
            @PathVariable Long submissionId,
            @Valid @RequestBody ReviewKnowledgeSubmissionRequest request) {

        User admin = requireAdmin(currentUserId, currentUserRole);
        return ResponseEntity.ok(
                submissionService.reject(
                        currentUserId,
                        admin.getSchoolId(),
                        submissionId,
                        request.getReviewNote()
                )
        );
    }

    @PostMapping("/{submissionId}/merge/{documentId}")
    public KnowledgeSubmissionResponse merge(
            @RequestAttribute("currentUserId") Long userId,
            @RequestAttribute("currentUserRole") String role,
            @PathVariable Long submissionId, @PathVariable Long documentId,
            @Valid @RequestBody CreateKnowledgeDocumentRequest reviewedDocument) {
        User admin = requireAdmin(userId, role);
        return submissionService.mergeIntoDocument(userId, admin.getSchoolId(),
                submissionId, documentId, reviewedDocument);
    }

    private User requireAdmin(Long userId, String role) {
        if (!"ADMIN".equals(role)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "需要管理员权限"
            );
        }

        User admin = userService.getById(userId);

        if (admin == null || !"ADMIN".equals(admin.getRole()) || admin.getStatus() == null
                || admin.getStatus() != 1) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "管理员账户不存在"
            );
        }

        return admin;
    }
}
