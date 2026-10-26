-- Additive manual migration. Disabled in normal local and production startup.
CREATE TABLE IF NOT EXISTS teaching_student_lifecycle (
 student_id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', revision INT NOT NULL DEFAULT 0,
 changed_at TIMESTAMP NOT NULL,
 FOREIGN KEY(student_id) REFERENCES teaching_students(id)
);
CREATE TABLE IF NOT EXISTS teaching_course_enrollment_modes (
 course_id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL,
 mode VARCHAR(16) NOT NULL, reviewed_by BIGINT, review_reason VARCHAR(500) NOT NULL DEFAULT '', reviewed_at TIMESTAMP,
 FOREIGN KEY(course_id) REFERENCES teaching_courses(id)
);
INSERT INTO teaching_course_enrollment_modes(course_id,school_id,mode)
 SELECT c.id,c.school_id,'LEGACY' FROM teaching_courses c
 WHERE NOT EXISTS(SELECT 1 FROM teaching_course_enrollment_modes m WHERE m.course_id=c.id);
CREATE TABLE IF NOT EXISTS teaching_student_transition_audit (
 school_id BIGINT NOT NULL, request_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL,
 actor_id BIGINT NOT NULL, action VARCHAR(16) NOT NULL,
 old_class_id VARCHAR(36) NOT NULL, new_class_id VARCHAR(36) NOT NULL,
 old_status VARCHAR(16) NOT NULL, new_status VARCHAR(16) NOT NULL,
 reason VARCHAR(500) NOT NULL, revision INT NOT NULL, affected_lessons INT NOT NULL,
 request_hash VARCHAR(64) NOT NULL, recorded_at TIMESTAMP NOT NULL,
 PRIMARY KEY(school_id,request_id), FOREIGN KEY(student_id) REFERENCES teaching_students(id)
);
CREATE TABLE IF NOT EXISTS teaching_future_scope_audit (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, request_id VARCHAR(36) NOT NULL,
 lesson_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL, actor_id BIGINT NOT NULL,
 old_class_id VARCHAR(36), new_class_id VARCHAR(36) NOT NULL,
 old_college VARCHAR(100), new_college VARCHAR(100) NOT NULL,
 old_withdrawn BOOLEAN, new_withdrawn BOOLEAN NOT NULL, recorded_at TIMESTAMP NOT NULL,
 UNIQUE(school_id,request_id,lesson_id,student_id),
 FOREIGN KEY(lesson_id,student_id) REFERENCES teaching_attendance(lesson_id,student_id)
);
