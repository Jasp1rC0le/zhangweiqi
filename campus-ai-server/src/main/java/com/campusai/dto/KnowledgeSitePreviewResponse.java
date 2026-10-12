package com.campusai.dto;

import java.util.List;

public record KnowledgeSitePreviewResponse(
        List<KnowledgeImportPreview> pages,
        int visitedCount,
        int skippedCount,
        List<String> warnings) {
}
