package com.campusai.dto;

import java.util.List;

public record KnowledgeEvaluationReport(
        int total,
        int hitsAtFive,
        double recallAtFive,
        double meanReciprocalRank,
        List<Result> cases
) {
    public record Result(Long id, String question, Long expectedDocumentId, int rank,
                         Long evaluatedDocumentId, String targetStatus) {}
}
