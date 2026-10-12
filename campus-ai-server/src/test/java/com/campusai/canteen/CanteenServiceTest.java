package com.campusai.canteen;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CanteenServiceTest {
    @Test
    void rejectsOutOfRangeScoreBeforeWriting() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CanteenService service = new CanteenService(jdbc);

        assertThatThrownBy(() -> service.rate(1L, 4L, 8L, 6))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("1到5分");
    }

    @Test
    void doesNotRateUnpublishedOrOtherSchoolMerchant() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(8L), eq(1L))).thenReturn(0L);
        CanteenService service = new CanteenService(jdbc);

        assertThatThrownBy(() -> service.rate(1L, 4L, 8L, 5))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("本校商家不存在");
    }

    @Test
    void updatesOneRatingPerStudentAndMerchant() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(8L), eq(1L))).thenReturn(1L);
        CanteenService service = new CanteenService(jdbc);

        service.rate(1L, 4L, 8L, 3);
        service.rate(1L, 4L, 8L, 5);

        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("ON DUPLICATE KEY UPDATE"),
                eq(8L), eq(1L), eq(4L), eq(3));
        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("ON DUPLICATE KEY UPDATE"),
                eq(8L), eq(1L), eq(4L), eq(5));
    }

    @Test
    void storesNewCommentForModerationWithinTheSameSchool() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(8L), eq(1L))).thenReturn(1L);
        CanteenService service = new CanteenService(jdbc);

        service.rate(1L, 4L, 8L, 5, "  很好吃  环境干净  ");

        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("campus_merchant_reviews"),
                eq(8L), eq(1L), eq(4L), eq("很好吃 环境干净"));
    }

    @Test
    void rejectsInvalidReviewModerationStatus() {
        CanteenService service = new CanteenService(mock(JdbcTemplate.class));

        assertThatThrownBy(() -> service.reviewStatus(1L, 2L, "UNREVIEWED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("审核状态不正确");
    }
}
