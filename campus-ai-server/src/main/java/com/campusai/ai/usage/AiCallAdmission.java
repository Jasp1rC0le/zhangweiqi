package com.campusai.ai.usage;

import java.time.LocalDate;

@FunctionalInterface
public interface AiCallAdmission {
    void reserve(Long userId);

    default void reserve(Long userId, int estimatedTokens) { reserve(userId); }

    record Reservation(LocalDate date, int tokens, String id) {
        public Reservation(LocalDate date,int tokens) { this(date,tokens,null); }
    }

    default Reservation reserveTokens(Long userId, int estimatedTokens) {
        reserve(userId, estimatedTokens);
        return new Reservation(LocalDate.now(), estimatedTokens);
    }

    default void settle(Long userId, Reservation reservation, int actualTokens) {
        if (reservation != null) settle(userId, reservation.tokens(), actualTokens);
    }

    default void release(Long userId, Reservation reservation) {
        if (reservation != null) release(userId, reservation.tokens());
    }

    default void settle(Long userId, int reservedTokens, int actualTokens) {}

    default void release(Long userId, int reservedTokens) {}
}
