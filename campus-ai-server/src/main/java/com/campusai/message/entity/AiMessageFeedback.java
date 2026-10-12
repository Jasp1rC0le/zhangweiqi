package com.campusai.message.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class AiMessageFeedback {

    private Long id;
    private Long messageId;
    private Long userId;
    private Boolean helpful;
    private String reason;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
