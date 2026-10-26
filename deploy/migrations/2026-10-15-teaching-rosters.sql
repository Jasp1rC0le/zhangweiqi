-- Manual additive migration. Never auto-run on the school's database.
CREATE TABLE IF NOT EXISTS teaching_course_rosters (
 course_id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, group_name VARCHAR(100) NOT NULL,
 revision INT NOT NULL DEFAULT 0, FOREIGN KEY (course_id) REFERENCES teaching_courses(id)
);
CREATE TABLE IF NOT EXISTS teaching_course_members (
 course_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL, school_id BIGINT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY (course_id,student_id),
 FOREIGN KEY (course_id) REFERENCES teaching_courses(id), FOREIGN KEY (student_id) REFERENCES teaching_students(id),
 INDEX teaching_member_student (school_id,student_id,active,course_id)
);
CREATE TABLE IF NOT EXISTS teaching_attendance_scopes (
 lesson_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL, school_id BIGINT NOT NULL,
 admin_class_id VARCHAR(36) NOT NULL, college VARCHAR(100) NOT NULL,
 withdrawn BOOLEAN NOT NULL DEFAULT FALSE, source VARCHAR(32) NOT NULL,
 captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (lesson_id,student_id),
 FOREIGN KEY (lesson_id,student_id) REFERENCES teaching_attendance(lesson_id,student_id),
 FOREIGN KEY (admin_class_id) REFERENCES teaching_classes(id),
 INDEX teaching_scope_admin (school_id,admin_class_id,withdrawn,lesson_id,student_id),
 INDEX teaching_scope_college (school_id,college,withdrawn,lesson_id,student_id)
);
CREATE TABLE IF NOT EXISTS teaching_enrollment_audit (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, course_id VARCHAR(36) NOT NULL,
 student_id VARCHAR(36) NOT NULL, actor_id BIGINT NOT NULL, action VARCHAR(24) NOT NULL,
 reason VARCHAR(300) NOT NULL, revision INT NOT NULL, recorded_at TIMESTAMP NOT NULL,
 FOREIGN KEY (course_id) REFERENCES teaching_courses(id), FOREIGN KEY (student_id) REFERENCES teaching_students(id)
);
-- Existing rows are a migration-time baseline, not proof of the original administrative affiliation.
INSERT INTO teaching_course_rosters(course_id,school_id,group_name)
 SELECT c.id,c.school_id,b.name FROM teaching_courses c JOIN teaching_classes b ON b.id=c.class_id
 WHERE NOT EXISTS(SELECT 1 FROM teaching_course_rosters r WHERE r.course_id=c.id);
INSERT INTO teaching_course_members(course_id,student_id,school_id)
 SELECT DISTINCT l.course_id,a.student_id,l.school_id FROM teaching_attendance a JOIN teaching_lessons l ON l.id=a.lesson_id
 WHERE NOT EXISTS(SELECT 1 FROM teaching_course_members m WHERE m.course_id=l.course_id AND m.student_id=a.student_id);
INSERT INTO teaching_attendance_scopes(lesson_id,student_id,school_id,admin_class_id,college,source)
 SELECT a.lesson_id,a.student_id,l.school_id,s.class_id,b.college,'BASELINE_AT_MIGRATION'
 FROM teaching_attendance a JOIN teaching_lessons l ON l.id=a.lesson_id JOIN teaching_students s ON s.id=a.student_id AND s.school_id=l.school_id
 JOIN teaching_classes b ON b.id=s.class_id AND b.school_id=l.school_id
 WHERE NOT EXISTS(SELECT 1 FROM teaching_attendance_scopes r WHERE r.lesson_id=a.lesson_id AND r.student_id=a.student_id);
