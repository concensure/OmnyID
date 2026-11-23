-- Migration: 0070_router_metadata_facets
-- Purpose: Add metadata facet columns for local semantic-router filtering.
-- Scope: local-replica-only derived search state.

ALTER TABLE router_index
    ADD COLUMN IF NOT EXISTS searchable_metadata JSONB,
    ADD COLUMN IF NOT EXISTS metadata_keys TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS metadata_values TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ri_metadata_keys
    ON router_index USING GIN (metadata_keys);

CREATE INDEX IF NOT EXISTS idx_ri_metadata_values
    ON router_index USING GIN (metadata_values);
