package com.campusai.health;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/health")
public class  HealthController {
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
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
                                       'student_course_schedule_versions', 'student_course_schedules')
                    """, Integer.class);
            if (tables != null && tables == 49) {
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
