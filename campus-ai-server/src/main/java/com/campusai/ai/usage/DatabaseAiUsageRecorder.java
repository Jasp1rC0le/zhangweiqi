package com.campusai.ai.usage;

import com.campusai.ai.model.AiModelResult;
import com.campusai.mapper.AiModelUsageMapper;
import org.springframework.stereotype.Service;

import java.util.Set;

@Service
public class DatabaseAiUsageRecorder implements AiUsageRecorder {

    private static final Set<String> EXTERNAL_PROVIDERS =
            Set.of("deepseek", "kimi", "glm");

    private final AiModelUsageMapper mapper;

    public DatabaseAiUsageRecorder(AiModelUsageMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void record(
            Long userId,
            Long assistantMessageId,
            AiModelResult result) {

        if (result == null
                || result.provider() == null
                || !EXTERNAL_PROVIDERS.contains(result.provider())) {
            return;
        }

        int rows = mapper.insert(
                assistantMessageId,
                userId,
                result.provider(),
                result.model(),
                result.promptTokens(),
                result.completionTokens(),
                result.totalTokens()
        );

        if (rows != 1) {
            throw new IllegalStateException("AI用量记录保存失败");
        }
    }
}
