-- Apply only after backup and schema review. No public knowledge or role changes.
CREATE TABLE IF NOT EXISTS material_command_receipts (
    owner_id BIGINT NOT NULL,
    school_id BIGINT NOT NULL,
    request_id CHAR(36) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    result_json MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(owner_id, request_id),
    CONSTRAINT fk_material_receipt_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);
