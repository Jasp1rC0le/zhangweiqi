package com.campusai.dto;

import com.campusai.message.entity.AiMessage;
import com.campusai.message.entity.AiMessageFeedback;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@AllArgsConstructor
public class MessageResponse {

    private Long id;
    private Long conversationId;
    private String role;
    private String content;
    private Integer tokenCount;
    private LocalDateTime createdAt;

    private List<KnowledgeSourceResponse> sources;
    private Boolean helpful;
    private String feedbackReason;

    public static MessageResponse from(
            AiMessage message) {

        return from(message, List.of(), null);
    }

    public static MessageResponse from(
            AiMessage message,
            List<KnowledgeSourceResponse> sources) {

        return from(message, sources, null);
    }

    public static MessageResponse from(
            AiMessage message,
            List<KnowledgeSourceResponse> sources,
            AiMessageFeedback feedback) {

        return new MessageResponse(
                message.getId(),
                message.getConversationId(),
                message.getRole(),
                message.getContent(),
                message.getTokenCount(),
                message.getCreatedAt(),
                sources,
                feedback == null ? null : feedback.getHelpful(),
                feedback == null ? null : feedback.getReason()
        );
    }
}
