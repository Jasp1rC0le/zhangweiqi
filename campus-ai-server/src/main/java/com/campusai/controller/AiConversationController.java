package com.campusai.controller;

import com.campusai.conversation.entity.AiConversation;
import com.campusai.dto.ConversationResponse;
import com.campusai.dto.CreateConversationRequest;
import com.campusai.service.AiConversationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/conversations")
public class AiConversationController {

    private final AiConversationService conversationService;

    public AiConversationController(
            AiConversationService conversationService) {

        this.conversationService = conversationService;
    }

    @PostMapping
    public ResponseEntity<ConversationResponse> create(
            @RequestAttribute("currentUserId") Long currentUserId,
            @Valid @RequestBody CreateConversationRequest request) {

        AiConversation conversation =
                conversationService.create(
                        currentUserId,
                        request
                );

        URI location = URI.create(
                "/api/conversations/" + conversation.getId()
        );

        return ResponseEntity
                .created(location)
                .body(ConversationResponse.from(conversation));
    }

    @GetMapping
    public ResponseEntity<List<ConversationResponse>> findAll(
            @RequestAttribute("currentUserId") Long currentUserId) {

        List<ConversationResponse> response =
                conversationService
                        .findAllByUserId(currentUserId)
                        .stream()
                        .map(ConversationResponse::from)
                        .toList();

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConversationResponse> findById(
            @RequestAttribute("currentUserId") Long currentUserId,
            @PathVariable Long id) {

        AiConversation conversation =
                conversationService.findById(
                        currentUserId,
                        id
                );

        if (conversation == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(
                ConversationResponse.from(conversation)
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteById(
            @RequestAttribute("currentUserId") Long currentUserId,
            @PathVariable Long id) {

        boolean deleted = conversationService.deleteById(
                currentUserId,
                id
        );

        if (!deleted) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.noContent().build();
    }
}