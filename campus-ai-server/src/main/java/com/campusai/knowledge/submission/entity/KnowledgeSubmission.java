package com.campusai.knowledge.submission.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeSubmission {

    private Long id;
    private Long schoolId;
    private Long userId;
    private String question;
    private String content;
    private String sourceUrl;
    private String status;
    private String reviewNote;
    private Long reviewedBy;
    private LocalDateTime reviewedAt;
    private Long knowledgeDocumentId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
