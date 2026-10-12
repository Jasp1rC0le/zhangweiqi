package com.campusai.dto;

import com.campusai.knowledge.submission.entity.KnowledgeSubmission;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class KnowledgeSubmissionResponse {

    private Long id;
    private String question;
    private String content;
    private String sourceUrl;
    private String status;
    private String reviewNote;
    private Long knowledgeDocumentId;
    private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;

    public static KnowledgeSubmissionResponse from(
            KnowledgeSubmission submission) {

        return new KnowledgeSubmissionResponse(
                submission.getId(),
                submission.getQuestion(),
                submission.getContent(),
                submission.getSourceUrl(),
                submission.getStatus(),
                submission.getReviewNote(),
                submission.getKnowledgeDocumentId(),
                submission.getCreatedAt(),
                submission.getReviewedAt()
        );
    }
}
