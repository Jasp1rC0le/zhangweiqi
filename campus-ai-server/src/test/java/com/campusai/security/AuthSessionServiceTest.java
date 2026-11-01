package com.campusai.security;

import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.util.List;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuthSessionServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UserMapper users = mock(UserMapper.class);
    private final JwtService jwt = new JwtService(
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes()), 900000);
    private final AuthSessionService service = new AuthSessionService(jdbc, users, jwt, 30);

    private User activeUser() {
        User user=new User();user.setId(7L);user.setUsername("student");user.setRole("STUDENT");user.setSchoolId(1L);user.setStatus(1);user.setPasswordHash("synthetic-stored-hash");
        when(jdbc.queryForList("SELECT id FROM users WHERE id=? AND status=1 FOR UPDATE",Long.class,7L)).thenReturn(List.of(7L));
        when(users.findById(7L)).thenReturn(user);return user;
    }

    @Test
    void issuesRefreshTokenWithoutStoringItsPlaintext() {
        User user = activeUser();

        var issued = service.issue(user);

        assertThat(issued.refreshToken()).hasSizeGreaterThan(40);
        assertThat(jwt.parseToken(issued.accessToken()).get("sid", String.class)).isNotBlank();
        verify(jdbc).update(contains("INSERT INTO auth_sessions"), any(), eq(7L),
                argThat(value -> !issued.refreshToken().equals(value)), any());
    }

    @Test
    void logoutCanRevokeSessionEvenWhenRefreshCookieIsMissing() {
        User user = activeUser();
        var issued = service.issue(user);
        String sessionId = jwt.parseToken(issued.accessToken()).get("sid", String.class);

        service.revokeAccessToken("Bearer " + issued.accessToken());

        verify(jdbc).update(contains("WHERE id = ? AND user_id = ?"), eq(sessionId), eq(7L));
    }

    @Test void stalePasswordOrRoleSnapshotCannotCreateANewSessionAfterAChange() {
        User snapshot=activeUser();User latest=new User();latest.setId(7L);latest.setStatus(1);latest.setSchoolId(1L);latest.setRole("STUDENT");latest.setPasswordHash("synthetic-new-hash");
        when(users.findById(7L)).thenReturn(latest);
        assertThatThrownBy(()->service.issue(snapshot)).hasMessageContaining("登录会话已失效");
        latest.setPasswordHash(snapshot.getPasswordHash());latest.setRole("ADMIN");
        assertThatThrownBy(()->service.issue(snapshot)).hasMessageContaining("登录会话已失效");
        verify(jdbc,never()).update(contains("INSERT INTO auth_sessions"),any(),any(),any(),any());
    }

    @Test
    void malformedAccessTokenCannotRevokeAnotherSession() {
        service.revokeAccessToken("Bearer invalid");
        verifyNoInteractions(jdbc);
    }

    @Test
    @SuppressWarnings("unchecked")
    void refreshRotatesTokenAndRejectsFailedCompareAndSwap() throws Exception {
        User user = new User();
        user.setId(7L);
        user.setUsername("student");
        user.setRole("STUDENT");
        user.setStatus(1);
        when(users.findById(7L)).thenReturn(user);
        when(jdbc.query(anyString(), any(RowMapper.class), anyString())).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            ResultSet row = mock(ResultSet.class);
            when(row.getString("id")).thenReturn("session-id");
            when(row.getLong("user_id")).thenReturn(7L);
            return List.of(mapper.mapRow(row, 0));
        });
        when(jdbc.update(contains("UPDATE auth_sessions SET refresh_hash"), any(), any(), any(), any()))
                .thenReturn(1, 0);

        var first = service.refresh("original-token", false);

        assertThat(first.refreshToken()).isNotEqualTo("original-token");
        assertThat(jwt.parseToken(first.accessToken()).get("sid", String.class)).isEqualTo("session-id");
        assertThatThrownBy(() -> service.refresh("original-token", false))
                .hasMessageContaining("登录会话已失效");
    }
}
