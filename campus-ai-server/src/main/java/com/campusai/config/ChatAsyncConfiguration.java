package com.campusai.config;

import org.springframework.context.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class ChatAsyncConfiguration implements WebMvcConfigurer {
    @Bean public ThreadPoolTaskExecutor chatResponseExecutor() {
        var executor=new ThreadPoolTaskExecutor();executor.setThreadNamePrefix("chat-response-");
        executor.setCorePoolSize(4);executor.setMaxPoolSize(8);executor.setQueueCapacity(0);
        executor.setWaitForTasksToCompleteOnShutdown(false);return executor;
    }
    @Override public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setTaskExecutor(chatResponseExecutor()).setDefaultTimeout(180000);
    }
}
