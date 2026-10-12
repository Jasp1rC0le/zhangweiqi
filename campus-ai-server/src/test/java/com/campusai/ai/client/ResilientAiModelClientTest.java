package com.campusai.ai.client;

import com.campusai.ai.model.AiModelProfile;
import com.campusai.ai.model.AiModelResult;
import com.campusai.exception.AiModelException;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.http.HttpStatus;

import java.time.Duration;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ResilientAiModelClientTest {
    private final AiModelClient deepSeek = mock(AiModelClient.class);
    private final AiModelClient kimi = mock(AiModelClient.class);
    private final AiModelClient glm = mock(AiModelClient.class);
    private final ResilientAiModelClient client = new ResilientAiModelClient(
            deepSeek, kimi, glm, 2, Duration.ofSeconds(30));

    @Test
    void standardFallsBackToGlmWithVisibleNotice() {
        when(deepSeek.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenThrow(new AiModelException("DeepSeek failed"));
        when(glm.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenReturn(new AiModelResult("glm", "glm-5.3", "备用回答", 1, 2, 3));

        AiModelResult result = client.chat(List.of(), AiModelProfile.STANDARD);

        assertThat(result.provider()).isEqualTo("glm");
        assertThat(result.content()).contains("已切换备用模型", "备用回答");
        verify(glm).chat(anyList(), eq(AiModelProfile.STANDARD));
    }

    @Test
    void retriesTransientFailureOnceBeforeUsingBackup() {
        when(deepSeek.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenThrow(new AiModelException("timeout", new RestClientException("timeout")))
                .thenReturn(new AiModelResult("deepseek", "flash", "完成", 1, 1, 2));

        assertThat(client.chat(List.of(), AiModelProfile.STANDARD).provider()).isEqualTo("deepseek");
        verify(deepSeek, times(2)).chat(anyList(), eq(AiModelProfile.STANDARD));
        verifyNoInteractions(glm);
    }

    @Test
    void doesNotRetryUnauthorizedPrimaryKey() {
        when(deepSeek.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenThrow(new AiModelException("unauthorized",
                        new HttpClientErrorException(HttpStatus.UNAUTHORIZED)));
        when(glm.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenReturn(new AiModelResult("glm", "glm-5.3", "备用回答", 1, 1, 2));

        assertThat(client.chat(List.of(), AiModelProfile.STANDARD).provider()).isEqualTo("glm");
        verify(deepSeek, times(1)).chat(anyList(), eq(AiModelProfile.STANDARD));
    }

    @Test
    void reportsClearFailureWhenBothProvidersAreUnavailable() {
        when(deepSeek.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenThrow(new AiModelException("primary offline"));
        when(glm.chat(anyList(), eq(AiModelProfile.STANDARD)))
                .thenThrow(new AiModelException("backup offline"));

        assertThatThrownBy(() -> client.chat(List.of(), AiModelProfile.STANDARD))
                .isInstanceOf(AiModelException.class)
                .hasMessageContaining("模型暂时不可用");
    }

    @Test
    @SuppressWarnings("unchecked")
    void neverFallsBackAfterPartialStreamWasSent() {
        when(deepSeek.streamChat(anyList(), eq(AiModelProfile.STANDARD), any()))
                .thenAnswer(invocation -> {
                    Consumer<String> callback = invocation.getArgument(2);
                    callback.accept("已经显示");
                    throw new AiModelException("connection lost", new RestClientException("closed"));
                });
        StringBuilder visible = new StringBuilder();

        assertThatThrownBy(() -> client.streamChat(List.of(), AiModelProfile.STANDARD,
                visible::append)).isInstanceOf(AiModelException.class)
                .hasMessageContaining("中途断开");
        assertThat(visible.toString()).isEqualTo("已经显示");
        verifyNoInteractions(glm);
        verify(deepSeek, times(1)).streamChat(anyList(), eq(AiModelProfile.STANDARD), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void streamFallsBackOnlyBeforeFirstVisibleToken() {
        when(deepSeek.streamChat(anyList(), eq(AiModelProfile.STANDARD), any()))
                .thenThrow(new AiModelException("primary offline"));
        when(glm.streamChat(anyList(), eq(AiModelProfile.STANDARD), any()))
                .thenAnswer(invocation -> {
                    Consumer<String> callback = invocation.getArgument(2);
                    callback.accept("备用回答");
                    return new AiModelResult("glm", "glm-5.3", "备用回答", 1, 2, 3);
                });
        StringBuilder visible = new StringBuilder();

        AiModelResult result = client.streamChat(List.of(), AiModelProfile.STANDARD, visible::append);

        assertThat(visible.toString()).isEqualTo(result.content())
                .contains("已切换备用模型", "备用回答");
    }
}
