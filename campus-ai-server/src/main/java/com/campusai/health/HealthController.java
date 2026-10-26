package com.campusai.health;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/health")
public class  HealthController {
    private final JdbcTemplate jdbc;
    private final boolean teachingEnabled;
    private final boolean identitiesEnabled;
    private final boolean rostersEnabled;
    private final boolean lifecycleEnabled;
    @Value("${app.teaching.responsibility-enabled:false}") private boolean responsibilityEnabled;
    @Value("${app.teaching.lesson-change-enabled:false}") private boolean lessonChangesEnabled;

    public HealthController(JdbcTemplate jdbc) {
        this(jdbc,false);
    }
    public HealthController(JdbcTemplate jdbc,boolean teachingEnabled) { this(jdbc,teachingEnabled,false); }
    public HealthController(JdbcTemplate jdbc,@Value("${app.teaching.enabled:false}") boolean teachingEnabled,
            @Value("${app.teaching.identity-enabled:false}") boolean identitiesEnabled) {
        this(jdbc,teachingEnabled,identitiesEnabled,false);
    }
    public HealthController(JdbcTemplate jdbc,boolean teachingEnabled,boolean identitiesEnabled,boolean rostersEnabled){this(jdbc,teachingEnabled,identitiesEnabled,rostersEnabled,false);}
    @Autowired public HealthController(JdbcTemplate jdbc,@Value("${app.teaching.enabled:false}") boolean teachingEnabled,
            @Value("${app.teaching.identity-enabled:false}") boolean identitiesEnabled,@Value("${app.teaching.roster-enabled:false}") boolean rostersEnabled,
            @Value("${app.teaching.lifecycle-enabled:false}") boolean lifecycleEnabled) {
        this.jdbc=jdbc;this.teachingEnabled=teachingEnabled;
        this.identitiesEnabled=identitiesEnabled;
        this.rostersEnabled=rostersEnabled;
        this.lifecycleEnabled=lifecycleEnabled;
    }

    @GetMapping
    public HealthResponse health() {
        return new HealthResponse("UP", "campus-ai-server", Instant.now());
    }

    /** Readiness checks the configured database and tables needed by core requests. */
    @GetMapping("/ready")
    public ResponseEntity<ReadyResponse> ready() {
        try {
            Integer tables = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM information_schema.tables
                    WHERE table_schema = DATABASE()
                    AND table_name IN ('users', 'auth_sessions', 'ai_conversations',
                                       'knowledge_documents', 'ai_daily_token_quota', 'user_privacy_consents',
                                       'student_projects', 'student_project_versions',
                                       'project_reviews', 'ai_token_reservations', 'account_emails',
                                       'account_action_tokens', 'auth_login_attempts', 'user_profiles',
                                       'campus_wall_entries', 'campus_wall_likes', 'campus_wall_reports',
                                       'campus_merchant_ratings', 'campus_merchant_reviews',
                                       'campus_review_likes', 'contact_messages', 'schools', 'background_jobs',
                                       'ai_messages', 'ai_model_usage', 'ai_daily_quota', 'knowledge_update_candidates',
                                       'campus_employers', 'campus_employer_candidates', 'campus_jobs', 'campus_canteens',
                                       'campus_canteen_merchants', 'campus_merchant_photos', 'knowledge_chunks',
                                       'knowledge_eval_cases', 'knowledge_document_events', 'knowledge_chunk_embeddings',
                                       'knowledge_document_versions', 'ai_message_citations', 'ai_message_feedback',
                                       'ai_feedback_resolutions', 'knowledge_submissions',
                                       'ai_spend_buckets', 'ai_provider_attempts', 'contact_submission_keys',
                                       'student_timetable_versions', 'student_timetables',
                                       'student_course_schedule_versions', 'student_course_schedules',
                                       'material_command_receipts', 'private_material_files', 'private_material_quota',
                                       'personal_schedule_terms', 'personal_schedule_history')
                    """, Integer.class);
            if (tables != null && tables == 54) {
                if(lessonChangesEnabled){
                    if(!teachingEnabled||!identitiesEnabled||!rostersEnabled||!lifecycleEnabled)return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                    Integer changes=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('teaching_schedule_locks','teaching_lesson_changes')",Integer.class);
                    if(changes==null||changes!=2)return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                }
                if(responsibilityEnabled){
                    if(!teachingEnabled||!identitiesEnabled)return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                    Integer scopes=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('teaching_grant_versions','teaching_grant_audit')",Integer.class);
                    if(scopes==null||scopes!=2)return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                }
                if(teachingEnabled) {
                    Integer teaching=jdbc.queryForObject("""
                            SELECT COUNT(*) FROM information_schema.tables
                            WHERE table_schema = DATABASE()
                            AND table_name IN ('teaching_classes','teaching_students','teaching_grants',
                              'teaching_binding_audit','teaching_courses','teaching_lessons',
                              'teaching_attendance','teaching_attendance_audit','teaching_notices')
                            """,Integer.class);
                    if(teaching==null || teaching!=9) return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                }
                if(identitiesEnabled) {
                    Integer identities=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('teaching_identities','teaching_identity_audit')",Integer.class);
                    if(identities==null || identities!=2) return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                }
                if(rostersEnabled) {
                    if(!teachingEnabled) return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                    Integer rosters=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('teaching_course_rosters','teaching_course_members','teaching_attendance_scopes','teaching_enrollment_audit')",Integer.class);
                    if(rosters==null || rosters!=4) return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                }
                if(lifecycleEnabled){
                    if(!teachingEnabled || !rostersEnabled)return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                    Integer lifecycle=jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('teaching_student_lifecycle','teaching_course_enrollment_modes','teaching_student_transition_audit','teaching_future_scope_audit','teaching_enrollment_requests','teaching_course_mode_reviews')",Integer.class);
                    if(lifecycle==null || lifecycle!=6)return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ReadyResponse("NOT_READY"));
                }
                return ResponseEntity.ok(new ReadyResponse("READY"));
            }
        } catch (DataAccessException exception) {
            // Do not disclose JDBC URLs, credentials, or schema details publicly.
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ReadyResponse("NOT_READY"));
    }

    public record HealthResponse(String status, String service, Instant timestamp) {
    }

    public record ReadyResponse(String status) {
    }
}
