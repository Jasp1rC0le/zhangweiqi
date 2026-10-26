package com.campusai.controller;

import com.campusai.dto.ChatResponse;
import com.campusai.dto.CreateMessageRequest;
import com.campusai.dto.MessageResponse;
import com.campusai.dto.MessageFeedbackRequest;
import com.campusai.service.AiMessageService;
import com.campusai.ai.client.ChatStreamingSupport;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.List;

@RestController
@RequestMapping(
        "/api/conversations/{conversationId}/messages"
)
public class AiMessageController {

    private final AiMessageService messageService;
    private final ChatStreamingSupport streams;

    public AiMessageController(
            AiMessageService messageService,
            ChatStreamingSupport streams) {

        this.messageService = messageService;
        this.streams = streams;
    }

    @PostMapping
    public ResponseEntity<ChatResponse> chat(
            @RequestAttribute("currentUserId")
            Long currentUserId,

            @PathVariable
            Long conversationId,

            @Valid
            @RequestBody
            CreateMessageRequest request) {

        ChatResponse response =
                messageService.chat(
                        currentUserId,
                        conversationId,
                        request
                );

        if (response == null) {
            return ResponseEntity
                    .notFound()
                    .build();
        }

        return ResponseEntity.ok(response);
    }

    @PostMapping(
            path = "/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public ResponseEntity<StreamingResponseBody> streamChat(
            @RequestAttribute("currentUserId") Long currentUserId,
            @PathVariable Long conversationId,
            @Valid @RequestBody CreateMessageRequest request,
            @RequestAttribute("currentSessionId") String session,
            @RequestAttribute("currentUserRole") String role) {

        StreamingResponseBody body = output -> streams.stream(output,currentUserId,session,role,
                delta -> messageService.streamChat(currentUserId,conversationId,request,delta));

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .header(HttpHeaders.CACHE_CONTROL, "no-store, no-transform")
                .header("X-Accel-Buffering", "no")
                .body(body);
    }

    @GetMapping
    public ResponseEntity<List<MessageResponse>>
    findAll(
            @RequestAttribute("currentUserId")
            Long currentUserId,

            @PathVariable
            Long conversationId) {

        List<MessageResponse> messages =
                messageService
                        .findAllByConversationId(
                                currentUserId,
                                conversationId
                        );

        if (messages == null) {
            return ResponseEntity
                    .notFound()
                    .build();
        }

        return ResponseEntity.ok(messages);
    }

    @PutMapping("/{messageId}/feedback")
    public ResponseEntity<MessageResponse> updateFeedback(
            @RequestAttribute("currentUserId") Long currentUserId,
            @PathVariable Long conversationId,
            @PathVariable Long messageId,
            @Valid @RequestBody MessageFeedbackRequest request) {

        MessageResponse response = messageService.updateFeedback(
                currentUserId,
                conversationId,
                messageId,
                request
        );

        return response == null
                ? ResponseEntity.notFound().build()
                : ResponseEntity.ok(response);
    }
}
