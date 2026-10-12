package com.campusai.ai.model;

public record AiModelResult(
        String provider,
        String model,
        String content,
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens
) {
}