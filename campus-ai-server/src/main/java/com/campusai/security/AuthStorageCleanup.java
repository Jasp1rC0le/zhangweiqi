package com.campusai.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Remove expired security records so random login attempts do not grow without bound. */
@Component
public class AuthStorageCleanup {
    private final JdbcTemplate jdbc;

    public AuthStorageCleanup(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Scheduled(cron = "0 15 4 * * *", zone = "Asia/Shanghai")
    public void cleanup() {
        jdbc.update("DELETE FROM auth_login_attempts WHERE window_start < NOW() - INTERVAL 2 DAY");
        jdbc.update("DELETE FROM account_action_tokens WHERE expires_at < NOW() - INTERVAL 2 DAY");
        jdbc.update("DELETE FROM auth_sessions WHERE expires_at < NOW() - INTERVAL 7 DAY "
                + "OR revoked_at < NOW() - INTERVAL 7 DAY");
    }
}
