package com.campusai.teaching;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@ConditionalOnProperty(name="app.teaching.enabled",havingValue="true")
public class TeachingReminderScheduler {
    private static final Logger log=LoggerFactory.getLogger(TeachingReminderScheduler.class);
    private final TeachingService service;
    private final boolean jobsEnabled;
    private final java.util.concurrent.atomic.AtomicBoolean active=new java.util.concurrent.atomic.AtomicBoolean();
    public TeachingReminderScheduler(TeachingService service,@Value("${app.jobs.enabled:true}") boolean jobsEnabled) { this.service=service; this.jobsEnabled=jobsEnabled; }
    @Scheduled(fixedDelayString="${app.teaching.reminder-delay-ms:30000}",initialDelay=30000)
    public void tick() {
        if(!jobsEnabled || !active.compareAndSet(false,true)) return;
        try { service.dispatchDueNotices(); }
        catch(RuntimeException failure) { log.error("Teaching reminder dispatch failed; no personal details logged (type={})",failure.getClass().getSimpleName()); }
        finally {active.set(false);}
    }
}
