package com.campusai.knowledge.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KnowledgeChunk {

    private Long id;
    private Long documentId;
    private Integer chunkIndex;
    private String content;
    private Integer charCount;
    private Integer tokenCount;
    private LocalDateTime createdAt;
}