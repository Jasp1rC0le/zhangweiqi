package com.campusai.controller;

import com.campusai.dto.ContactMessageResponse;
import com.campusai.dto.CreateContactMessageRequest;
import com.campusai.service.ContactMessageService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/contact-messages")
public class ContactMessageController {

    private final ContactMessageService contactMessageService;

    public ContactMessageController(
            ContactMessageService contactMessageService) {
        this.contactMessageService = contactMessageService;
    }

    @PostMapping
    public ResponseEntity<ContactMessageResponse> submit(
            @Valid @RequestBody CreateContactMessageRequest request,
            @RequestAttribute(name = "currentUserId", required = false) Long userId) {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(contactMessageService.submit(request, userId));
    }

    @GetMapping("/capabilities")
    public ResponseEntity<?> capabilities() {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(java.util.Map.of("requestIdVersion", 1));
    }
}
