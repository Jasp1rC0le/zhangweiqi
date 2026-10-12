package com.campusai.dto;

public record AdminOverviewResponse(
        long pendingSubmissions,
        long unresolvedFeedback,
        long openContactMessages,
        long searchableDocuments,
        long recentModelCalls,
        Long recentModelTokens,
        long pendingEmployerCandidates,
        long pendingBackgroundJobs,
        long failedBackgroundJobs
) {}
