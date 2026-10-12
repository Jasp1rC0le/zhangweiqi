package com.campusai.controller;

import com.campusai.mapper.AiModelUsageMapper;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminModelUsageControllerTest {

    @Test
    void shouldLimitUsageSummaryToAdminsSchool() {
        AiModelUsageMapper mapper = mock(AiModelUsageMapper.class);
        UserService userService = mock(UserService.class);
        User admin = new User();
        admin.setId(2L);
        admin.setSchoolId(7L);
        admin.setRole("ADMIN");
        admin.setStatus(1);
        when(userService.getById(2L)).thenReturn(admin);
        when(mapper.findRecentSummaryBySchoolId(7L)).thenReturn(List.of());

        AdminModelUsageController controller =
                new AdminModelUsageController(mapper, userService);

        assertThat(controller.recentSummary(2L, "ADMIN").getBody())
                .isEmpty();
        verify(mapper).findRecentSummaryBySchoolId(7L);
    }

    @Test
    void shouldRejectStudentBeforeReadingUsage() {
        AiModelUsageMapper mapper = mock(AiModelUsageMapper.class);
        UserService userService = mock(UserService.class);
        AdminModelUsageController controller =
                new AdminModelUsageController(mapper, userService);

        assertThatThrownBy(() -> controller.recentSummary(2L, "STUDENT"))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(mapper, userService);
    }
}
