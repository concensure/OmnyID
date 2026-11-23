-- Migration: 0069_router_index
-- Purpose: Local-replica search index tables for the Cascaded Lazy Semantic Router
-- Rules: additive only — no DROP, no ALTER TYPE removal, no column removal
--        new columns must have defaults or be nullable
--
-- IMPORTANT: These tables are LOCAL-REPLICA-ONLY derived data.
-- They are populated on-device after the user decrypts their AFP messages
-- using their local key. They must NOT be included in any ElectricSQL shape
-- that syncs upward to the homeserver. The homeserver only ever sees ciphertext.
--
-- The homeserver applying this migration is harmless (creates empty tables),
-- but data in these tables must only ever be written by the local client process.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- tsvector_immutable: used by local-replica clients to compute tsvectors for
-- full-text search. Declared IMMUTABLE so it can be used in expression indexes.
CREATE OR REPLACE FUNCTION tsvector_immutable(config TEXT, document TEXT)
RETURNS TSVECTOR AS $$
  SELECT to_tsvector(config::regconfig, document);
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

-- ---------------------------------------------------------------------------
-- L1/L2 index: one row per ledger message worth retrieving
-- ---------------------------------------------------------------------------
-- NOTE: summary_tsv is a plain nullable column (not generated) because
-- PostgreSQL's strict immutability check rejects even IMMUTABLE wrapper functions
-- in GENERATED ALWAYS AS clauses when the expression involves column references.
-- Local-replica clients compute and insert summary_tsv via tsvector_immutable().
CREATE TABLE IF NOT EXISTS router_index (
    message_id          TEXT        PRIMARY KEY,   -- AFP Message.id
    thread_id           TEXT        NOT NULL,
    from_agent          TEXT        NOT NULL,
    ts                  TIMESTAMPTZ NOT NULL,
    type                TEXT        NOT NULL,
    subtype             TEXT,
    kind                TEXT        NOT NULL,      -- RoutingMetadata.kind
    supertags           TEXT[]      NOT NULL DEFAULT '{}',
    entities            TEXT[]      NOT NULL DEFAULT '{}',
    searchable_summary  TEXT,
    salience            REAL        NOT NULL DEFAULT 0.5,
    body_available      BOOLEAN     NOT NULL DEFAULT TRUE,
    summary_tsv         TSVECTOR
);

-- L1: metadata filter paths
CREATE INDEX IF NOT EXISTS idx_ri_kind_ts   ON router_index (kind, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ri_thread    ON router_index (thread_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ri_agent     ON router_index (from_agent, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ri_supertags ON router_index USING GIN (supertags);
CREATE INDEX IF NOT EXISTS idx_ri_entities  ON router_index USING GIN (entities);

-- L2: full-text + fuzzy
CREATE INDEX IF NOT EXISTS idx_ri_tsv  ON router_index USING GIN (summary_tsv);
CREATE INDEX IF NOT EXISTS idx_ri_trgm ON router_index USING GIN (searchable_summary gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- L3: lightweight embeddings of searchable_summary (on-device model, 384-d)
-- On-device embedder: MiniLM-L6 via ONNX (matches vector(384) dimension)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS router_embeddings (
    message_id  TEXT PRIMARY KEY REFERENCES router_index(message_id) ON DELETE CASCADE,
    embedding   vector(384) NOT NULL,
    model       TEXT        NOT NULL DEFAULT 'minilm-l6-v2'
);

-- HNSW: best recall/latency trade-off for consumer hardware
CREATE INDEX IF NOT EXISTS idx_re_hnsw ON router_embeddings
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- L4: knowledge_link / relation_link projection
-- Edges are signed AFP messages; this table is the local adjacency index
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS router_links (
    link_message_id    TEXT PRIMARY KEY,           -- the AFP knowledge_link id
    source_message_id  TEXT NOT NULL,
    target_message_id  TEXT NOT NULL,
    link_type          TEXT NOT NULL,
    weight             REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
    label              TEXT
);

CREATE INDEX IF NOT EXISTS idx_rl_source ON router_links (source_message_id);
CREATE INDEX IF NOT EXISTS idx_rl_target ON router_links (target_message_id);
