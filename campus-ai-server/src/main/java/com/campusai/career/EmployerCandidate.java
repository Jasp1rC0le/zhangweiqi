package com.campusai.career;

import java.time.LocalDateTime;

public record EmployerCandidate(
        Long id,
        Long schoolId,
        String discoveryQuery,
        String candidateName,
        String sourceUrl,
        String sourceDomain,
        String sourceSummary,
        String publishedDate,
        String sourceQuality,
        String status,
        Long employerId,
        Long reviewedBy,
        LocalDateTime reviewedAt,
        LocalDateTime createdAt) {
}
