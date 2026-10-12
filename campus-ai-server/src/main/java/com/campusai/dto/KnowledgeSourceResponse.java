package com.campusai.dto;

import com.campusai.knowledge.model.CitationSourceResult;
import com.campusai.knowledge.model.KnowledgeSearchResult;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class KnowledgeSourceResponse {

    private Long chunkId;
    private Long documentId;

    private String title;
    private String category;
    private String sourceDepartment;
    private String sourceUrl;

    private LocalDateTime publishedAt;

    public static KnowledgeSourceResponse from(
            KnowledgeSearchResult result) {

        return new KnowledgeSourceResponse(
                result.getChunkId(),
                result.getDocumentId(),
                result.getTitle(),
                result.getCategory(),
                result.getSourceDepartment(),
                result.getSourceUrl(),
                result.getPublishedAt()
        );
    }

    public static KnowledgeSourceResponse from(
            CitationSourceResult result) {

        return new KnowledgeSourceResponse(
                result.getChunkId(),
                result.getDocumentId(),
                result.getTitle(),
                result.getCategory(),
                result.getSourceDepartment(),
                result.getSourceUrl(),
                result.getPublishedAt()
        );
    }
}