-- Additive migration only. Do not re-run the full schema on an existing database.
-- Contains only a version counter, never image/semester data; prevents stale tabs after delete/recreate.
CREATE TABLE IF NOT EXISTS student_timetable_versions (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL,
    CONSTRAINT fk_timetable_version_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_timetables (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL DEFAULT 1,
    semester VARCHAR(100) NOT NULL,
    first_monday DATE NOT NULL,
    start_week INT NOT NULL,
    end_week INT NOT NULL,
    remind_days INT NOT NULL DEFAULT 7,
    image_bytes MEDIUMBLOB NOT NULL,
    image_mime VARCHAR(20) NOT NULL,
    image_sha256 CHAR(64) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_timetable_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Structured courses are separate from screenshot coverage; no inferred or public data.
CREATE TABLE IF NOT EXISTS student_course_schedule_versions (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL,
    CONSTRAINT fk_course_schedule_version_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_course_schedules (
    user_id BIGINT PRIMARY KEY,
    revision INT NOT NULL,
    semester VARCHAR(100) NOT NULL,
    first_monday DATE NOT NULL,
    remind_days INT NOT NULL DEFAULT 7,
    courses_json MEDIUMTEXT NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_course_schedule_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
