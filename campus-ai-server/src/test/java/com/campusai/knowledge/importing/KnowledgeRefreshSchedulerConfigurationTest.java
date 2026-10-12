package com.campusai.knowledge.importing;

import com.campusai.jobs.BackgroundJobRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

@Timeout(10)
class KnowledgeRefreshSchedulerConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
            .withBean(BackgroundJobRepository.class, () -> mock(BackgroundJobRepository.class))
            .withUserConfiguration(KnowledgeRefreshScheduler.class);

    @Test void disablingJobsAlsoDisablesSourceEnqueueing() {
        runner.withPropertyValues("app.jobs.enabled=false").run(context ->
                assertThat(context).doesNotHaveBean(KnowledgeRefreshScheduler.class));
    }

    @Test void enabledJobsKeepSourceEnqueueing() {
        runner.withPropertyValues("app.jobs.enabled=true").run(context ->
                assertThat(context).hasSingleBean(KnowledgeRefreshScheduler.class));
    }

    @Test void existingDefaultRemainsEnabled() {
        runner.run(context -> assertThat(context).hasSingleBean(KnowledgeRefreshScheduler.class));
    }
}
