package com.campusai.jobs;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

@Timeout(10)
class BackgroundJobRepositoryTest {
    private JdbcTemplate jdbc;
    private BackgroundJobRepository jobs;

    @BeforeEach void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:jobs" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE background_jobs (id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "school_id BIGINT NOT NULL, job_type VARCHAR(50) NOT NULL, ref_id BIGINT, "
                + "dedupe_key VARCHAR(191) NOT NULL, status VARCHAR(20) DEFAULT 'PENDING', "
                + "attempt_count INT DEFAULT 0, max_attempts INT DEFAULT 5, "
                + "available_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, locked_at TIMESTAMP, last_error VARCHAR(500), "
                + "UNIQUE(job_type, dedupe_key))");
        jobs = new BackgroundJobRepository(jdbc);
    }

    @Test void newIndexIsPendingAndSeparatedBySchool() {
        jobs.enqueueKnowledgeIndex(1L, 19L);
        jobs.enqueueKnowledgeIndex(2L, 19L);
        assertThat(count()).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT status FROM background_jobs", String.class))
                .containsOnly("PENDING");
        assertThat(jdbc.queryForList("SELECT attempt_count FROM background_jobs", Integer.class))
                .containsOnly(0);
    }

    @Test void failedIndexRequeueResetsAttemptsAvailabilityAndError() {
        jobs.enqueueKnowledgeIndex(1L, 19L);
        jdbc.update("UPDATE background_jobs SET status='FAILED', attempt_count=5, "
                + "available_at='2099-01-01 00:00:00', last_error='synthetic failure' WHERE school_id=1");
        jobs.enqueueKnowledgeIndex(1L, 19L);
        assertThat(count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM background_jobs", String.class)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT attempt_count FROM background_jobs", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT last_error FROM background_jobs", String.class)).isNull();
        assertThat(jdbc.queryForObject("SELECT available_at FROM background_jobs", LocalDateTime.class))
                .isBefore(LocalDateTime.of(2099, 1, 1, 0, 0));
    }

    @Test void activeAndCompletedIndexDuplicatesDoNotResetOrRestart() {
        for (String status : new String[]{"PENDING", "RUNNING", "DONE"}) {
            long document = switch (status) { case "PENDING" -> 19; case "RUNNING" -> 20; default -> 21; };
            jobs.enqueueKnowledgeIndex(1L, document);
            jdbc.update("UPDATE background_jobs SET status=?, attempt_count=3, "
                            + "available_at='2099-01-01 00:00:00', last_error='retained' WHERE ref_id=?",
                    status, document);
            jobs.enqueueKnowledgeIndex(1L, document);
            assertThat(jdbc.queryForObject("SELECT status FROM background_jobs WHERE ref_id=?", String.class, document))
                    .isEqualTo(status);
            assertThat(jdbc.queryForObject("SELECT attempt_count FROM background_jobs WHERE ref_id=?", Integer.class, document))
                    .isEqualTo(3);
            assertThat(jdbc.queryForObject("SELECT last_error FROM background_jobs WHERE ref_id=?", String.class, document))
                    .isEqualTo("retained");
        }
        assertThat(count()).isEqualTo(3);
    }

    @Test void conditionalResetsPrecedeStatusAssignmentForMysqlLeftToRightEvaluation() {
        JdbcTemplate captured = mock(JdbcTemplate.class);
        new BackgroundJobRepository(captured).enqueueKnowledgeIndex(1L, 19L);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(captured).update(sql.capture(), eq(1L), eq(19L), eq("1:19"));
        String update = sql.getValue().split("ON DUPLICATE KEY UPDATE", 2)[1];
        int status = assignment(update, "status");
        assertThat(assignment(update, "attempt_count")).isLessThan(status);
        assertThat(assignment(update, "available_at")).isLessThan(status);
        assertThat(assignment(update, "last_error")).isLessThan(status);
    }

    @Test void dailyRefreshDoesNotReopenAnExhaustedJobOrDuplicateItsSchoolKey() {
        jobs.enqueueKnowledgeRefresh(1L, 19L);
        jdbc.update("UPDATE background_jobs SET status='FAILED', attempt_count=5, last_error='retained'");
        jobs.enqueueKnowledgeRefresh(1L, 19L);
        jobs.enqueueKnowledgeRefresh(2L, 19L);
        assertThat(count()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT status FROM background_jobs WHERE school_id=1", String.class))
                .isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("SELECT attempt_count FROM background_jobs WHERE school_id=1", Integer.class))
                .isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT dedupe_key FROM background_jobs WHERE school_id=1", String.class))
                .isEqualTo("1:19:" + LocalDate.now(ZoneId.of("Asia/Shanghai")));
    }

    @Test void explicitManualRequestsHaveDistinctUuidKeysWithoutDependingOnMillisecondTiming() {
        jobs.enqueueKnowledgeRefreshNow(1L, 19L);
        jobs.enqueueKnowledgeRefreshNow(1L, 19L);
        var keys = jdbc.queryForList("SELECT dedupe_key FROM background_jobs", String.class);
        assertThat(keys).hasSize(2).doesNotHaveDuplicates();
        for (String key : keys) {
            assertThat(key).startsWith("1:19:manual:");
            assertThat(UUID.fromString(key.substring("1:19:manual:".length())).version()).isEqualTo(4);
        }
    }

    private int count() { return jdbc.queryForObject("SELECT COUNT(*) FROM background_jobs", Integer.class); }
    private int assignment(String sql, String column) {
        var match = Pattern.compile("(?:^|,)\\s*" + column + "\\s*=\\s*(?:IF\\(|CASE\\b)").matcher(sql);
        assertThat(match.find()).as("Conditional assignment for %s", column).isTrue();
        return match.start();
    }
}
