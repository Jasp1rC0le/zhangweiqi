package com.campusai.career;

import com.campusai.search.WebSearchService;
import com.campusai.search.model.WebSearchResult;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmployerDiscoveryServiceTest {
    @SuppressWarnings({"rawtypes", "unchecked"})
    @Test
    void discoveredResultsRemainPendingForAdministratorReview() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        WebSearchService search = mock(WebSearchService.class);
        CareerService career = mock(CareerService.class);
        when(search.isAvailable()).thenReturn(true);
        when(search.search(anyString())).thenReturn(List.of(new WebSearchResult(
                "学校与企业开展校企合作", "https://www.tsguas.edu.cn/info/1.htm",
                "活动介绍", "2026-09-01")));
        when(jdbc.query(anyString(), any(RowMapper.class), eq(1L), eq("PENDING")))
                .thenReturn(List.of());
        EmployerDiscoveryService service = new EmployerDiscoveryService(jdbc, search, career);

        assertThat(service.discover(1L, "软件企业")).isEmpty();

        verify(search).search(org.mockito.ArgumentMatchers.contains("软件企业"));
        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("campus_employer_candidates"),
                eq(1L), anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString());
    }
}
