package com.campusai.security;

import com.campusai.exception.UnauthorizedException;
import com.campusai.mapper.UserMapper;
import com.campusai.user.entity.User;
import io.jsonwebtoken.JwtException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class AuthSessionService {
    private static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;
    private final UserMapper users;
    private final JwtService jwt;
    private final int refreshDays;
    private final SecureRandom random = new SecureRandom();

    public AuthSessionService(JdbcTemplate jdbc, UserMapper users, JwtService jwt,
            @Value("${app.auth.refresh-days:30}") int refreshDays) {
        if (refreshDays < 1 || refreshDays > 90) {
            throw new IllegalArgumentException("刷新令牌有效期须为1至90天");
        }
        this.jdbc = jdbc;
        this.users = users;
        this.jwt = jwt;
        this.refreshDays = refreshDays;
    }

    public IssuedSession issue(User user) {
        String id = UUID.randomUUID().toString();
        String refresh = newRefreshToken();
        jdbc.update("INSERT INTO auth_sessions (id, user_id, refresh_hash, expires_at) VALUES (?, ?, ?, ?)",
                id, user.getId(), hash(refresh), Timestamp.valueOf(now().plusDays(refreshDays)));
        return new IssuedSession(jwt.generateToken(user, id), refresh, user);
    }

    @Transactional
    public IssuedSession refresh(String rawToken, boolean adminOnly) {
        if (rawToken == null || rawToken.isBlank()) throw invalid();
        String oldHash = hash(rawToken);
        List<SessionRow> sessions = jdbc.query(
                "SELECT id, user_id FROM auth_sessions WHERE refresh_hash = ? "
                        + "AND revoked_at IS NULL AND expires_at > NOW()",
                (rs, rowNum) -> new SessionRow(rs.getString("id"), rs.getLong("user_id")), oldHash);
        if (sessions.isEmpty()) throw invalid();
        SessionRow session = sessions.get(0);
        User user = users.findById(session.userId());
        if (user == null || user.getStatus() == null || user.getStatus() != 1
                || (adminOnly && !"ADMIN".equals(user.getRole()))) throw invalid();

        String next = newRefreshToken();
        int changed = jdbc.update("UPDATE auth_sessions SET refresh_hash = ?, expires_at = ? "
                        + "WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL AND expires_at > NOW()",
                hash(next), Timestamp.valueOf(now().plusDays(refreshDays)), session.id(), oldHash);
        if (changed != 1) throw invalid();
        return new IssuedSession(jwt.generateToken(user, session.id()), next, user);
    }

    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        jdbc.update("UPDATE auth_sessions SET revoked_at = NOW() "
                + "WHERE refresh_hash = ? AND revoked_at IS NULL", hash(rawToken));
    }

    public void revokeAccessToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) return;
        try {
            var claims = jwt.parseToken(authorization.substring(7).trim());
            String sessionId = claims.get("sid", String.class);
            Long userId = Long.valueOf(claims.getSubject());
            if (sessionId != null) {
                jdbc.update("UPDATE auth_sessions SET revoked_at = NOW() "
                        + "WHERE id = ? AND user_id = ? AND revoked_at IS NULL", sessionId, userId);
            }
        } catch (JwtException | IllegalArgumentException ignored) {
            // An absent or expired access token must not prevent cookie-based logout.
        }
    }

    public boolean active(String sessionId, Long userId, String role) {
        if (sessionId == null || sessionId.isBlank() || userId == null || role == null) return false;
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM auth_sessions session "
                + "JOIN users account ON account.id = session.user_id "
                + "WHERE session.id = ? AND session.user_id = ? AND session.revoked_at IS NULL "
                + "AND session.expires_at > NOW() AND account.status = 1 AND account.role = ?",
                Integer.class, sessionId, userId, role);
        return count != null && count > 0;
    }

    private String newRefreshToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("当前Java环境不支持SHA-256", exception);
        }
    }

    private LocalDateTime now() { return LocalDateTime.now(SCHOOL_ZONE); }
    private UnauthorizedException invalid() { return new UnauthorizedException("登录会话已失效，请重新登录"); }

    public record IssuedSession(String accessToken, String refreshToken, User user) {}
    private record SessionRow(String id, Long userId) {}
}
