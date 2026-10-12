package com.campusai.security;

import com.campusai.exception.UnauthorizedException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.List;

/** Only minimal session metadata: never expose refresh hashes, tokens, IPs or fingerprints. */
@Service
public class AccountSessionService {
    private final JdbcTemplate jdbc;
    public AccountSessionService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record SessionInfo(LocalDateTime createdAt, LocalDateTime expiresAt, boolean current) {}
    public List<SessionInfo> list(Long userId, String sessionId) {
        requireSession(userId, sessionId);
        return jdbc.query("SELECT id, created_at, expires_at FROM auth_sessions WHERE user_id = ? "
                + "AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 100",
                (rs, index) -> new SessionInfo(rs.getTimestamp("created_at").toLocalDateTime(),
                        rs.getTimestamp("expires_at").toLocalDateTime(), sessionId.equals(rs.getString("id"))), userId);
    }
    public int revokeOthers(Long userId, String sessionId) {
        requireSession(userId, sessionId);
        return jdbc.update("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? "
                + "AND id <> ? AND revoked_at IS NULL AND expires_at > NOW()", userId, sessionId);
    }
    private void requireSession(Long userId, String sessionId) {
        if (userId == null || sessionId == null || sessionId.isBlank()) throw new UnauthorizedException("请重新登录");
    }
}
