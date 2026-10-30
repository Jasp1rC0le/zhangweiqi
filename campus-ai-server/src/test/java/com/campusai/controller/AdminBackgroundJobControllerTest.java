package com.campusai.controller;

import com.campusai.jobs.BackgroundJobRepository;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminBackgroundJobControllerTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final BackgroundJobRepository jobs = mock(BackgroundJobRepository.class);
    final UserService users = mock(UserService.class);

    private void administrator() {
        User user = new User();
        user.setRole("ADMIN"); user.setStatus(1); user.setSchoolId(7L);
        when(users.getById(1L)).thenReturn(user);
    }

    @Test void exposesOnlyAuthorizedNonCachedConfiguration() {
        administrator();
        var controller = new AdminBackgroundJobController(jdbc, jobs, users, false);
        var response = controller.runtime(1L, "ADMIN");
        assertThat(response.getBody()).isEqualTo(new AdminBackgroundJobController.RuntimeState(false));
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        verifyNoInteractions(jdbc, jobs);
    }

    @Test void pausedRetryNeverMutatesQueue() {
        administrator();
        var controller = new AdminBackgroundJobController(jdbc, jobs, users, false);
        assertThatThrownBy(() -> controller.retry(1L, "ADMIN", 99L))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> {
                    assertThat(error.getStatusCode().value()).isEqualTo(503);
                    assertThat(error.getReason()).contains("未重新排队");
                });
        verifyNoInteractions(jdbc, jobs);
    }

    @Test void rejectsUnprivilegedAndRevokedAccountsBeforeReadingRuntimeOrWritingQueue() {
        var controller = new AdminBackgroundJobController(jdbc, jobs, users, false);
        assertThatThrownBy(() -> controller.runtime(1L, "STUDENT"))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(users);
        User revoked = new User(); revoked.setRole("STUDENT"); revoked.setStatus(1);
        when(users.getById(1L)).thenReturn(revoked);
        assertThatThrownBy(() -> controller.runtime(1L, "ADMIN"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.retry(1L, "ADMIN", 99L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
        verifyNoInteractions(jdbc, jobs);
    }

    @Test void enabledRetryStillUsesCurrentDatabaseSchoolAndRepositoryConflictCheck() {
        administrator();
        var controller = new AdminBackgroundJobController(jdbc, jobs, users, true);
        when(jobs.retryFailed(7L, 99L)).thenReturn(true);
        controller.retry(1L, "ADMIN", 99L);
        verify(jobs).retryFailed(7L, 99L);
        assertThatThrownBy(() -> controller.retry(1L, "ADMIN", 100L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
    }
}
