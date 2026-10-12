package com.campusai.dto;

import java.util.List;

public record KnowledgeImportPreview(String title, String content, String sourceUrl,
                                     String sourceType, Long duplicateDocumentId,
                                     List<Long> conflictingDocumentIds) {}
