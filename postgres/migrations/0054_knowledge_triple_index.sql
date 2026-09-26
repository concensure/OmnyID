-- Phase 19: Knowledge graph retrieval hardening
-- Migration 0054 — server-side index for queryable knowledge triples

CREATE TABLE IF NOT EXISTS afp_knowledge_triples (
  message_id         TEXT        PRIMARY KEY,
  user_id            TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id          TEXT        NOT NULL,
  subject            TEXT        NOT NULL,
  subject_norm       TEXT        NOT NULL,
  predicate          TEXT        NOT NULL,
  predicate_norm     TEXT        NOT NULL,
  object_value       TEXT        NOT NULL,
  object_norm        TEXT        NOT NULL,
  confidence         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  source_message_id  TEXT,
  domain             TEXT,
  observed_at        TIMESTAMPTZ,
  message_timestamp  TIMESTAMPTZ NOT NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS afp_knowledge_triples_user_subject_idx
  ON afp_knowledge_triples(user_id, subject_norm);

CREATE INDEX IF NOT EXISTS afp_knowledge_triples_user_predicate_idx
  ON afp_knowledge_triples(user_id, predicate_norm);

CREATE INDEX IF NOT EXISTS afp_knowledge_triples_user_object_idx
  ON afp_knowledge_triples(user_id, object_norm);

CREATE INDEX IF NOT EXISTS afp_knowledge_triples_user_source_idx
  ON afp_knowledge_triples(user_id, source_message_id);

CREATE INDEX IF NOT EXISTS afp_knowledge_triples_user_domain_idx
  ON afp_knowledge_triples(user_id, domain);
