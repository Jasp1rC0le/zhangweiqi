package com.campusai.conversation.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AiConversation {

    private Long id;
    private Long userId;
    private String title;
    private String model;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}