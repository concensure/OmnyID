-- Migration 0051: Background Watcher daemon
--
-- Adds:
--   1. `background_watcher` to the daemon_kind enum.
--   2. `watcher_user_life_profiles`  — per-user allergy/medication/preference data.
--   3. `watcher_daily_context`       — daily snapshot (weather, meds, shopping, schedule).
--   4. `watcher_alerts`              — emitted alerts for audit and replay.
--   5. `watcher_run_audit`           — per-run observability (mirrors curator_run_audit).
--   6. `watcher_category_packs`      — which life-care packs a user has enabled.
--
-- Categories are stored as text (not an enum) to allow extensibility without
-- future migrations when new life domains are added.

-- ── 1. gen_ulid helper (create once if missing) ──────────────────────────────
-- daemon_kind is a TEXT column (not an enum), so no ALTER TYPE needed.

CREATE OR REPLACE FUNCTION gen_ulid() RETURNS TEXT AS $$
  SELECT replace(gen_random_uuid()::text, '-', '');
$$ LANGUAGE SQL IMMUTABLE;

-- ── 2. User Life Profile ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watcher_user_life_profiles (
    profile_id          TEXT        PRIMARY KEY DEFAULT gen_ulid(),
    user_id             TEXT        NOT NULL,
    -- AFP message ID of the `user_life_profile` message that created this entry.
    source_afp_id       TEXT,
    allergies           TEXT[]      NOT NULL DEFAULT '{}',
    medications         TEXT[]      NOT NULL DEFAULT '{}',
    dietary_preferences TEXT[]      NOT NULL DEFAULT '{}',
    sensitivities       TEXT[]      NOT NULL DEFAULT '{}',
    routines            TEXT[]      NOT NULL DEFAULT '{}',
    household_members   TEXT[]      NOT NULL DEFAULT '{}',
    -- Arbitrary JSON for future extension (custom fields).
    custom              JSONB       NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watcher_life_profile_user
    ON watcher_user_life_profiles (user_id);

-- Only one active profile per user; older rows kept for audit history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_watcher_life_profile_user_latest
    ON watcher_user_life_profiles (user_id, created_at DESC);

-- ── 3. Daily Context Snapshot ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watcher_daily_context (
    context_id              TEXT        PRIMARY KEY DEFAULT gen_ulid(),
    user_id                 TEXT        NOT NULL,
    -- ISO 8601 date (YYYY-MM-DD) this snapshot applies to.
    context_date            DATE        NOT NULL,
    source_afp_id           TEXT,
    weather_summary         TEXT,
    medication_adherence    JSONB       NOT NULL DEFAULT '{}',
    shopping_list_status    JSONB       NOT NULL DEFAULT '{}',
    schedule_summary        TEXT[]      NOT NULL DEFAULT '{}',
    nutrition_log           JSONB[]     NOT NULL DEFAULT '{}',
    custom                  JSONB       NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watcher_daily_context_user_date
    ON watcher_daily_context (user_id, context_date DESC);

-- ── 4. Watcher Alerts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watcher_alerts (
    alert_id            TEXT        PRIMARY KEY DEFAULT gen_ulid(),
    user_id             TEXT        NOT NULL,
    -- AFP message ID of the emitted `watcher_alert` or `smart_suggestion`.
    afp_message_id      TEXT,
    -- Extensible plain-text category (shopping, medication, nutrition, study, …).
    category            TEXT        NOT NULL,
    -- "gentle" | "important" | "urgent"
    severity            TEXT        NOT NULL DEFAULT 'gentle',
    -- AFP type: "watcher_alert" | "smart_suggestion"
    alert_type          TEXT        NOT NULL,
    heuristic_id        TEXT        NOT NULL,
    message             TEXT        NOT NULL,
    suggestion          TEXT,
    confidence          REAL        NOT NULL,
    -- Source passive_event AFP message ID that triggered this alert.
    source_event_id     TEXT,
    -- User response: NULL = pending, "accepted" | "dismissed" | "snoozed"
    user_response       TEXT,
    responded_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watcher_alerts_user_created
    ON watcher_alerts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watcher_alerts_category
    ON watcher_alerts (user_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watcher_alerts_pending
    ON watcher_alerts (user_id, user_response)
    WHERE user_response IS NULL;

-- ── 5. Watcher Run Audit ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watcher_run_audit (
    run_id                  TEXT        PRIMARY KEY,
    user_id                 TEXT        NOT NULL,
    daemon_id               TEXT        NOT NULL,
    source_message_id       TEXT,
    trigger_kind            TEXT        NOT NULL,
    alerts_emitted          INTEGER     NOT NULL DEFAULT 0,
    suggestions_emitted     INTEGER     NOT NULL DEFAULT 0,
    heuristics_evaluated    INTEGER     NOT NULL DEFAULT 0,
    tokens_used             INTEGER     NOT NULL DEFAULT 0,
    duration_ms             INTEGER,
    -- "completed" | "failed" | "skipped" | "partial"
    status                  TEXT        NOT NULL DEFAULT 'completed',
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watcher_run_audit_user
    ON watcher_run_audit (user_id, created_at DESC);

-- ── 6. Watcher Category Packs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watcher_category_packs (
    pack_id             TEXT        PRIMARY KEY DEFAULT gen_ulid(),
    user_id             TEXT        NOT NULL UNIQUE,
    -- JSON array of enabled pack IDs.
    -- Empty array = all packs active (default).
    -- e.g. '["medication", "shopping", "study"]'
    enabled_packs       JSONB       NOT NULL DEFAULT '[]',
    -- Per-category confidence threshold overrides.
    -- e.g. '{"medication": 0.90, "shopping": 0.70}'
    confidence_overrides JSONB      NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE watcher_user_life_profiles IS
    'Per-user life profile for the Background Watcher daemon. Stores allergies, '
    'medications, dietary preferences, sensitivities, routines, and household members.';

COMMENT ON TABLE watcher_daily_context IS
    'Daily snapshot of the user''s life context: weather, medication adherence, '
    'shopping list status, and schedule summary. One row per user per day.';

COMMENT ON TABLE watcher_alerts IS
    'Audit log of all watcher_alert and smart_suggestion AFP messages emitted by '
    'the Background Watcher daemon. Tracks user responses for feedback learning.';

COMMENT ON TABLE watcher_run_audit IS
    'Per-run observability for the Background Watcher daemon. Mirrors curator_run_audit.';

COMMENT ON TABLE watcher_category_packs IS
    'Per-user configuration of which life-care heuristic packs are enabled '
    'and any per-category confidence threshold overrides.';
