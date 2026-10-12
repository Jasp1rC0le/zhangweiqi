package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelProfile;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ProviderRoutingAiModelClientTest {

    @Test
    void shouldDispatchEachProfileToItsProvider() {
        AiModelClient deepSeek = mock(AiModelClient.class);
        AiModelClient kimi = mock(AiModelClient.class);
        AiModelClient glm = mock(AiModelClient.class);
        ProviderRoutingAiModelClient router =
                new ProviderRoutingAiModelClient(deepSeek, kimi, glm);
        List<AiChatMessage> messages =
                List.of(new AiChatMessage("user", "测试"));

        router.chat(messages, AiModelProfile.STANDARD);
        router.chat(messages, AiModelProfile.KIMI);
        router.streamChat(messages, AiModelProfile.GLM, delta -> {});

        verify(deepSeek).chat(messages, AiModelProfile.STANDARD);
        verify(kimi).chat(messages, AiModelProfile.KIMI);
        verify(glm).streamChat(
                org.mockito.ArgumentMatchers.eq(messages),
                org.mockito.ArgumentMatchers.eq(AiModelProfile.GLM),
                org.mockito.ArgumentMatchers.any()
        );
    }
}
