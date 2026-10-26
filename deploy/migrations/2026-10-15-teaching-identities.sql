-- Additive, manual migration. Apply only to an explicitly authorized database.
-- Identity approval is not a course, class, college or platform-admin grant.
CREATE TABLE IF NOT EXISTS teaching_identities (
 id VARCHAR(36) PRIMARY KEY, school_id BIGINT NOT NULL, user_id BIGINT NULL,
 requested_role VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL,
 revision INT NOT NULL, reason VARCHAR(200) NOT NULL DEFAULT '',
 requested_at TIMESTAMP NOT NULL, reviewed_at TIMESTAMP NULL,
 UNIQUE (user_id, requested_role),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
 INDEX teaching_identity_review (school_id, status, requested_at, id)
);
CREATE TABLE IF NOT EXISTS teaching_identity_audit (
 id VARCHAR(36) PRIMARY KEY, application_id VARCHAR(36) NOT NULL,
 school_id BIGINT NOT NULL, actor_id BIGINT NOT NULL, revision INT NOT NULL,
 old_status VARCHAR(16) NOT NULL, new_status VARCHAR(16) NOT NULL,
 reason VARCHAR(200) NOT NULL, recorded_at TIMESTAMP NOT NULL,
 FOREIGN KEY (application_id) REFERENCES teaching_identities(id),
 UNIQUE (application_id, revision)
);
