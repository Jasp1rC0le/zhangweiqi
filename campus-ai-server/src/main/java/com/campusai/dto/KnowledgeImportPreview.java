package com.campusai.dto;

import java.util.List;

public record KnowledgeImportPreview(String title, String content, String sourceUrl,
                                     String sourceType, Long duplicateDocumentId,
                                     List<Long> conflictingDocumentIds, List<String> warnings) {
    public KnowledgeImportPreview(String title, String content, String sourceUrl,
                                  String sourceType, Long duplicateDocumentId,
                                  List<Long> conflictingDocumentIds) {
        this(title, content, sourceUrl, sourceType, duplicateDocumentId, conflictingDocumentIds, List.of());
    }
}
