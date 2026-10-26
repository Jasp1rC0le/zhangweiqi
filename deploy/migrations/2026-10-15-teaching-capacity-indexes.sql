-- Additive, once-only manual migration. Inspect existing indexes before applying.
-- Never execute automatically on the user's active database.
CREATE INDEX teaching_course_owner ON teaching_courses(school_id,teacher_id,class_id);
CREATE INDEX teaching_class_roster ON teaching_students(school_id,class_id,user_id);
CREATE INDEX teaching_class_overlap ON teaching_lessons(school_id,class_id,cancelled,starts_at,ends_at);
CREATE INDEX teaching_attendance_status ON teaching_attendance(lesson_id,status,student_id);
