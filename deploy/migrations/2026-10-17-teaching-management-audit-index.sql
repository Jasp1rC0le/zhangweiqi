-- Once-only additive indexes. Inspect existing indexes and required feature tables before applying.
-- Only synthetic test schemas are authorized for development execution. No school migration or deletion.
CREATE INDEX teaching_transition_event_lookup ON teaching_student_transition_audit(school_id,recorded_at,request_id);
CREATE INDEX teaching_binding_event_lookup ON teaching_binding_audit(school_id,recorded_at,id);
CREATE INDEX teaching_identity_event_lookup ON teaching_identity_audit(school_id,recorded_at,id);
CREATE INDEX teaching_enrollment_event_lookup ON teaching_enrollment_audit(school_id,recorded_at,id);
CREATE INDEX teaching_course_mode_event_lookup ON teaching_course_mode_reviews(school_id,recorded_at,request_id);
