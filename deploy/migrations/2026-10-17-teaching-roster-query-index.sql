-- Manual additive index for student-shared roster overlap reads.
-- Apply only after review. Development HTTP tests use their own synthetic schema.
CREATE INDEX teaching_scope_student_overlap
 ON teaching_attendance_scopes(school_id,student_id,withdrawn,lesson_id);
