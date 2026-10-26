package com.campusai.config;

import org.junit.jupiter.api.*;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(5)
class ChatAsyncConfigurationTest {
    @Test void asyncResponseWorkersAreBoundedAndRejectInsteadOfUnboundedQueuing() throws Exception {
        try(var context=new AnnotationConfigApplicationContext(ChatAsyncConfiguration.class)) {
            var executor=context.getBean(ThreadPoolTaskExecutor.class);var entered=new CountDownLatch(8);var release=new CountDownLatch(1);
            try {
                for(int i=0;i<8;i++)executor.execute(()->{entered.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}});
                assertTrue(entered.await(1,TimeUnit.SECONDS));assertEquals(8,executor.getMaxPoolSize());assertEquals(0,executor.getThreadPoolExecutor().getQueue().remainingCapacity());
                assertThrows(RejectedExecutionException.class,()->executor.execute(()->{}));
            } finally {release.countDown();}
        }
    }
}
