-- Phase 11: Knowledge Curator, Background Daemons, and Visual Workflow Builder
-- Migration 0033 — daemon registrations, backlink graph, knowledge cards, curator audit, archive index

-- ---------------------------------------------------------------------------
-- Daemon registrations
-- One row per active daemon instance per user.  Master Agent spawns and revokes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daemon_registrations (
  daemon_id              TEXT        PRIMARY KEY,
  user_id                TEXT        NOT NULL REFERENCES afp_accounts(user_id) ON DELETE CASCADE,
  daemon_kind            TEXT        NOT NULL,   -- 'knowledge_curator' | 'email_gateway' | 'relational_sync' | 'archive_cold_storage' | 'health_maintenance'
  workflow_id            TEXT,                   -- NULL for system-level daemons
  delegated_key_id       TEXT        NOT NULL,
  allowed_message_types  TEXT[]      NOT NULL DEFAULT '{}',
  status                 TEXT        NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active', 'paused', 'revoked')),
  policy_config          JSONB       NOT NULL DEFAULT '{}',
  last_heartbeat_at      TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS daemon_registrations_user_idx
  ON daemon_registrations(user_id, status);

CREATE INDEX IF NOT EXISTS daemon_registrations_kind_idx
  ON daemon_registrations(user_id, daemon_kind);

-- ---------------------------------------------------------------------------
-- AFP backlink graph
-- Bidirectional edges created by the Knowledge Curator between related messages.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afp_backlinks (
  backlink_id    TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL REFERENCES afp_accounts(user_id) ON DELETE CASCADE,
  source_id      TEXT        NOT NULL,   -- AFP message id (originating message)
  target_id      TEXT        NOT NULL,   -- AFP message id (related message)
  link_kind      TEXT        NOT NULL    -- 'semantic_similarity' | 'entity_overlap' | 'explicit_ref' | 'temporal_proximity'
                             CHECK (link_kind IN ('semantic_similarity', 'entity_overlap', 'explicit_ref', 'temporal_proximity')),
  similarity     REAL,                   -- cosine similarity score (0.0–1.0), NULL for non-vector links
  entities       TEXT[]      NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  curator_run_id TEXT,
  UNIQUE (user_id, source_id, target_id, link_kind)
);

CREATE INDEX IF NOT EXISTS afp_backlinks_source_idx
  ON afp_backlinks(user_id, source_id);

CREATE INDEX IF NOT EXISTS afp_backlinks_target_idx
  ON afp_backlinks(user_id, target_id);

-- ---------------------------------------------------------------------------
-- Knowledge cards
-- Structured curator output: summary, supertags, entities, structured card JSON.
-- The embedding column requires pgvector extension (already used elsewhere).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afp_knowledge_cards (
  card_id        TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL REFERENCES afp_accounts(user_id) ON DELETE CASCADE,
  source_id      TEXT        NOT NULL,   -- AFP message id this card summarises
  summary        TEXT,
  supertags      TEXT[]      NOT NULL DEFAULT '{}',
  entities       TEXT[]      NOT NULL DEFAULT '{}',
  card_json      JSONB       NOT NULL DEFAULT '{}',
  model_version  TEXT        NOT NULL DEFAULT 'unknown',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  curator_run_id TEXT
);

-- Conditional embedding column (requires pgvector; safe to skip if extension absent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE afp_knowledge_cards
      ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
    CREATE INDEX IF NOT EXISTS afp_knowledge_cards_embedding_idx
      ON afp_knowledge_cards USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS afp_knowledge_cards_source_idx
  ON afp_knowledge_cards(user_id, source_id);

CREATE INDEX IF NOT EXISTS afp_knowledge_cards_supertags_idx
  ON afp_knowledge_cards USING GIN(supertags);

-- ---------------------------------------------------------------------------
-- Curator run audit
-- One row per Knowledge Curator processing event for observability.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curator_run_audit (
  run_id              TEXT        PRIMARY KEY,
  user_id             TEXT        NOT NULL REFERENCES afp_accounts(user_id) ON DELETE CASCADE,
  daemon_id           TEXT        NOT NULL REFERENCES daemon_registrations(daemon_id) ON DELETE CASCADE,
  source_message_id   TEXT        NOT NULL,
  trigger_kind        TEXT        NOT NULL DEFAULT 'new_message',   -- 'new_message' | 'deep_maintenance' | 'reindex'
  backlinks_created   INT         NOT NULL DEFAULT 0,
  cards_created       INT         NOT NULL DEFAULT 0,
  insights_created    INT         NOT NULL DEFAULT 0,
  tokens_used         INT         NOT NULL DEFAULT 0,
  duration_ms         INT,
  status              TEXT        NOT NULL DEFAULT 'completed'
                                  CHECK (status IN ('completed', 'failed', 'skipped', 'partial')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS curator_run_audit_user_idx
  ON curator_run_audit(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS curator_run_audit_daemon_idx
  ON curator_run_audit(daemon_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- AFP archive index
-- Lightweight stub row retained in Postgres after cold-storage migration to MinIO.
-- The full encrypted ciphertext lives in MinIO; the stub preserves search and graph traversal.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afp_archive_index (
  message_id     TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL REFERENCES afp_accounts(user_id) ON DELETE CASCADE,
  thread_id      TEXT        NOT NULL,
  message_type   TEXT        NOT NULL,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  minio_key      TEXT        NOT NULL,   -- bucket-relative object path (encrypted blob)
  metadata_stub  JSONB       NOT NULL DEFAULT '{}',
  restored_at    TIMESTAMPTZ            -- set when user restores from cold storage
);

-- Conditional embedding stub for archive search
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE afp_archive_index
      ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS afp_archive_index_user_thread_idx
  ON afp_archive_index(user_id, thread_id);

CREATE INDEX IF NOT EXISTS afp_archive_index_type_idx
  ON afp_archive_index(user_id, message_type);

-- ---------------------------------------------------------------------------
-- Daemon heartbeat log (rolling window — kept for last 48 h)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daemon_heartbeats (
  heartbeat_id TEXT        PRIMARY KEY,
  daemon_id    TEXT        NOT NULL REFERENCES daemon_registrations(daemon_id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL,
  metrics      JSONB       NOT NULL DEFAULT '{}',  -- { cpu_pct, queue_depth, events_processed, ... }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daemon_heartbeats_daemon_time_idx
  ON daemon_heartbeats(daemon_id, created_at DESC);

-- Auto-expire heartbeats older than 48 hours (runs at query time via WHERE; background vacuum handles storage)
-- No partitioning added here to keep migration simple; can be added later via pg_partman.
