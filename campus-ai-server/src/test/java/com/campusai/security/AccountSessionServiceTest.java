package com.campusai.security;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class AccountSessionServiceTest {
    @Test void revocationIsOwnerScopedAndExcludesCurrentSession() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new AccountSessionService(jdbc);
        service.revokeOthers(7L, "current-session");
        verify(jdbc).update("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? "
                + "AND id <> ? AND revoked_at IS NULL AND expires_at > NOW()", 7L, "current-session");
    }
    @Test void rejectsMissingIdentityWithoutTouchingDatabase() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new AccountSessionService(jdbc);
        assertThatThrownBy(() -> service.revokeOthers(null, "session")).isInstanceOf(com.campusai.exception.UnauthorizedException.class);
        assertThatThrownBy(() -> service.list(7L, "")).isInstanceOf(com.campusai.exception.UnauthorizedException.class);
        verifyNoInteractions(jdbc);
    }
}
