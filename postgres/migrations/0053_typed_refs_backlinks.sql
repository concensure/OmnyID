-- Phase 19: Typed semantic backlink durability and retrieval hardening
-- Migration 0053 — preserve semantic edge labels alongside existing backlink kind

ALTER TABLE afp_backlinks
  ADD COLUMN IF NOT EXISTS ref_type TEXT NOT NULL DEFAULT '';

ALTER TABLE afp_backlinks
  DROP CONSTRAINT IF EXISTS afp_backlinks_user_id_source_id_target_id_link_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS afp_backlinks_edge_unique_idx
  ON afp_backlinks(user_id, source_id, target_id, link_kind, ref_type);
