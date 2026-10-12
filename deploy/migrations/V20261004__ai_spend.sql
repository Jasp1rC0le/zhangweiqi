-- Additive migration only. Back up first, run with a separate schema-migration account.
-- Historical successful-response records are NOT backfilled into the new attempt ledger.
CREATE TABLE IF NOT EXISTS ai_spend_buckets (
    period_key VARCHAR(16) NOT NULL PRIMARY KEY,
    charged_cny DECIMAL(18,6) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ai_provider_attempts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    usage_date DATE NOT NULL,
    provider VARCHAR(24) NOT NULL,
    requested_model VARCHAR(120) NOT NULL,
    response_model VARCHAR(120),
    state VARCHAR(16) NOT NULL,
    reserved_cny DECIMAL(18,6) NOT NULL,
    charged_cny DECIMAL(18,6) NOT NULL,
    estimated_cny DECIMAL(18,6),
    input_rate DECIMAL(18,6) NOT NULL,
    output_rate DECIMAL(18,6) NOT NULL,
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    INDEX idx_provider_attempts_date (usage_date)
);
