package com.campusai.jobs;

import com.campusai.knowledge.semantic.KnowledgeSemanticService;
import com.campusai.knowledge.importing.KnowledgeSourceRefreshService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackgroundJobWorkerTest {
    private final BackgroundJobRepository jobs = mock(BackgroundJobRepository.class);
    private final KnowledgeSemanticService semantic = mock(KnowledgeSemanticService.class);
    private final KnowledgeSourceRefreshService refresh = mock(KnowledgeSourceRefreshService.class);
    private final BackgroundJobWorker worker = new BackgroundJobWorker(jobs, semantic, refresh);

    @Test
    void completesKnowledgeIndexJob() {
        BackgroundJob job = new BackgroundJob(7L, 1L, "KNOWLEDGE_INDEX", 19L, 1, 5);
        when(jobs.claim()).thenReturn(job);

        worker.runNext();

        verify(semantic).indexDocument(1L, 19L);
        verify(jobs).complete(7L);
        verify(jobs, never()).fail(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void retriesFailedKnowledgeIndexJob() {
        BackgroundJob job = new BackgroundJob(7L, 1L, "KNOWLEDGE_INDEX", 19L, 2, 5);
        when(jobs.claim()).thenReturn(job);
        doThrow(new IllegalStateException("provider secret must not leak"))
                .when(semantic).indexDocument(1L, 19L);

        worker.runNext();

        verify(jobs).fail(job, "IllegalStateException");
        verify(jobs, never()).complete(7L);
    }

    @Test
    void idlePollDoesNothing() {
        worker.runNext();

        verify(semantic, never()).indexDocument(
                org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void completesKnowledgeRefreshJob() {
        BackgroundJob job = new BackgroundJob(8L, 1L, "KNOWLEDGE_REFRESH", 20L, 1, 5);
        when(jobs.claim()).thenReturn(job);

        worker.runNext();

        verify(refresh).check(1L, 20L);
        verify(jobs).complete(8L);
    }
}
