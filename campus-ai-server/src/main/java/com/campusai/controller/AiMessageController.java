package com.campusai.controller;

import com.campusai.dto.ChatResponse;
import com.campusai.dto.CreateMessageRequest;
import com.campusai.dto.MessageResponse;
import com.campusai.dto.MessageFeedbackRequest;
import com.campusai.service.AiMessageService;
import tools.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping(
        "/api/conversations/{conversationId}/messages"
)
public class AiMessageController {

    private final AiMessageService messageService;
    private final ObjectMapper objectMapper;

    public AiMessageController(
            AiMessageService messageService,
            ObjectMapper objectMapper) {

        this.messageService = messageService;
        this.objectMapper = objectMapper;
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
            @Valid @RequestBody CreateMessageRequest request) {

        StreamingResponseBody body = outputStream -> {
            try {
                ChatResponse response = messageService.streamChat(
                        currentUserId,
                        conversationId,
                        request,
                        delta -> {
                            try {
                                writeEvent(
                                        outputStream,
                                        "delta",
                                        Map.of("content", delta)
                                );
                            } catch (IOException exception) {
                                throw new UncheckedIOException(exception);
                            }
                        }
                );

                if (response == null) {
                    writeEvent(
                            outputStream,
                            "error",
                            Map.of("message", "对话不存在或无权访问")
                    );
                    return;
                }

                writeEvent(outputStream, "done", response);
            } catch (UncheckedIOException exception) {
                throw exception.getCause();
            } catch (ResponseStatusException exception) {
                writeEvent(outputStream, "error", Map.of(
                        "message", exception.getStatusCode().is5xxServerError() || exception.getReason() == null
                                ? "请求暂时无法处理" : exception.getReason(),
                        "status", exception.getStatusCode().value()));
            } catch (Exception exception) {
                writeEvent(
                        outputStream,
                        "error",
                        Map.of(
                                "message",
                                "AI服务暂时不可用，请稍后重试"
                        )
                );
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .header(HttpHeaders.CACHE_CONTROL, "no-store, no-transform")
                .header("X-Accel-Buffering", "no")
                .body(body);
    }

    private void writeEvent(
            java.io.OutputStream outputStream,
            String event,
            Object data) throws IOException {

        String payload = "event: " + event + "\n"
                + "data: " + objectMapper.writeValueAsString(data)
                + "\n\n";

        outputStream.write(payload.getBytes(StandardCharsets.UTF_8));
        outputStream.flush();
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
