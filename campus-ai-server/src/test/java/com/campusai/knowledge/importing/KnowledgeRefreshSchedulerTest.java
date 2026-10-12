package com.campusai.knowledge.importing;

import com.campusai.jobs.BackgroundJobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static org.mockito.Mockito.*;

class KnowledgeRefreshSchedulerTest {
    JdbcTemplate jdbc;
    BackgroundJobRepository jobs;
    KnowledgeRefreshScheduler scheduler;

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:refresh" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE knowledge_documents(id BIGINT PRIMARY KEY, school_id BIGINT, status VARCHAR(24), "
                + "source_url VARCHAR(255), updated_at TIMESTAMP, effective_at TIMESTAMP, expires_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE knowledge_document_versions(supersedes_document_id BIGINT)");
        jdbc.execute("CREATE TABLE background_jobs(school_id BIGINT, ref_id BIGINT, job_type VARCHAR(30), "
                + "dedupe_key VARCHAR(150), created_at TIMESTAMP)");
        jobs = mock(BackgroundJobRepository.class);
        scheduler = new KnowledgeRefreshScheduler(jdbc, jobs);
    }

    void add(long id) {
        jdbc.update("INSERT INTO knowledge_documents VALUES (?,1,'PUBLISHED','https://www.tsguas.edu.cn/',"
                + "'2026-01-01 00:00:00',NULL,NULL)", id);
    }

    void checked(long id, String key, String created) {
        jdbc.update("INSERT INTO background_jobs VALUES(1,?,'KNOWLEDGE_REFRESH',?,?)", id, key, created);
    }

    @Test
    void secondBatchReachesBeyondFirstTwenty() {
        for (long id = 1; id <= 25; id++) add(id);
        scheduler.enqueueRefreshes();
        for (long id = 1; id <= 20; id++) verify(jobs).enqueueKnowledgeRefresh(1L,id);
        verifyNoMoreInteractions(jobs);
        clearInvocations(jobs);
        String date = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString();
        for (long id = 1; id <= 20; id++) checked(id,"1:"+id+":"+date,date+" 00:00:00");
        scheduler.enqueueRefreshes();
        for (long id = 21; id <= 25; id++) verify(jobs).enqueueKnowledgeRefresh(1L,id);
        verifyNoMoreInteractions(jobs);
    }

    @Test
    void neverCheckedRowsAreNotStarvedOnNextDay() {
        for (long id = 1; id <= 25; id++) add(id);
        for (long id = 1; id <= 20; id++) checked(id,"1:"+id+":old","2000-01-01 00:00:00");
        scheduler.enqueueRefreshes();
        var order = inOrder(jobs);
        for (long id = 21; id <= 25; id++) order.verify(jobs).enqueueKnowledgeRefresh(1L,id);
    }

    @Test
    void doesNotScheduleHistoricalExpiredOrFutureDocuments() {
        for (long id = 1; id <= 6; id++) add(id);
        jdbc.update("UPDATE knowledge_documents SET status='ARCHIVED' WHERE id=1");
        jdbc.update("UPDATE knowledge_documents SET expires_at='2000-01-01 00:00:00' WHERE id=2");
        jdbc.update("UPDATE knowledge_documents SET effective_at='2999-01-01 00:00:00' WHERE id=3");
        jdbc.update("INSERT INTO knowledge_document_versions VALUES(4)");
        jdbc.update("UPDATE knowledge_documents SET source_url='http://www.tsguas.edu.cn/' WHERE id=5");
        scheduler.enqueueRefreshes();
        verify(jobs).enqueueKnowledgeRefresh(1L,6L);
        verifyNoMoreInteractions(jobs);
    }
}
