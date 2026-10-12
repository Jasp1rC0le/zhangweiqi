package com.campusai.jobs;

import com.campusai.knowledge.semantic.KnowledgeSemanticService;
import com.campusai.knowledge.importing.KnowledgeSourceRefreshService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(name = "app.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class BackgroundJobWorker {
    private static final Logger log = LoggerFactory.getLogger(BackgroundJobWorker.class);

    private final BackgroundJobRepository jobs;
    private final KnowledgeSemanticService semantic;
    private final KnowledgeSourceRefreshService refresh;

    public BackgroundJobWorker(BackgroundJobRepository jobs, KnowledgeSemanticService semantic,
                               KnowledgeSourceRefreshService refresh) {
        this.jobs = jobs;
        this.semantic = semantic;
        this.refresh = refresh;
    }

    @Scheduled(initialDelayString = "${app.jobs.initial-delay-millis:5000}",
            fixedDelayString = "${app.jobs.poll-millis:2000}")
    public void runNext() {
        BackgroundJob job = jobs.claim();
        if (job == null) return;
        try {
            if (job.refId() == null) {
                throw new IllegalArgumentException("unsupported job type");
            }
            if ("KNOWLEDGE_INDEX".equals(job.type())) {
                semantic.indexDocument(job.schoolId(), job.refId());
            } else if ("KNOWLEDGE_REFRESH".equals(job.type())) {
                refresh.check(job.schoolId(), job.refId());
            } else {
                throw new IllegalArgumentException("unsupported job type");
            }
            jobs.complete(job.id());
        } catch (RuntimeException exception) {
            String error = "KNOWLEDGE_REFRESH".equals(job.type())
                    && exception instanceof ResponseStatusException response
                    && response.getReason() != null
                    ? "官网读取失败：" + response.getReason()
                    : exception.getClass().getSimpleName();
            jobs.fail(job, error);
            log.warn("后台任务 {} 第 {} 次执行失败: {}", job.id(), job.attemptCount(), error);
        }
    }

    @Scheduled(initialDelay = 30_000, fixedDelay = 60_000)
    public void recoverInterruptedJobs() {
        int recovered = jobs.recoverStale();
        if (recovered > 0) log.warn("已恢复 {} 个中断的后台任务", recovered);
    }
}
