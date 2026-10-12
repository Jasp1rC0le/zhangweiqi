package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateKnowledgeEvaluationCaseRequest(
        @NotBlank @Size(max = 500) String question,
        @NotNull @Positive Long expectedDocumentId
) {}
