package com.campusai.ai.client;

import com.campusai.ai.model.*;
import com.campusai.ai.usage.AiSpendGuard;
import java.util.List;
import java.util.function.Consumer;

/** Wrap each raw provider, not the resilient router: every retry/fallback must obtain a new ticket. */
public final class MeteredAiModelClient implements AiModelClient {
    private final AiModelClient delegate;
    private final AiSpendGuard guard;
    private final String provider;
    private final String model;
    private final int maxTokens;
    private final boolean configured;

    public MeteredAiModelClient(AiModelClient delegate, AiSpendGuard guard, String provider,
            String model, int maxTokens, String apiKey) {
        this.delegate = delegate; this.guard = guard; this.provider = provider;
        this.model = model; this.maxTokens = maxTokens;
        this.configured = apiKey != null && !apiKey.isBlank();
    }

    @Override public AiModelResult chat(List<AiChatMessage> messages, AiModelProfile profile) {
        return call(messages, profile, null);
    }

    @Override public AiModelResult streamChat(List<AiChatMessage> messages, AiModelProfile profile, Consumer<String> onDelta) {
        return call(messages, profile, onDelta);
    }

    private AiModelResult call(List<AiChatMessage> messages, AiModelProfile profile, Consumer<String> delta) {
        if (!configured) throw new com.campusai.exception.AiModelException("该模型尚未配置，暂不可用");
        var ticket = guard.reserve(provider, model == null ? profile.getApiModel() : model,
                messages, Math.min(maxTokens, profile.getMaxOutputTokens()));
        AiModelResult result;
        try {
            result = delta == null ? delegate.chat(messages, profile) : delegate.streamChat(messages, profile, delta);
        } catch (RuntimeException failure) {
            try { guard.failed(ticket); }
            catch (RuntimeException accountingFailure) { failure.addSuppressed(accountingFailure); }
            // If settlement fails the durable PENDING reservation remains occupied.
            throw failure;
        }
        guard.complete(ticket, result);
        return result;
    }
}
