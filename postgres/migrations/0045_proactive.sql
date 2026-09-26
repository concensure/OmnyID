-- Proactive agent infrastructure — P1.3, P2.1, P3.1, P3.3
-- Applies cleanly on top of the existing messages table.

-- P1.3: index on timestamp for fast passive-event range queries.
-- The messages table already has a timestamp column (TIMESTAMPTZ).
-- We add a partial index covering only passive_event rows.
CREATE INDEX IF NOT EXISTS idx_messages_passive_event_ts
    ON messages (timestamp)
    WHERE type = 'passive_event';

-- P2.1: behavioural heuristic rules.
CREATE TABLE IF NOT EXISTS proactive_heuristics (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    trigger_event_type  TEXT NOT NULL,           -- e.g. 'calendar_event_completed'
    conditions          JSONB NOT NULL DEFAULT '{}',
    action_template     JSONB NOT NULL DEFAULT '{}',
    confidence_threshold REAL NOT NULL DEFAULT 0.7,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- P3.1: behavioural memory — operational patterns observed over time.
CREATE TABLE IF NOT EXISTS behavioral_memory (
    id               TEXT PRIMARY KEY,
    owner_user_id    TEXT NOT NULL,
    pattern_key      TEXT NOT NULL,
    evidence_count   INTEGER NOT NULL DEFAULT 1,
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confidence       REAL NOT NULL DEFAULT 0.5,
    metadata         JSONB NOT NULL DEFAULT '{}',
    UNIQUE (owner_user_id, pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_behavioral_memory_user
    ON behavioral_memory (owner_user_id);

-- P3.3: outcome memory — records user acceptance / dismissal of suggestions.
CREATE TABLE IF NOT EXISTS proactive_outcomes (
    id              TEXT PRIMARY KEY,
    owner_user_id   TEXT NOT NULL,
    suggestion_id   TEXT NOT NULL,    -- AFP message ID of the proactive_suggestion
    accepted        BOOLEAN NOT NULL,
    outcome_afp_id  TEXT,             -- resulting action AFP message (if accepted)
    heuristic_id    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proactive_outcomes_user
    ON proactive_outcomes (owner_user_id, heuristic_id);

-- P4.4: per-heuristic token budget log.
CREATE TABLE IF NOT EXISTS proactive_token_log (
    id            TEXT PRIMARY KEY,
    heuristic_id  TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    tokens_used   INTEGER NOT NULL DEFAULT 0,
    logged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proactive_token_log_daily
    ON proactive_token_log (heuristic_id, owner_user_id, logged_at);
