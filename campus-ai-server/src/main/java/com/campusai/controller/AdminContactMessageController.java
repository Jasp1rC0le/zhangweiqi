package com.campusai.controller;

import com.campusai.dto.ContactMessageResponse;
import com.campusai.service.ContactMessageService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/contact-messages")
public class AdminContactMessageController {

    private final ContactMessageService contactMessageService;

    public AdminContactMessageController(
            ContactMessageService contactMessageService) {
        this.contactMessageService = contactMessageService;
    }

    @GetMapping
    public ResponseEntity<List<ContactMessageResponse>> findAll(
            @RequestAttribute("currentUserRole") String currentUserRole,
            @RequestAttribute("currentUserId") Long currentUserId) {

        requireAdmin(currentUserRole);
        return ResponseEntity.ok(contactMessageService.findAll(currentUserId));
    }

    @PostMapping("/{id}/handled")
    public ResponseEntity<ContactMessageResponse> markHandled(
            @RequestAttribute("currentUserRole") String currentUserRole,
            @RequestAttribute("currentUserId") Long currentUserId,
            @PathVariable Long id) {

        requireAdmin(currentUserRole);
        return ResponseEntity.ok(contactMessageService.markHandled(id, currentUserId));
    }

    private void requireAdmin(String role) {
        if (!"ADMIN".equals(role)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "需要管理员权限"
            );
        }
    }
}
