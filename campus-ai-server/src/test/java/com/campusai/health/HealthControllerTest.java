package com.campusai.health;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import static org.assertj.core.api.Assertions.assertThat;

class HealthControllerTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final HealthController controller = new HealthController(jdbc);

    @Test
    void shouldReturnUpStatus() {
        HealthController.HealthResponse response = controller.health();

        assertThat(response.status()).isEqualTo("UP");
        assertThat(response.service()).isEqualTo("campus-ai-server");
        assertThat(response.timestamp()).isNotNull();
    }

    @Test
    void readinessRequiresCoreTables() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(49, 48, 21);

        assertThat(controller.ready().getStatusCode().value()).isEqualTo(200);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        org.mockito.Mockito.verify(jdbc, org.mockito.Mockito.times(3)).queryForObject(
                org.mockito.ArgumentMatchers.argThat(sql -> sql.contains("campus_wall_reports")
                        && sql.contains("project_reviews") && sql.contains("account_action_tokens")
                        && sql.contains("ai_provider_attempts") && sql.contains("ai_messages")
                        && sql.contains("contact_submission_keys") && sql.contains("student_timetable_versions")
                        && sql.contains("student_timetables") && sql.contains("student_course_schedule_versions")
                        && sql.contains("student_course_schedules")), eq(Integer.class));
    }

    @Test
    void oldSchemaWithoutTimetableMigrationsMustNotReportReady() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(45, 47, null);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
    }

    @Test
    void readinessHidesDatabaseFailureDetails() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class)))
                .thenThrow(new DataAccessResourceFailureException("secret jdbc details"));

        var response = controller.ready();
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().status()).isEqualTo("NOT_READY");
    }
}
