-- Manual additive migration for explicitly confirmed re-enrollment only.
-- No automatic execution and no historical data replacement.
CREATE TABLE IF NOT EXISTS teaching_enrollment_requests (
 school_id BIGINT NOT NULL, request_id VARCHAR(36) NOT NULL,
 course_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL,
 class_id VARCHAR(36) NOT NULL, actor_id BIGINT NOT NULL,
 request_hash VARCHAR(64) NOT NULL,
 revision INT NOT NULL, student_revision INT NOT NULL,
 affected_lessons INT NOT NULL, recorded_at TIMESTAMP NOT NULL,
 PRIMARY KEY(school_id,request_id),
 FOREIGN KEY(course_id) REFERENCES teaching_courses(id),
 FOREIGN KEY(student_id) REFERENCES teaching_students(id)
);
