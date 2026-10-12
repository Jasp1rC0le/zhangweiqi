package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelProfile;
import com.campusai.ai.model.AiModelResult;

import java.util.List;
import java.util.function.Consumer;

/** Routes a selected model profile to its configured provider client. */
public final class ProviderRoutingAiModelClient implements AiModelClient {

    private final AiModelClient deepSeekClient;
    private final AiModelClient kimiClient;
    private final AiModelClient glmClient;

    public ProviderRoutingAiModelClient(
            AiModelClient deepSeekClient,
            AiModelClient kimiClient,
            AiModelClient glmClient) {
        this.deepSeekClient = deepSeekClient;
        this.kimiClient = kimiClient;
        this.glmClient = glmClient;
    }

    @Override
    public AiModelResult chat(
            List<AiChatMessage> messages,
            AiModelProfile profile) {
        return clientFor(profile).chat(messages, profile);
    }

    @Override
    public AiModelResult streamChat(
            List<AiChatMessage> messages,
            AiModelProfile profile,
            Consumer<String> onDelta) {
        return clientFor(profile).streamChat(messages, profile, onDelta);
    }

    private AiModelClient clientFor(AiModelProfile profile) {
        return switch (profile.getProvider()) {
            case "kimi" -> kimiClient;
            case "glm" -> glmClient;
            default -> deepSeekClient;
        };
    }
}
