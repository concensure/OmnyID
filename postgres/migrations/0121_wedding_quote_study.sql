-- Public quote-study submissions are intentionally separate from encrypted
-- user documents. The raw object is stored unencrypted only after explicit
-- study/admin-access consent and is never exposed by a public object URL.
CREATE TABLE IF NOT EXISTS wedding_quote_study_submissions (
    submission_id TEXT PRIMARY KEY,
    public_receipt_id TEXT NOT NULL UNIQUE,
    delete_token_hash TEXT NOT NULL CHECK (delete_token_hash ~ '^[a-f0-9]{64}$'),
    source_mode TEXT NOT NULL CHECK (source_mode IN ('file', 'pasted_text')),
    quote_category TEXT NOT NULL CHECK (quote_category IN ('venue', 'other')),
    file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
    mime_type TEXT NOT NULL CHECK (char_length(mime_type) BETWEEN 3 AND 128),
    size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    storage_backend TEXT CHECK (storage_backend = 'seaweedfs'),
    storage_key TEXT,
    consent_version TEXT NOT NULL,
    consent_notice_sha256 TEXT NOT NULL CHECK (consent_notice_sha256 ~ '^[a-f0-9]{64}$'),
    study_consent BOOLEAN NOT NULL CHECK (study_consent),
    admin_access_allowed BOOLEAN NOT NULL CHECK (admin_access_allowed),
    uploader_authority_confirmed BOOLEAN NOT NULL CHECK (uploader_authority_confirmed),
    consented_at TIMESTAMPTZ NOT NULL,
    analysis_status TEXT NOT NULL CHECK (analysis_status IN (
        'processing', 'completed', 'failed', 'deleted'
    )),
    analysis_result JSONB,
    provider TEXT,
    model TEXT,
    provider_request_id TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    failure_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analysed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CHECK ((analysis_status = 'deleted') = (deleted_at IS NOT NULL)),
    CHECK (analysis_status <> 'deleted' OR (storage_key IS NULL AND analysis_result IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_wedding_quote_study_admin
    ON wedding_quote_study_submissions (created_at DESC)
    WHERE analysis_status <> 'deleted';
