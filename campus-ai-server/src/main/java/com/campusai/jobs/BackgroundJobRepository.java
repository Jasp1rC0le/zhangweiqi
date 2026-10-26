package com.campusai.jobs;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.time.LocalDate;
import java.time.ZoneId;

@Repository
public class BackgroundJobRepository {
    private final JdbcTemplate jdbc;

    public BackgroundJobRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void enqueueKnowledgeIndex(Long schoolId, Long documentId) {
        String dedupe = schoolId + ":" + documentId;
        jdbc.update("INSERT INTO background_jobs (school_id, job_type, ref_id, dedupe_key) "
                        + "VALUES (?, 'KNOWLEDGE_INDEX', ?, ?) ON DUPLICATE KEY UPDATE "
                        // MySQL evaluates assignments left to right: change status only after its guards.
                        + "attempt_count = CASE WHEN status = 'FAILED' THEN 0 ELSE attempt_count END, "
                        + "available_at = CASE WHEN status = 'FAILED' THEN CURRENT_TIMESTAMP ELSE available_at END, "
                        + "last_error = CASE WHEN status = 'FAILED' THEN NULL ELSE last_error END, "
                        + "status = CASE WHEN status = 'FAILED' THEN 'PENDING' ELSE status END",
                schoolId, documentId, dedupe);
    }

    public void enqueueKnowledgeRefresh(Long schoolId, Long documentId) {
        String date = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString();
        String dedupe = schoolId + ":" + documentId + ":" + date;
        jdbc.update("INSERT INTO background_jobs (school_id, job_type, ref_id, dedupe_key) "
                        + "VALUES (?, 'KNOWLEDGE_REFRESH', ?, ?) ON DUPLICATE KEY UPDATE id = id",
                schoolId, documentId, dedupe);
    }

    public void enqueueKnowledgeRefreshNow(Long schoolId, Long documentId) {
        String dedupe = schoolId + ":" + documentId + ":manual:" + UUID.randomUUID();
        jdbc.update("INSERT INTO background_jobs (school_id, job_type, ref_id, dedupe_key) "
                        + "VALUES (?, 'KNOWLEDGE_REFRESH', ?, ?)", schoolId, documentId, dedupe);
    }

    @Transactional
    public BackgroundJob claim() {
        List<BackgroundJob> rows = jdbc.query("SELECT id, school_id, job_type, ref_id, "
                        + "attempt_count, max_attempts FROM background_jobs "
                        + "WHERE status = 'PENDING' AND available_at <= CURRENT_TIMESTAMP "
                        + "ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED",
                (result, row) -> new BackgroundJob(result.getLong("id"), result.getLong("school_id"),
                        result.getString("job_type"), (Long) result.getObject("ref_id"),
                        result.getInt("attempt_count") + 1, result.getInt("max_attempts")));
        if (rows.isEmpty()) return null;
        BackgroundJob job = rows.get(0);
        int updated = jdbc.update("UPDATE background_jobs SET status = 'RUNNING', locked_at = CURRENT_TIMESTAMP, "
                + "attempt_count = attempt_count + 1 WHERE id = ? AND status = 'PENDING'", job.id());
        return updated == 1 ? job : null;
    }

    public void complete(Long id) {
        jdbc.update("UPDATE background_jobs SET status = 'DONE', locked_at = NULL, last_error = NULL "
                + "WHERE id = ? AND status = 'RUNNING'", id);
    }

    public void fail(BackgroundJob job, String error) {
        boolean exhausted = job.attemptCount() >= job.maxAttempts();
        int delaySeconds = Math.min(300, 5 * (1 << Math.min(6, job.attemptCount())));
        jdbc.update("UPDATE background_jobs SET status = ?, locked_at = NULL, last_error = ?, "
                        + "available_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND) "
                        + "WHERE id = ? AND status = 'RUNNING'",
                exhausted ? "FAILED" : "PENDING", error, delaySeconds, job.id());
    }

    public int recoverStale() {
        return jdbc.update("UPDATE background_jobs SET "
                + "status = IF(attempt_count >= max_attempts, 'FAILED', 'PENDING'), locked_at = NULL, "
                + "last_error = 'worker interrupted before completion', available_at = CURRENT_TIMESTAMP "
                + "WHERE status = 'RUNNING' AND locked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE)");
    }

    public boolean retryFailed(Long schoolId, Long id) {
        return jdbc.update("UPDATE background_jobs SET status = 'PENDING', attempt_count = 0, "
                        + "available_at = CURRENT_TIMESTAMP, locked_at = NULL, last_error = NULL "
                        + "WHERE id = ? AND school_id = ? AND status = 'FAILED'", id, schoolId) == 1;
    }
}
