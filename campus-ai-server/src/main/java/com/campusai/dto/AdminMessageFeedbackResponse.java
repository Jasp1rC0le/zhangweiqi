package com.campusai.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class AdminMessageFeedbackResponse {

    private Long id;
    private Long messageId;
    private Boolean helpful;
    private String reason;
    private String questionContent;
    private String answerContent;
    private String username;
    private String nickname;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String resolutionNote;
    private Long resolvedDocumentId;
    private LocalDateTime resolvedAt;
}
