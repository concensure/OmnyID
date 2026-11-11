-- Sydney celebrant consultation pilot. Vendor identity, publication and wedding-date
-- availability remain in their existing canonical tables.

CREATE TABLE IF NOT EXISTS wedding_celebrant_pilot_profiles (
    vendor_id TEXT PRIMARY KEY REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    register_status TEXT NOT NULL DEFAULT 'pending' CHECK (register_status IN ('pending','verified','rejected','expired')),
    register_type TEXT CHECK (register_type IS NULL OR register_type IN ('commonwealth','religious','other_authorised')),
    register_source_url TEXT,
    register_checked_at TIMESTAMPTZ,
    register_checked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    register_evidence_ref TEXT,
    service_regions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    languages TEXT[] NOT NULL DEFAULT ARRAY['English']::TEXT[],
    topics TEXT[] NOT NULL DEFAULT ARRAY['ceremony_process','paperwork','ceremony_ideas','finding_celebrant']::TEXT[],
    accepted_intents TEXT[] NOT NULL DEFAULT ARRAY['general_question','prospective_client']::TEXT[],
    business_phone_ciphertext TEXT,
    timezone TEXT NOT NULL DEFAULT 'Australia/Sydney' CHECK (timezone = 'Australia/Sydney'),
    buffer_minutes INTEGER NOT NULL DEFAULT 5 CHECK (buffer_minutes BETWEEN 0 AND 60),
    consultation_minutes INTEGER NOT NULL DEFAULT 10 CHECK (consultation_minutes BETWEEN 5 AND 30),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wedding_celebrant_consultation_windows (
    window_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    window_kind TEXT NOT NULL CHECK (window_kind IN ('recurring','exception_open','exception_closed')),
    weekday SMALLINT CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7),
    local_date DATE,
    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (starts_at < ends_at),
    CHECK ((window_kind='recurring' AND weekday IS NOT NULL AND local_date IS NULL)
        OR (window_kind<>'recurring' AND weekday IS NULL AND local_date IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_celebrant_windows_vendor
    ON wedding_celebrant_consultation_windows (vendor_id, enabled, weekday, local_date);

CREATE TABLE IF NOT EXISTS wedding_celebrant_live_sessions (
    session_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    call_cap INTEGER NOT NULL CHECK (call_cap BETWEEN 1 AND 20),
    paused_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_celebrant_one_live_session
    ON wedding_celebrant_live_sessions (vendor_id)
    WHERE paused_at IS NULL;

CREATE TABLE IF NOT EXISTS wedding_celebrant_phone_verifications (
    verification_id TEXT PRIMARY KEY,
    phone_hash TEXT NOT NULL,
    provider_ref TEXT,
    phone_ciphertext TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','expired','consumed')),
    public_token_digest TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    approved_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_celebrant_verification_phone
    ON wedding_celebrant_phone_verifications (phone_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS wedding_celebrant_callback_requests (
    request_id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    verification_id TEXT NOT NULL REFERENCES wedding_celebrant_phone_verifications(verification_id) ON DELETE RESTRICT,
    selected_vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE SET NULL,
    first_available BOOLEAN NOT NULL DEFAULT FALSE,
    request_mode TEXT NOT NULL CHECK (request_mode IN ('immediate','scheduled')),
    intent TEXT NOT NULL CHECK (intent IN ('general_question','prospective_client')),
    topic TEXT NOT NULL CHECK (topic IN ('ceremony_process','paperwork','ceremony_ideas','finding_celebrant')),
    location TEXT CHECK (location IS NULL OR char_length(location) <= 180),
    wedding_date DATE,
    phone_ciphertext TEXT NOT NULL,
    status_token_digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('waiting_acceptance','accepted','passed','expired','scheduled','cancelled','reschedule_requested','connected','not_connected')),
    live_session_id TEXT REFERENCES wedding_celebrant_live_sessions(session_id) ON DELETE SET NULL,
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    hold_expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (verification_id, idempotency_key),
    CHECK ((request_mode='immediate' AND live_session_id IS NOT NULL AND scheduled_start IS NULL)
        OR (request_mode='scheduled' AND live_session_id IS NULL AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL)),
    CHECK (scheduled_start IS NULL OR scheduled_end > scheduled_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_celebrant_active_scheduled_slot
    ON wedding_celebrant_callback_requests (selected_vendor_id, scheduled_start)
    WHERE request_mode='scheduled' AND status IN ('scheduled','accepted','reschedule_requested');
CREATE INDEX IF NOT EXISTS idx_celebrant_requests_vendor
    ON wedding_celebrant_callback_requests (selected_vendor_id, status, created_at DESC);

-- Content-light AFP projection: no phone, code or free-text intake is copied here.
CREATE TABLE IF NOT EXISTS wedding_celebrant_consultation_events (
    event_id TEXT PRIMARY KEY,
    request_id TEXT REFERENCES wedding_celebrant_callback_requests(request_id) ON DELETE CASCADE,
    vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE SET NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN (
        'verification_started','verification_approved','request_created','request_accepted','request_reassigned',
        'request_passed','request_expired','request_cancelled','reschedule_requested','reschedule_accepted','reschedule_declined',
        'call_connected','call_not_connected','live_started','live_paused','settings_updated','register_checked'
    )),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('visitor','vendor_user','operator','system')),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 8 AND 180),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_kind, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_celebrant_events_request
    ON wedding_celebrant_consultation_events (request_id, occurred_at);
