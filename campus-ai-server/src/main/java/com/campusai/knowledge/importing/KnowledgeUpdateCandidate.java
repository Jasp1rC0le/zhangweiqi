package com.campusai.knowledge.importing;

import java.time.LocalDateTime;

public record KnowledgeUpdateCandidate(Long id, Long documentId, String sourceUrl,
                                       String currentTitle, String detectedTitle,
                                       String detectedContent, String status,
                                       LocalDateTime detectedAt) {
}
