package com.campusai.controller;

import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AdminOverviewControllerTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UserService users = mock(UserService.class);
    private final AdminOverviewController controller = new AdminOverviewController(jdbc, users);

    @Test
    void deniesNonAdminBeforeReadingStatistics() {
        assertThatThrownBy(() -> controller.overview(1L, "STUDENT"))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsAdministratorWithMissingStatusBeforeReadingStatistics() {
        User admin = new User();
        admin.setRole("ADMIN");
        when(users.getById(1L)).thenReturn(admin);
        assertThatThrownBy(() -> controller.overview(1L, "ADMIN"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        verifyNoInteractions(jdbc);
    }

    @Test
    void returnsSchoolScopedDatabaseCounts() {
        User admin = new User();
        admin.setRole("ADMIN");
        admin.setStatus(1);
        admin.setSchoolId(2L);
        when(users.getById(1L)).thenReturn(admin);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(2L))).thenReturn(3L);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(new Object[0]))).thenReturn(5L);

        var overview = controller.overview(1L, "ADMIN");

        assertThat(overview.pendingSubmissions()).isEqualTo(3);
        assertThat(overview.openContactMessages()).isEqualTo(5);
        assertThat(overview.recentModelTokens()).isEqualTo(3);
        assertThat(overview.pendingEmployerCandidates()).isEqualTo(3);
        assertThat(overview.pendingBackgroundJobs()).isEqualTo(3);
        assertThat(overview.failedBackgroundJobs()).isEqualTo(3);
        verify(jdbc, times(8)).queryForObject(anyString(), eq(Long.class), eq(2L));
    }
}
