package com.campusai.dto;

public record KnowledgeImportResponse(
        Long documentId,
        Integer chunkCount,
        Boolean duplicate,
        Boolean metadataUpdated
) {
    public KnowledgeImportResponse(Long documentId, Integer chunkCount, Boolean duplicate) {
        this(documentId, chunkCount, duplicate, false);
    }
}
