-- Private files are outside static web roots. Back up this metadata AND configured file directory.
CREATE TABLE IF NOT EXISTS private_material_quota(id INT PRIMARY KEY);
INSERT INTO private_material_quota(id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM private_material_quota WHERE id=1);
CREATE TABLE IF NOT EXISTS private_material_files (
    id CHAR(36) PRIMARY KEY, owner_id BIGINT NOT NULL, school_id BIGINT NOT NULL,
    request_id CHAR(36) NOT NULL, name VARCHAR(180) NOT NULL, byte_size BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL, text_sha256 CHAR(64) NOT NULL, extracted_text MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_private_file_request(owner_id,request_id),
    INDEX idx_private_file_owner(owner_id,school_id,created_at),
    CONSTRAINT fk_private_file_user FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);
