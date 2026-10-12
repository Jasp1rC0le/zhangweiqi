package com.campusai.ai.usage;

import com.campusai.ai.model.AiModelResult;

@FunctionalInterface
public interface AiUsageRecorder {

    void record(
            Long userId,
            Long assistantMessageId,
            AiModelResult result
    );
}
