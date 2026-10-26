-- Manual additive migration. Do not run on school data without a separate release review.
CREATE TABLE IF NOT EXISTS teaching_schedule_locks (
 school_id BIGINT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS teaching_lesson_changes (
 school_id BIGINT NOT NULL, request_id VARCHAR(36) NOT NULL, actor_id BIGINT NOT NULL,
 old_lesson_id VARCHAR(36) NOT NULL, new_lesson_id VARCHAR(36) NULL, new_course_id VARCHAR(36) NULL,
 request_hash VARCHAR(64) NOT NULL, old_revision INT NOT NULL, revision INT NOT NULL,
 reason VARCHAR(300) NOT NULL, receipt_json TEXT NOT NULL, recorded_at TIMESTAMP NOT NULL,
 PRIMARY KEY (school_id,request_id), UNIQUE (school_id,old_lesson_id),
 INDEX teaching_lesson_change_history (school_id,recorded_at,request_id)
);
