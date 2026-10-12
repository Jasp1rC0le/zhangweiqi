package com.campusai.knowledge.model;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CitationSourceResult {

    private Long messageId;
    private Integer citationIndex;

    private Long chunkId;
    private Long documentId;

    private String title;
    private String category;
    private String sourceDepartment;
    private String sourceUrl;

    private LocalDateTime publishedAt;
}