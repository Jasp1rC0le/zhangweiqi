package com.campusai.knowledge.importing;

import com.campusai.jobs.BackgroundJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

import java.time.LocalDateTime;
import java.time.ZoneId;

@Component
@ConditionalOnProperty(name = "app.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class KnowledgeRefreshScheduler {
    private static final Logger log = LoggerFactory.getLogger(KnowledgeRefreshScheduler.class);
    private final JdbcTemplate jdbc;
    private final BackgroundJobRepository jobs;

    public KnowledgeRefreshScheduler(JdbcTemplate jdbc, BackgroundJobRepository jobs) {
        this.jdbc = jdbc;
        this.jobs = jobs;
    }

    @Scheduled(initialDelayString = "${app.knowledge.refresh-initial-delay-millis:60000}",
            fixedDelayString = "${app.knowledge.refresh-interval-millis:21600000}")
    public void enqueueRefreshes() {
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Shanghai"));
        var documents = jdbc.query("SELECT document.id, document.school_id "
                        + "FROM knowledge_documents document "
                        + "WHERE document.status = 'PUBLISHED' AND document.source_url LIKE 'https://%' "
                        + "AND (document.effective_at IS NULL OR document.effective_at <= ?) "
                        + "AND (document.expires_at IS NULL OR document.expires_at > ?) "
                        + "AND NOT EXISTS (SELECT 1 FROM knowledge_document_versions version "
                        + "WHERE version.supersedes_document_id = document.id) "
                        + "AND NOT EXISTS (SELECT 1 FROM background_jobs active "
                        + "WHERE active.school_id = document.school_id AND active.ref_id = document.id "
                        + "AND active.job_type = 'KNOWLEDGE_REFRESH' "
                        + "AND active.status IN ('PENDING', 'RUNNING')) "
                        + "AND NOT EXISTS (SELECT 1 FROM background_jobs today "
                        + "WHERE today.school_id = document.school_id AND today.ref_id = document.id "
                        + "AND today.job_type = 'KNOWLEDGE_REFRESH' "
                        + "AND today.dedupe_key = CONCAT(document.school_id, ':', document.id, ':', ?)) "
                        // Rotate across days too: a never-checked document comes before a recent one.
                        + "ORDER BY (SELECT MAX(history.created_at) FROM background_jobs history "
                        + "WHERE history.school_id = document.school_id AND history.ref_id = document.id "
                        + "AND history.job_type = 'KNOWLEDGE_REFRESH') ASC, document.updated_at ASC, document.id ASC LIMIT 20",
                (result, row) -> new RefreshTarget(result.getLong("id"), result.getLong("school_id")),
                now, now, now.toLocalDate().toString());
        documents.forEach(item -> jobs.enqueueKnowledgeRefresh(item.schoolId(), item.documentId()));
        if (!documents.isEmpty()) log.info("已安排 {} 份官网资料执行更新检查", documents.size());
    }

    private record RefreshTarget(Long documentId, Long schoolId) {}
}
