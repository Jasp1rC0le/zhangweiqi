package com.campusai.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class LoginThrottle {
    private final JdbcTemplate jdbc;

    public LoginThrottle(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void check(String username, HttpServletRequest request) {
        // getRemoteAddr is deliberately used rather than an untrusted X-Forwarded-For header.
        String remote = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
        // A campus NAT or reverse proxy can put many students behind one IP.
        increment("ip:" + remote, 300);
        increment("user:" + username.trim().toLowerCase(Locale.ROOT), 10);
    }

    public void succeeded(String username) {
        jdbc.update("DELETE FROM auth_login_attempts WHERE bucket_key = ?",
                digest("user:" + username.trim().toLowerCase(Locale.ROOT)));
    }

    public void checkRecovery(String identifier, HttpServletRequest request) {
        String remote = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
        increment("recovery-ip:" + remote, 80);
        increment("recovery-account:" + identifier.trim().toLowerCase(Locale.ROOT), 5);
    }

    public void checkPublic(String action, int maximum, HttpServletRequest request) {
        String remote = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
        increment("public:" + action + ":" + remote, maximum);
    }

    private void increment(String identifier, int maximum) {
        String key = digest(identifier);
        jdbc.update("INSERT INTO auth_login_attempts (bucket_key, window_start, attempts) "
                + "VALUES (?, NOW(), 1) ON DUPLICATE KEY UPDATE "
                + "attempts = IF(window_start < NOW() - INTERVAL 15 MINUTE, 1, attempts + 1), "
                + "window_start = IF(window_start < NOW() - INTERVAL 15 MINUTE, NOW(), window_start)", key);
        Integer attempts = jdbc.queryForObject(
                "SELECT attempts FROM auth_login_attempts WHERE bucket_key = ?", Integer.class, key);
        if (attempts != null && attempts > maximum) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "请求过于频繁，请15分钟后重试");
        }
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
