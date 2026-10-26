-- Manual additive migration. Never automatically apply to the school's database.
CREATE TABLE IF NOT EXISTS teaching_grant_versions (
 school_id BIGINT NOT NULL, user_id BIGINT NOT NULL, view_role VARCHAR(16) NOT NULL,
 revision INT NOT NULL DEFAULT 0, source VARCHAR(32) NOT NULL,
 PRIMARY KEY(school_id,user_id,view_role)
);
-- Current grants are a baseline, not proof of their original operator or time.
INSERT INTO teaching_grant_versions(school_id,user_id,view_role,revision,source)
 SELECT DISTINCT g.school_id,g.user_id,g.view_role,0,'BASELINE_AT_MIGRATION'
 FROM teaching_grants g WHERE NOT EXISTS(
  SELECT 1 FROM teaching_grant_versions v WHERE v.school_id=g.school_id AND v.user_id=g.user_id AND v.view_role=g.view_role
 );
CREATE TABLE IF NOT EXISTS teaching_grant_audit (
 school_id BIGINT NOT NULL, request_id VARCHAR(36) NOT NULL, actor_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL, view_role VARCHAR(16) NOT NULL, scope_key VARCHAR(100) NOT NULL,
 scope_label VARCHAR(220) NOT NULL, target_label VARCHAR(150) NOT NULL, actor_label VARCHAR(150) NOT NULL,
 action VARCHAR(16) NOT NULL, old_active BOOLEAN NOT NULL, new_active BOOLEAN NOT NULL,
 old_revision INT NOT NULL, revision INT NOT NULL, reason VARCHAR(300) NOT NULL,
 request_hash VARCHAR(64) NOT NULL, recorded_at TIMESTAMP NOT NULL,
 PRIMARY KEY(school_id,request_id),
 INDEX teaching_grant_history(school_id,recorded_at,request_id)
);
-- Deliberately no user foreign key: deletion/unbinding must not erase immutable evidence.
