package com.campusai.message.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AiMessage {

    private Long id;
    private Long conversationId;
    private String role;
    private String content;
    private Integer tokenCount;
    private LocalDateTime createdAt;
}