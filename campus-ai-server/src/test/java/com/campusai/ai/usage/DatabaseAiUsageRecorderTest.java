package com.campusai.ai.usage;

import com.campusai.ai.model.AiModelResult;
import com.campusai.mapper.AiModelUsageMapper;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DatabaseAiUsageRecorderTest {

    @Test
    void shouldStoreProviderAndBothTokenCounts() {
        AiModelUsageMapper mapper = mock(AiModelUsageMapper.class);
        when(mapper.insert(11L, 3L, "kimi", "kimi-k2.6", 120, 30, 150))
                .thenReturn(1);
        DatabaseAiUsageRecorder recorder = new DatabaseAiUsageRecorder(mapper);

        recorder.record(
                3L,
                11L,
                new AiModelResult("kimi", "kimi-k2.6", "回答", 120, 30, 150)
        );

        verify(mapper).insert(11L, 3L, "kimi", "kimi-k2.6", 120, 30, 150);
    }

    @Test
    void shouldIgnoreAnswersThatDidNotCallPaidModels() {
        AiModelUsageMapper mapper = mock(AiModelUsageMapper.class);
        DatabaseAiUsageRecorder recorder = new DatabaseAiUsageRecorder(mapper);

        recorder.record(
                3L,
                11L,
                new AiModelResult("campus-clock", "system-time", "现在", 0, 0, 0)
        );

        verifyNoInteractions(mapper);
    }
}
