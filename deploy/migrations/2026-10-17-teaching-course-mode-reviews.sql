-- Manual additive migration for explicit source review and durable idempotent receipts.
-- Do not run automatically against the school schema. Past attendance and membership are untouched.
CREATE TABLE IF NOT EXISTS teaching_course_mode_reviews (
 school_id BIGINT NOT NULL, request_id VARCHAR(36) NOT NULL, course_id VARCHAR(36) NOT NULL,
 actor_id BIGINT NOT NULL, mode VARCHAR(16) NOT NULL, reason VARCHAR(300) NOT NULL,
 old_revision INT NOT NULL, revision INT NOT NULL, request_hash VARCHAR(64) NOT NULL,
 recorded_at TIMESTAMP NOT NULL,
 PRIMARY KEY(school_id,request_id), UNIQUE(school_id,course_id),
 FOREIGN KEY(course_id) REFERENCES teaching_courses(id)
);
