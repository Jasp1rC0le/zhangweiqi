package com.campusai.ai.client;

import com.campusai.ai.usage.AiSpendGuard;
import com.campusai.ai.model.*;
import com.campusai.exception.AiModelException;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.time.Duration;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class MeteredAiModelClientTest {
    @Test void streamingSuccessSettlesAndPartialFailureKeepsAttempt() {
        var guard = mock(AiSpendGuard.class); var raw = mock(AiModelClient.class);
        var first = new AiSpendGuard.Ticket("stream-ok"); var second = new AiSpendGuard.Ticket("stream-partial");
        when(guard.reserve(anyString(), anyString(), anyList(), anyInt())).thenReturn(first, second);
        var result = new AiModelResult("deepseek", "deepseek-flash", "回答", 20, 10, 30);
        when(raw.streamChat(anyList(), any(), any())).thenAnswer(call -> {
            java.util.function.Consumer<String> callback = call.getArgument(2);
            callback.accept("回答"); return result;
        }).thenAnswer(call -> {
            java.util.function.Consumer<String> callback = call.getArgument(2);
            callback.accept("未完整"); throw new AiModelException("503 streaming failure");
        });
        var client = new MeteredAiModelClient(raw, guard, "deepseek", null, 4000, "test-key");
        var resilient = new ResilientAiModelClient(client, raw, raw, 1, Duration.ofSeconds(30));
        assertThat(resilient.streamChat(List.of(), AiModelProfile.STANDARD, ignored -> {})).isEqualTo(result);
        assertThatThrownBy(() -> resilient.streamChat(List.of(), AiModelProfile.STANDARD, ignored -> {}))
                .hasMessageContaining("中途断开");
        verify(guard).complete(first, result); verify(guard).failed(second);
        verify(raw, times(2)).streamChat(anyList(), any(), any());
        verify(raw, never()).chat(anyList(), any());
    }
    @Test void retryHasSeparateAttemptAndFailureRecord() {
        var guard = mock(AiSpendGuard.class);
        var raw = mock(AiModelClient.class);
        var messages = List.of(new AiChatMessage("user", "测试"));
        var first = new AiSpendGuard.Ticket("first"); var second = new AiSpendGuard.Ticket("second");
        when(guard.reserve("deepseek", AiModelProfile.STANDARD.getApiModel(), messages, 1500)).thenReturn(first, second);
        var result = new AiModelResult("deepseek", "deepseek-flash", "好", 2, 2, 4);
        when(raw.chat(messages, AiModelProfile.STANDARD)).thenThrow(new AiModelException("HTTP 503")).thenReturn(result);
        var metered = new MeteredAiModelClient(raw, guard, "deepseek", null, 4000, "test-key");
        var resilient = new ResilientAiModelClient(metered, raw, raw, 1, Duration.ofSeconds(30));
        assertThat(resilient.chat(messages, AiModelProfile.STANDARD)).isEqualTo(result);
        verify(guard).failed(first); verify(guard).complete(second, result);
        verify(guard, times(2)).reserve("deepseek", AiModelProfile.STANDARD.getApiModel(), messages, 1500);
    }

    @Test void budgetRejectionNeverCallsProvider() {
        var guard = mock(AiSpendGuard.class); var raw = mock(AiModelClient.class);
        when(guard.reserve(anyString(), anyString(), anyList(), anyInt()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS));
        var client = new MeteredAiModelClient(raw, guard, "deepseek", null, 4000, "test-key");
        assertThatThrownBy(() -> client.streamChat(List.of(), AiModelProfile.STANDARD, ignored -> {}))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(raw);
    }

    @Test void missingKeyDoesNotHoldBudget() {
        var guard = mock(AiSpendGuard.class); var raw = mock(AiModelClient.class);
        var client = new MeteredAiModelClient(raw, guard, "kimi", "kimi-k3", 4000, "");
        assertThatThrownBy(() -> client.chat(List.of(), AiModelProfile.KIMI)).isInstanceOf(AiModelException.class);
        verifyNoInteractions(raw, guard);
    }
}
