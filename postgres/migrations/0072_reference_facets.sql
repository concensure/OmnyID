-- Migration: 0072_reference_facets
-- Purpose: Persist derived AFP reference facets for indexed relational retrieval.

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS reference_targets TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS reference_types TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS link_types TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reference_targets
    ON messages USING GIN (reference_targets);

CREATE INDEX IF NOT EXISTS idx_reference_types
    ON messages USING GIN (reference_types);

CREATE INDEX IF NOT EXISTS idx_link_types
    ON messages USING GIN (link_types);

UPDATE messages
SET
    reference_targets = COALESCE((
        SELECT ARRAY(
            SELECT DISTINCT ref->>'target'
            FROM jsonb_array_elements("references") AS ref
            WHERE COALESCE(ref->>'target', '') <> ''
            ORDER BY ref->>'target'
        )
    ), '{}'),
    reference_types = COALESCE((
        SELECT ARRAY(
            SELECT DISTINCT ref->>'type'
            FROM jsonb_array_elements("references") AS ref
            WHERE COALESCE(ref->>'type', '') <> ''
            ORDER BY ref->>'type'
        )
    ), '{}'),
    link_types = COALESCE((
        SELECT ARRAY(
            SELECT DISTINCT ref->'metadata'->>'link_type'
            FROM jsonb_array_elements("references") AS ref
            WHERE COALESCE(ref->'metadata'->>'link_type', '') <> ''
            ORDER BY ref->'metadata'->>'link_type'
        )
    ), '{}')
WHERE jsonb_array_length("references") > 0
  AND (
    cardinality(reference_targets) = 0
    OR cardinality(reference_types) = 0
    OR cardinality(link_types) = 0
  );
