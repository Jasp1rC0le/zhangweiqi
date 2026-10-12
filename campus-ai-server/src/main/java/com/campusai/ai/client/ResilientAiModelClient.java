package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelProfile;
import com.campusai.ai.model.AiModelResult;
import com.campusai.exception.AiModelException;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Protects a single application instance from unbounded external model calls. */
public final class ResilientAiModelClient implements AiModelClient {
    private static final String BACKUP_NOTICE = "主模型暂不可用，已切换备用模型。\n\n";
    private final Map<String, AiModelClient> providers;
    private final Map<String, Circuit> circuits = new ConcurrentHashMap<>();
    private final Semaphore capacity;
    private final Duration cooldown;

    public ResilientAiModelClient(AiModelClient deepSeek, AiModelClient kimi,
            AiModelClient glm, int maxConcurrent, Duration cooldown) {
        if (maxConcurrent < 1) throw new IllegalArgumentException("并发上限必须大于0");
        if (cooldown == null || cooldown.isNegative() || cooldown.isZero()) {
            throw new IllegalArgumentException("熔断恢复时间必须大于0");
        }
        this.providers = Map.of("deepseek", deepSeek, "kimi", kimi, "glm", glm);
        this.capacity = new Semaphore(maxConcurrent, true);
        this.cooldown = cooldown;
    }

    @Override
    public AiModelResult chat(List<AiChatMessage> messages, AiModelProfile profile) {
        acquire();
        try {
            try {
                return attempt(profile.getProvider(), messages, profile, null);
            } catch (AiModelException primaryFailure) {
                if (!canFallback(profile)) throw unavailable(primaryFailure);
                try {
                    AiModelResult backup = attempt("glm", messages, profile, null);
                    return withNotice(backup);
                } catch (AiModelException backupFailure) {
                    throw unavailable(backupFailure);
                }
            }
        } finally { capacity.release(); }
    }

    @Override
    public AiModelResult streamChat(List<AiChatMessage> messages, AiModelProfile profile,
            Consumer<String> onDelta) {
        acquire();
        AtomicBoolean primaryStarted = new AtomicBoolean();
        try {
            try {
                return attempt(profile.getProvider(), messages, profile, delta -> {
                    if (delta != null && !delta.isEmpty()) primaryStarted.set(true);
                    onDelta.accept(delta);
                });
            } catch (AiModelException primaryFailure) {
                if (primaryStarted.get()) {
                    throw new AiModelException("回答中途断开，已显示的内容可能不完整，请重试", primaryFailure);
                }
                if (!canFallback(profile)) throw unavailable(primaryFailure);
                AtomicBoolean noticeSent = new AtomicBoolean();
                try {
                    AiModelResult backup = attempt("glm", messages, profile, delta -> {
                        if (noticeSent.compareAndSet(false, true)) onDelta.accept(BACKUP_NOTICE);
                        onDelta.accept(delta);
                    });
                    if (!noticeSent.get()) onDelta.accept(BACKUP_NOTICE + backup.content());
                    return withNotice(backup);
                } catch (AiModelException backupFailure) {
                    if (noticeSent.get()) {
                        throw new AiModelException("备用模型回答中途断开，请重试", backupFailure);
                    }
                    throw unavailable(backupFailure);
                }
            }
        } finally { capacity.release(); }
    }

    private AiModelResult attempt(String provider, List<AiChatMessage> messages,
            AiModelProfile profile, Consumer<String> onDelta) {
        Circuit circuit = circuits.computeIfAbsent(provider, ignored -> new Circuit());
        if (circuit.isOpen()) throw new AiModelException(provider + "暂时不可用，正在自动恢复");
        int maxAttempts = "deepseek".equals(provider) ? 2 : 1;
        for (int trial = 0; trial < maxAttempts; trial++) {
            AtomicBoolean emitted = new AtomicBoolean();
            try {
                AiModelResult result = onDelta == null
                        ? providers.get(provider).chat(messages, profile)
                        : providers.get(provider).streamChat(messages, profile, delta -> {
                            if (delta != null && !delta.isEmpty()) emitted.set(true);
                            onDelta.accept(delta);
                        });
                circuit.succeeded();
                return result;
            } catch (AiModelException failure) {
                circuit.failed(cooldown);
                if (trial + 1 >= maxAttempts || emitted.get() || !retryable(failure)
                        || circuit.isOpen()) throw failure;
                try { Thread.sleep(150); }
                catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new AiModelException("模型请求已中断", interrupted);
                }
            }
        }
        throw new AiModelException("模型请求失败");
    }

    private boolean retryable(AiModelException failure) {
        if (failure.getCause() instanceof RestClientResponseException response) {
            return response.getStatusCode().value() == 429
                    || response.getStatusCode().is5xxServerError();
        }
        if (failure.getCause() instanceof RestClientException) return true;
        String message = failure.getMessage() == null ? "" : failure.getMessage();
        return message.matches("(?s).*(429|5\\d\\d).*");
    }

    private boolean canFallback(AiModelProfile profile) {
        return profile == AiModelProfile.STANDARD || profile == AiModelProfile.THINKING;
    }

    private AiModelResult withNotice(AiModelResult backup) {
        return new AiModelResult(backup.provider(), backup.model(), BACKUP_NOTICE + backup.content(),
                backup.promptTokens(), backup.completionTokens(), backup.totalTokens());
    }

    private AiModelException unavailable(Throwable cause) {
        return new AiModelException("模型暂时不可用，请稍后重试；本次未生成可靠回答", cause);
    }

    private void acquire() {
        if (!capacity.tryAcquire()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "当前请求较多，请稍后重试");
        }
    }

    private static final class Circuit {
        private int failures;
        private Instant openUntil = Instant.EPOCH;

        synchronized boolean isOpen() { return Instant.now().isBefore(openUntil); }
        synchronized void succeeded() { failures = 0; openUntil = Instant.EPOCH; }
        synchronized void failed(Duration cooldown) {
            if (++failures >= 3) { failures = 0; openUntil = Instant.now().plus(cooldown); }
        }
    }
}
