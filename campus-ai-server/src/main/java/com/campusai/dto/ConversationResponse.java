package com.campusai.dto;

import com.campusai.conversation.entity.AiConversation;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class ConversationResponse {

    private Long id;
    private String title;
    private String model;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static ConversationResponse from(
            AiConversation conversation) {

        return new ConversationResponse(
                conversation.getId(),
                conversation.getTitle(),
                conversation.getModel(),
                conversation.getCreatedAt(),
                conversation.getUpdatedAt()
        );
    }
}