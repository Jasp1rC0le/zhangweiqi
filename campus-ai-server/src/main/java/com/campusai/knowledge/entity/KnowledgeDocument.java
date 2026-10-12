package com.campusai.knowledge.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeDocument {

    private Long id;
    private Long schoolId;
    private String title;
    private String category;
    private String sourceDepartment;
    private String sourceUrl;

    private LocalDateTime publishedAt;
    private LocalDateTime effectiveAt;
    private LocalDateTime expiresAt;

    private String status;
    private String contentHash;
    private String rawContent;
    private Integer versionNumber;
    private Boolean hasSuccessor;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
