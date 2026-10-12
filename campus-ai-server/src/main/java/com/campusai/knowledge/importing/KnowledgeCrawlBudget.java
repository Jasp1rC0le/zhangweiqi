package com.campusai.knowledge.importing;

import java.time.Duration;
import java.util.function.LongSupplier;

/** Shared monotonic budget for link scheduling and HTTP response bodies. */
final class KnowledgeCrawlBudget {
    private final long started;
    private final long budgetNanos;
    private final LongSupplier nanoTime;

    KnowledgeCrawlBudget(Duration budget) {
        this(budget, System::nanoTime);
    }

    KnowledgeCrawlBudget(Duration budget, LongSupplier nanoTime) {
        if (budget.isZero() || budget.isNegative()) throw new IllegalArgumentException("Positive budget required");
        this.budgetNanos = budget.toNanos();
        this.nanoTime = nanoTime;
        this.started = nanoTime.getAsLong();
    }

    Duration remaining(Duration ceiling) {
        if (ceiling.isZero() || ceiling.isNegative()) throw new IllegalArgumentException("Positive ceiling required");
        // Subtraction also works across System.nanoTime's signed wraparound.
        long elapsed = Math.max(0, nanoTime.getAsLong() - started);
        if (elapsed >= budgetNanos) throw new Exhausted();
        return Duration.ofNanos(Math.min(budgetNanos - elapsed, ceiling.toNanos()));
    }

    void check() {
        remaining(Duration.ofNanos(budgetNanos));
    }

    static final class Exhausted extends RuntimeException { }
}
