package com.campusai.teaching;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(5)
class TeachingReminderSchedulerTest {
    @Test void disabledJobsNeverDispatchEvenWhenTeachingReadsAreEnabled() {
        var service=mock(TeachingService.class); new TeachingReminderScheduler(service,false).tick(); verifyNoInteractions(service);
    }
    @Test void enabledJobsDispatchAndDoNotLogPersonalExceptionPayloads() {
        var service=mock(TeachingService.class); new TeachingReminderScheduler(service,true).tick(); verify(service).dispatchDueNotices();
        reset(service); when(service.dispatchDueNotices()).thenThrow(new IllegalStateException("synthetic-sensitive-value-not-to-log"));
        new TeachingReminderScheduler(service,true).tick(); verify(service).dispatchDueNotices();
    }
    @Test void overlappingTicksDoNotStartAnotherTransactionAndReleaseAfterCommitOrFailure() throws Exception {
        var service=mock(TeachingService.class);var entered=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        when(service.dispatchDueNotices()).thenAnswer(call->{entered.countDown();if(!release.await(2,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException();return 1;});
        var scheduler=new TeachingReminderScheduler(service,true);var pool=java.util.concurrent.Executors.newSingleThreadExecutor();
        try {var first=pool.submit(scheduler::tick);assertTrue(entered.await(2,java.util.concurrent.TimeUnit.SECONDS));scheduler.tick();verify(service,times(1)).dispatchDueNotices();release.countDown();first.get(2,java.util.concurrent.TimeUnit.SECONDS);scheduler.tick();verify(service,times(2)).dispatchDueNotices();}
        finally {release.countDown();pool.shutdownNow();org.junit.jupiter.api.Assertions.assertTrue(pool.awaitTermination(2,java.util.concurrent.TimeUnit.SECONDS));}
    }
}
