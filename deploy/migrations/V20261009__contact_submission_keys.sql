-- Additive only. Back up first and use a separate schema-migration account.
-- Existing contact_messages and users must already exist. No historical receipts are invented.
CREATE TABLE IF NOT EXISTS contact_submission_keys (
    user_id BIGINT NOT NULL,
    request_id CHAR(36) NOT NULL,
    message_id BIGINT NOT NULL,
    PRIMARY KEY(user_id, request_id),
    CONSTRAINT fk_contact_key_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_contact_key_message FOREIGN KEY (message_id) REFERENCES contact_messages(id) ON DELETE CASCADE
);
