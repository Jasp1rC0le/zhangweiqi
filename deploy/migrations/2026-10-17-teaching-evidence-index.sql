-- Once-only additive index preparation. Inspect existing indexes before applying.
-- Never run automatically against the school database. This does not archive or delete history.
CREATE INDEX teaching_audit_retention_lookup ON teaching_attendance_audit(school_id,lesson_id,student_id,recorded_at);
