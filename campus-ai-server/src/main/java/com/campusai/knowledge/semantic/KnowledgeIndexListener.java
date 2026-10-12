package com.campusai.knowledge.semantic;

import com.campusai.jobs.BackgroundJobRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class KnowledgeIndexListener {
    private final BackgroundJobRepository jobs;

    public KnowledgeIndexListener(BackgroundJobRepository jobs) {
        this.jobs = jobs;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onImported(KnowledgeIndexRequested event) {
        jobs.enqueueKnowledgeIndex(event.schoolId(), event.documentId());
    }
}
