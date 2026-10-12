package com.campusai.controller;

import com.campusai.ai.usage.AiSpendGuard;
import com.campusai.service.UserService;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class AdminAiBudgetControllerTest {
    @Test void onlyExplicitActiveOperatorCanReadPlatformStats() {
        var guard = mock(AiSpendGuard.class); var users = mock(UserService.class);
        var controller = new AdminAiBudgetController(guard, users, 7);
        assertThatThrownBy(() -> controller.overview(8L, "ADMIN")).hasMessageContaining("403");
        assertThatThrownBy(() -> controller.overview(7L, "STUDENT")).hasMessageContaining("403");
        assertThatThrownBy(() -> controller.daily(8L, "ADMIN", java.time.LocalDate.now(), java.time.LocalDate.now().plusDays(1))).hasMessageContaining("403");
        verifyNoInteractions(guard, users);
        var operator = new User(); operator.setRole("ADMIN"); operator.setStatus(0);
        when(users.getById(7L)).thenReturn(operator);
        assertThatThrownBy(() -> controller.overview(7L, "ADMIN")).hasMessageContaining("403");
        verifyNoInteractions(guard);
        operator.setStatus(1); controller.overview(7L, "ADMIN"); verify(guard).overview();
    }
}
