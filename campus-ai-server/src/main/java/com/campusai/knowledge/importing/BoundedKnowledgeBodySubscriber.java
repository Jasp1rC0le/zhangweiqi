package com.campusai.knowledge.importing;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

/** Bounds the entire response body, including a server that stops after sending headers. */
final class BoundedKnowledgeBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
    private final int maxBytes;
    private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    private final CompletableFuture<byte[]> body = new CompletableFuture<>();
    private volatile Flow.Subscription subscription;

    BoundedKnowledgeBodySubscriber(int maxBytes, Duration timeout, Throwable headerFailure) {
        if (maxBytes < 1 || timeout == null || timeout.isNegative() || timeout.isZero()) {
            throw new IllegalArgumentException("Positive body size and timeout required");
        }
        this.maxBytes = maxBytes;
        // The future is only completed when all bytes arrive, unlike ofInputStream().
        body.orTimeout(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS)
                .whenComplete((data, error) -> {
                    if (error != null) cancelSubscription();
                });
        if (headerFailure != null) body.completeExceptionally(headerFailure);
    }

    @Override
    public CompletionStage<byte[]> getBody() {
        return body;
    }

    @Override
    public synchronized void onSubscribe(Flow.Subscription incoming) {
        if (subscription != null) {
            incoming.cancel();
            return;
        }
        subscription = incoming;
        if (body.isDone()) incoming.cancel();
        else incoming.request(1);
    }

    @Override
    public synchronized void onNext(List<ByteBuffer> buffers) {
        if (body.isDone()) return;
        long count = bytes.size();
        for (ByteBuffer buffer : buffers) {
            count += buffer.remaining();
            if (count > maxBytes) {
                body.completeExceptionally(new BodyLimitException());
                return;
            }
        }
        byte[] scratch = new byte[8192];
        for (ByteBuffer original : buffers) {
            ByteBuffer buffer = original.duplicate();
            while (buffer.hasRemaining()) {
                int size = Math.min(buffer.remaining(), scratch.length);
                buffer.get(scratch, 0, size);
                bytes.write(scratch, 0, size);
            }
        }
        if (!body.isDone()) subscription.request(1);
    }

    @Override
    public void onError(Throwable error) {
        body.completeExceptionally(error);
    }

    @Override
    public synchronized void onComplete() {
        if (!body.isDone()) body.complete(bytes.toByteArray());
    }

    private void cancelSubscription() {
        Flow.Subscription current = subscription;
        if (current != null) current.cancel();
    }

    static final class BodyLimitException extends IOException {
        BodyLimitException() { super("网页超过8MB"); }
    }
}
