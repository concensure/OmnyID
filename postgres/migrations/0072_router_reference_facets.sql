-- Migration: 0072_router_reference_facets
-- Purpose: Align local semantic-router facet storage with canonical AFP references.
-- Scope: local-replica-only derived search state.

ALTER TABLE router_index
    ADD COLUMN IF NOT EXISTS reference_targets TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS reference_types TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS link_types TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ri_reference_targets
    ON router_index USING GIN (reference_targets);

CREATE INDEX IF NOT EXISTS idx_ri_reference_types
    ON router_index USING GIN (reference_types);

CREATE INDEX IF NOT EXISTS idx_ri_link_types
    ON router_index USING GIN (link_types);
