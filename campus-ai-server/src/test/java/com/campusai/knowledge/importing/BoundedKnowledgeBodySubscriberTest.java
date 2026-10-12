package com.campusai.knowledge.importing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.Flow;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@Timeout(10)
class BoundedKnowledgeBodySubscriberTest {
    @Test
    void completesOnlyAfterAllBuffersAndAllowsExactLimit() throws Exception {
        var subscriber = subscriber(5, Duration.ofSeconds(1));
        var subscription = new RecordingSubscription();
        subscriber.onSubscribe(subscription);
        ByteBuffer input = ByteBuffer.wrap("abc".getBytes(StandardCharsets.UTF_8)).asReadOnlyBuffer();
        subscriber.onNext(List.of(input));
        assertThat(input.position()).isZero();
        assertThat(subscriber.getBody().toCompletableFuture()).isNotDone();
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{'d', 'e'})));
        subscriber.onComplete();
        assertThat(subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .isEqualTo("abcde".getBytes(StandardCharsets.UTF_8));
        assertThat(subscription.cancelled.get()).isZero();
        assertThat(subscription.requested.get()).isEqualTo(3);
    }

    @Test
    void cancelsBeforeCopyingAnOversizedBatch() {
        var subscriber = subscriber(4, Duration.ofSeconds(1));
        var subscription = new RecordingSubscription();
        subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[3]), ByteBuffer.wrap(new byte[2])));
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCauseInstanceOf(IOException.class).hasMessageContaining("网页超过8MB");
        assertThat(subscription.cancelled.get()).isEqualTo(1);
        assertThat(subscription.requested.get()).isEqualTo(1);
    }

    @Test
    void accumulatedBytesCannotExceedLimitAcrossCallbacks() {
        var subscriber = subscriber(4, Duration.ofSeconds(1));
        var subscription = new RecordingSubscription();
        subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[4])));
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[1])));
        subscriber.onComplete();
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCauseInstanceOf(IOException.class);
        assertThat(subscription.cancelled.get()).isEqualTo(1);
    }

    @Test
    void stopsAStalledBodyAndIgnoresLateCompletion() {
        var subscriber = subscriber(20, Duration.ofMillis(60));
        var subscription = new RecordingSubscription();
        subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{1})));
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(2, TimeUnit.SECONDS))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{2})));
        subscriber.onComplete();
        await().atMost(1, TimeUnit.SECONDS)
                .untilAsserted(() -> assertThat(subscription.cancelled.get()).isEqualTo(1));
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
    }

    @Test
    void timeoutBeforeSubscriptionStillCancelsWhenItArrives() {
        var subscriber = subscriber(20, Duration.ofMillis(40));
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(2, TimeUnit.SECONDS))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
        var subscription = new RecordingSubscription();
        subscriber.onSubscribe(subscription);
        assertThat(subscription.cancelled.get()).isEqualTo(1);
        assertThat(subscription.requested.get()).isZero();
    }

    @Test
    void rejectedHeadersCancelWithoutRequestingBodyBytes() {
        var failure = new IOException("unsupported response");
        var subscriber = new BoundedKnowledgeBodySubscriber(20, Duration.ofSeconds(1), failure);
        var subscription = new RecordingSubscription();
        subscriber.onSubscribe(subscription);
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCause(failure);
        assertThat(subscription.cancelled.get()).isEqualTo(1);
        assertThat(subscription.requested.get()).isZero();
    }

    @Test
    void upstreamFailureAndDuplicateSubscriptionAreCancelled() {
        var subscriber = subscriber(20, Duration.ofSeconds(1));
        var first = new RecordingSubscription();
        var duplicate = new RecordingSubscription();
        subscriber.onSubscribe(first);
        subscriber.onSubscribe(duplicate);
        IOException failure = new IOException("connection stopped");
        subscriber.onError(failure);
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS))
                .hasCause(failure);
        assertThat(first.cancelled.get()).isEqualTo(1);
        assertThat(duplicate.cancelled.get()).isEqualTo(1);
        assertThat(duplicate.requested.get()).isZero();
    }

    @Test
    void actualHttpClientStopsAfterHeadersAndPartialBody() throws Exception {
        // A task-owned loopback fixture tests transport behavior, not the school allowlist.
        var server = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var executor = Executors.newSingleThreadExecutor();
        var release = new CountDownLatch(1);
        server.setExecutor(executor);
        server.createContext("/stall", exchange -> {
            try (exchange) {
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().write('x');
                exchange.getResponseBody().flush();
                try { release.await(3, TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            }
        });
        server.start();
        try {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                    + server.getAddress().getPort() + "/stall")).timeout(Duration.ofSeconds(3)).build();
            assertThatThrownBy(() -> HttpClient.newHttpClient().send(request,
                    info -> subscriber(100, Duration.ofMillis(150))))
                    .isInstanceOf(IOException.class)
                    .hasRootCauseInstanceOf(java.util.concurrent.TimeoutException.class);
        } finally {
            release.countDown();
            server.stop(0);
            executor.shutdownNow();
            assertThat(executor.awaitTermination(1, TimeUnit.SECONDS)).isTrue();
        }
    }

    private BoundedKnowledgeBodySubscriber subscriber(int limit, Duration timeout) {
        return new BoundedKnowledgeBodySubscriber(limit, timeout, null);
    }

    private static final class RecordingSubscription implements Flow.Subscription {
        private final AtomicInteger requested = new AtomicInteger();
        private final AtomicInteger cancelled = new AtomicInteger();

        @Override
        public void request(long count) { requested.addAndGet((int) count); }

        @Override
        public void cancel() { cancelled.incrementAndGet(); }
    }
}
