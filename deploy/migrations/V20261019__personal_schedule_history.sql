-- No existing schedule is rewritten. First subsequent edit captures a baseline.
CREATE TABLE IF NOT EXISTS personal_schedule_terms (
    owner_id BIGINT NOT NULL, first_monday DATE NOT NULL, revision INT NOT NULL,
    semester VARCHAR(100) NOT NULL, snapshot_json MEDIUMTEXT NOT NULL,
    PRIMARY KEY(owner_id,first_monday),
    CONSTRAINT fk_personal_term_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS personal_schedule_history (
    owner_id BIGINT NOT NULL, revision INT NOT NULL, first_monday DATE NOT NULL,
    semester VARCHAR(100) NOT NULL, action VARCHAR(30) NOT NULL, reason VARCHAR(500) NOT NULL,
    snapshot_json MEDIUMTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(owner_id,revision),
    CONSTRAINT fk_personal_history_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);
