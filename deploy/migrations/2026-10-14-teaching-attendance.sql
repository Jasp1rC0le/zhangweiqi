-- Manual, additive migration. Do not run automatically against a live database.
CREATE TABLE IF NOT EXISTS teaching_classes (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, college VARCHAR(100) NOT NULL,
 name VARCHAR(100) NOT NULL, request_hash VARCHAR(64) NOT NULL,
 UNIQUE (school_id, college, name)
);
CREATE TABLE IF NOT EXISTS teaching_students (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, class_id VARCHAR(36) NOT NULL,
 student_number VARCHAR(40) NOT NULL, name VARCHAR(100) NOT NULL, user_id BIGINT NULL,
 UNIQUE (school_id, student_number), UNIQUE (school_id, user_id),
 FOREIGN KEY (class_id) REFERENCES teaching_classes(id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS teaching_grants (
 school_id BIGINT NOT NULL, user_id BIGINT NOT NULL, view_role VARCHAR(16) NOT NULL,
 scope_key VARCHAR(100) NOT NULL, PRIMARY KEY (school_id, user_id, view_role, scope_key),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS teaching_binding_audit (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, student_id VARCHAR(36) NOT NULL,
 actor_id BIGINT NOT NULL, old_user_id BIGINT NULL, new_user_id BIGINT NULL,
 recorded_at TIMESTAMP NOT NULL, FOREIGN KEY (student_id) REFERENCES teaching_students(id)
);
CREATE TABLE IF NOT EXISTS teaching_courses (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, class_id VARCHAR(36) NOT NULL,
 teacher_id BIGINT NULL, name VARCHAR(100) NOT NULL, semester VARCHAR(100) NOT NULL,
 first_monday DATE NOT NULL, weekday INT NOT NULL, start_time VARCHAR(5) NOT NULL,
 end_time VARCHAR(5) NOT NULL, weeks_json TEXT NOT NULL, room VARCHAR(100) NOT NULL,
 request_hash VARCHAR(64) NOT NULL, UNIQUE (school_id, request_hash),
 FOREIGN KEY (class_id) REFERENCES teaching_classes(id), FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS teaching_lessons (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, course_id VARCHAR(36) NOT NULL,
 class_id VARCHAR(36) NOT NULL, starts_at TIMESTAMP NOT NULL, ends_at TIMESTAMP NOT NULL,
 revision INT NOT NULL DEFAULT 0, finalized BOOLEAN NOT NULL DEFAULT FALSE,
 cancelled BOOLEAN NOT NULL DEFAULT FALSE, UNIQUE (course_id, starts_at),
 FOREIGN KEY (course_id) REFERENCES teaching_courses(id),
 INDEX teaching_lessons_time (school_id, starts_at)
);
CREATE TABLE IF NOT EXISTS teaching_attendance (
 lesson_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL,
 student_number VARCHAR(40) NOT NULL, student_name VARCHAR(100) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN', PRIMARY KEY (lesson_id, student_id),
 FOREIGN KEY (lesson_id) REFERENCES teaching_lessons(id), FOREIGN KEY (student_id) REFERENCES teaching_students(id)
);
CREATE TABLE IF NOT EXISTS teaching_attendance_audit (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, lesson_id VARCHAR(36) NOT NULL,
 student_id VARCHAR(36) NOT NULL, actor_id BIGINT NOT NULL, old_status VARCHAR(16) NOT NULL,
 new_status VARCHAR(16) NOT NULL, reason VARCHAR(300) NOT NULL, recorded_at TIMESTAMP NOT NULL,
 FOREIGN KEY (lesson_id) REFERENCES teaching_lessons(id)
);
CREATE TABLE IF NOT EXISTS teaching_notices (
 id VARCHAR(36) PRIMARY KEY, user_id BIGINT NOT NULL, lesson_id VARCHAR(36) NOT NULL,
 kind VARCHAR(24) NOT NULL, due_at TIMESTAMP NOT NULL, read_at TIMESTAMP NULL,
 UNIQUE (user_id, lesson_id, kind), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (lesson_id) REFERENCES teaching_lessons(id),
 INDEX teaching_notices_inbox (user_id, due_at)
);
