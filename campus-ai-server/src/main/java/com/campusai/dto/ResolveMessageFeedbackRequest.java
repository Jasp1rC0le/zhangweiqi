package com.campusai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ResolveMessageFeedbackRequest(
        @NotBlank @Size(max = 500) String note,
        @Positive Long documentId
) {}
