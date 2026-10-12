package com.campusai.ai.usage;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiDailyQuotaServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AiDailyQuotaService quota = new AiDailyQuotaService(jdbc, 120000);

    @Test
    void atomicallyReservesEstimatedTokens() {
        when(jdbc.update(startsWith("UPDATE ai_daily_token_quota"), eq(1800), eq(7L), any(Date.class), eq(1800), eq(120000)))
                .thenReturn(1);
        quota.reserve(7L, 1800);
        verify(jdbc).update(startsWith("INSERT IGNORE INTO ai_daily_token_quota"),
                eq(7L), any(Date.class));
        verify(jdbc).update(startsWith("UPDATE ai_daily_token_quota"),
                eq(1800), eq(7L), any(Date.class), eq(1800), eq(120000));
    }

    @Test
    void rejectsWhenDailyLimitReached() {
        when(jdbc.update(startsWith("UPDATE ai_daily_token_quota"), eq(1800), eq(7L), any(Date.class), eq(1800), eq(120000)))
                .thenReturn(0);
        assertThatThrownBy(() -> quota.reserve(7L, 1800))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("429");
    }

    @Test
    void returnsRemainingTokens() {
        when(jdbc.queryForObject(startsWith("SELECT COALESCE"), eq(Integer.class),
                eq(7L), any(Date.class))).thenReturn(9000);
        var today = quota.status(7L);
        assertThat(today.used()).isEqualTo(9000);
        assertThat(today.remaining()).isEqualTo(111000);
        assertThat(today.unlimited()).isFalse();
    }

    @Test
    void roleLookupFailureDoesNotAdmitOrReserveTokens() {
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM users"), eq(Integer.class), eq(7L)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("unavailable"));
        assertThatThrownBy(() -> quota.reserveTokens(7L, 1800))
                .isInstanceOf(org.springframework.dao.DataAccessResourceFailureException.class);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void refusesUntrackedLegacySettlementInsteadOfChangingTheBalanceTwice() {
        var reservation = new AiCallAdmission.Reservation(java.time.LocalDate.now(), 1800);
        quota.settle(7L, reservation, 950);
        quota.release(7L, reservation);
        verifyNoInteractions(jdbc);
    }
}
