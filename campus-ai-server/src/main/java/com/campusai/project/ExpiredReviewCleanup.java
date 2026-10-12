package com.campusai.project;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Expiry already blocks access immediately; erase the redundant shared copy on the next run. */
@Component
public class ExpiredReviewCleanup {
    private final JdbcTemplate jdbc;
    public ExpiredReviewCleanup(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Scheduled(fixedDelay = 3600000, initialDelay = 60000)
    public int cleanup() {
        return jdbc.update("UPDATE project_reviews SET snapshot_json='{}',review_note='' "
                + "WHERE (expires_at <= CURRENT_TIMESTAMP OR revoked_at IS NOT NULL) "
                + "AND (snapshot_json <> '{}' OR review_note <> '')");
    }
}
