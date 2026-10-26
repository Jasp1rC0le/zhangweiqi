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
    @Test void controlledLessonChangesNeedTwoTablesAndReviewedTeachingRosterLifecyclePrerequisites(){
        var db=mock(JdbcTemplate.class);when(db.queryForObject(anyString(),eq(Integer.class))).thenReturn(54,1,54,2,9,2,4,6);
        var health=new HealthController(db,true,true,true,true);org.springframework.test.util.ReflectionTestUtils.setField(health,"lessonChangesEnabled",true);
        assertThat(health.ready().getStatusCode().value()).isEqualTo(503);assertThat(health.ready().getStatusCode().value()).isEqualTo(200);
        when(db.queryForObject(anyString(),eq(Integer.class))).thenReturn(54);var missing=new HealthController(db,true,false,true,true);org.springframework.test.util.ReflectionTestUtils.setField(missing,"lessonChangesEnabled",true);assertThat(missing.ready().getStatusCode().value()).isEqualTo(503);
    }
    @Test void controlledResponsibilityNeedsBothTablesAndReviewedIdentityPrerequisites(){
        var db=mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(),eq(Integer.class))).thenReturn(54,1,54,2,9,2);
        var health=new HealthController(db,true,true);
        org.springframework.test.util.ReflectionTestUtils.setField(health,"responsibilityEnabled",true);
        assertThat(health.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(health.ready().getStatusCode().value()).isEqualTo(200);
        when(db.queryForObject(anyString(),eq(Integer.class))).thenReturn(54);
        var missingIdentity=new HealthController(db,true,false);
        org.springframework.test.util.ReflectionTestUtils.setField(missingIdentity,"responsibilityEnabled",true);
        assertThat(missingIdentity.ready().getStatusCode().value()).isEqualTo(503);
    }
    @org.junit.jupiter.api.Test void lifecycleReadinessRequiresAllSixAdditiveTablesAndTeachingRosterPrerequisites(){
        var db=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        org.mockito.Mockito.when(db.queryForObject(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Integer.class))).thenReturn(54,9,4,5,54,9,4,6);
        var health=new HealthController(db,true,false,true,true);
        org.junit.jupiter.api.Assertions.assertEquals(503,health.ready().getStatusCode().value());org.junit.jupiter.api.Assertions.assertEquals(200,health.ready().getStatusCode().value());
        org.mockito.Mockito.when(db.queryForObject(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Integer.class))).thenReturn(54);
        org.junit.jupiter.api.Assertions.assertEquals(503,new HealthController(db,false,false,false,true).ready().getStatusCode().value());
    }

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
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(54, 53, 21);

        assertThat(controller.ready().getStatusCode().value()).isEqualTo(200);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        org.mockito.Mockito.verify(jdbc, org.mockito.Mockito.times(3)).queryForObject(
                org.mockito.ArgumentMatchers.argThat(sql -> sql.contains("campus_wall_reports")
                        && sql.contains("project_reviews") && sql.contains("account_action_tokens")
                        && sql.contains("ai_provider_attempts") && sql.contains("ai_messages")
                        && sql.contains("contact_submission_keys") && sql.contains("student_timetable_versions")
                        && sql.contains("student_timetables") && sql.contains("student_course_schedule_versions")
                        && sql.contains("student_course_schedules") && sql.contains("material_command_receipts")
                        && sql.contains("private_material_files") && sql.contains("private_material_quota")
                        && sql.contains("personal_schedule_terms") && sql.contains("personal_schedule_history")), eq(Integer.class));
    }

    @Test
    void schemaWithoutAnyNewMaterialOrPersonalHistoryTableMustNotReportReady() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(49, 50, 51, 52, 53);
        for (int count = 49; count < 54; count++) {
            assertThat(controller.ready().getStatusCode().value()).isEqualTo(503);
        }
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
    @Test
    void enabledTeachingRequiresAllNinePrivateTables() {
        var enabled=new HealthController(jdbc,true);
        when(jdbc.queryForObject(anyString(),eq(Integer.class))).thenReturn(54,8,54,9,54,null);
        assertThat(enabled.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(enabled.ready().getStatusCode().value()).isEqualTo(200);
        assertThat(enabled.ready().getStatusCode().value()).isEqualTo(503);
        org.mockito.Mockito.verify(jdbc,org.mockito.Mockito.times(3)).queryForObject(
                org.mockito.ArgumentMatchers.argThat(sql->sql.contains("teaching_binding_audit") && sql.contains("teaching_notices") && sql.contains("teaching_attendance_audit")),eq(Integer.class));
    }
    @Test
    void disabledTeachingNeedsNoPrivateTeachingSchemaAndEnabledFailureStaysGeneric() {
        when(jdbc.queryForObject(anyString(),eq(Integer.class))).thenReturn(54);
        assertThat(controller.ready().getStatusCode().value()).isEqualTo(200);
        org.mockito.Mockito.verify(jdbc,org.mockito.Mockito.times(1)).queryForObject(anyString(),eq(Integer.class));
        org.mockito.Mockito.reset(jdbc);
        when(jdbc.queryForObject(anyString(),eq(Integer.class))).thenReturn(54).thenThrow(new DataAccessResourceFailureException("private teaching JDBC details"));
        var response=new HealthController(jdbc,true).ready();assertThat(response.getStatusCode().value()).isEqualTo(503);assertThat(response.getBody().status()).isEqualTo("NOT_READY");
    }
    @Test void enabledIdentityReviewNeedsBothTablesEvenWhenTeachingIsOff() {
        when(jdbc.queryForObject(anyString(),eq(Integer.class))).thenReturn(54,1,54,2);
        var identity=new HealthController(jdbc,false,true);
        assertThat(identity.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(identity.ready().getStatusCode().value()).isEqualTo(200);
    }
    @Test void enabledRosterModelRequiresFourAdditiveTablesAndTeachingEnabled() {
        when(jdbc.queryForObject(anyString(),eq(Integer.class))).thenReturn(54,9,3,54,9,4);
        var roster=new HealthController(jdbc,true,false,true);
        assertThat(roster.ready().getStatusCode().value()).isEqualTo(503);
        assertThat(roster.ready().getStatusCode().value()).isEqualTo(200);
        org.mockito.Mockito.reset(jdbc);when(jdbc.queryForObject(anyString(),eq(Integer.class))).thenReturn(54);
        assertThat(new HealthController(jdbc,false,false,true).ready().getStatusCode().value()).isEqualTo(503);
    }
}
