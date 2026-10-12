package com.campusai.knowledge.model;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeSearchResult {

    private Long chunkId;
    private Long documentId;

    private String title;
    private String category;
    private String sourceDepartment;
    private String sourceUrl;

    private LocalDateTime publishedAt;

    private String content;
    private Double score;
}