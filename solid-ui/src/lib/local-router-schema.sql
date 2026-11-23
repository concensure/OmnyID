CREATE TABLE IF NOT EXISTS router_index (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    from_agent TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT,
    kind TEXT NOT NULL,
    supertags TEXT[] NOT NULL DEFAULT '{}',
    entities TEXT[] NOT NULL DEFAULT '{}',
    searchable_summary TEXT,
    searchable_metadata JSONB,
    metadata_keys TEXT[] NOT NULL DEFAULT '{}',
    metadata_values TEXT[] NOT NULL DEFAULT '{}',
    metadata_terms TEXT[] NOT NULL DEFAULT '{}',
    reference_targets TEXT[] NOT NULL DEFAULT '{}',
    reference_types TEXT[] NOT NULL DEFAULT '{}',
    link_types TEXT[] NOT NULL DEFAULT '{}',
    salience REAL NOT NULL DEFAULT 0.5,
    body_available BOOLEAN NOT NULL DEFAULT TRUE,
    summary_tsv TSVECTOR
);

ALTER TABLE router_index ADD COLUMN IF NOT EXISTS searchable_metadata JSONB;
ALTER TABLE router_index ADD COLUMN IF NOT EXISTS metadata_keys TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE router_index ADD COLUMN IF NOT EXISTS metadata_values TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE router_index ADD COLUMN IF NOT EXISTS metadata_terms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE router_index ADD COLUMN IF NOT EXISTS reference_targets TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE router_index ADD COLUMN IF NOT EXISTS reference_types TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE router_index ADD COLUMN IF NOT EXISTS link_types TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ri_kind_ts ON router_index (kind, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ri_thread ON router_index (thread_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ri_agent ON router_index (from_agent, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ri_supertags ON router_index USING GIN (supertags);
CREATE INDEX IF NOT EXISTS idx_ri_entities ON router_index USING GIN (entities);
CREATE INDEX IF NOT EXISTS idx_ri_tsv ON router_index USING GIN (summary_tsv);
CREATE INDEX IF NOT EXISTS idx_ri_metadata_keys ON router_index USING GIN (metadata_keys);
CREATE INDEX IF NOT EXISTS idx_ri_metadata_values ON router_index USING GIN (metadata_values);
CREATE INDEX IF NOT EXISTS idx_ri_metadata_terms ON router_index USING GIN (metadata_terms);
CREATE INDEX IF NOT EXISTS idx_ri_reference_targets ON router_index USING GIN (reference_targets);
CREATE INDEX IF NOT EXISTS idx_ri_reference_types ON router_index USING GIN (reference_types);
CREATE INDEX IF NOT EXISTS idx_ri_link_types ON router_index USING GIN (link_types);

CREATE TABLE IF NOT EXISTS router_links (
    link_message_id TEXT PRIMARY KEY,
    source_message_id TEXT NOT NULL,
    target_message_id TEXT NOT NULL,
    link_type TEXT NOT NULL,
    weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
    label TEXT
);

CREATE INDEX IF NOT EXISTS idx_rl_source ON router_links (source_message_id);
CREATE INDEX IF NOT EXISTS idx_rl_target ON router_links (target_message_id);

CREATE TABLE IF NOT EXISTS router_projection_state (
    projection_name TEXT PRIMARY KEY,
    source_message_count BIGINT NOT NULL DEFAULT 0,
    source_latest_timestamp TIMESTAMPTZ,
    source_fingerprint TEXT,
    last_refresh_mode TEXT,
    last_changed_count INTEGER NOT NULL DEFAULT 0,
    last_removed_count INTEGER NOT NULL DEFAULT 0,
    consecutive_full_refreshes INTEGER NOT NULL DEFAULT 0,
    last_partial_refresh_at TIMESTAMPTZ,
    last_forced_refresh_at TIMESTAMPTZ,
    last_forced_refresh_reduced_warning BOOLEAN NOT NULL DEFAULT FALSE,
    last_forced_refresh_cleared_warning BOOLEAN NOT NULL DEFAULT FALSE,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_refresh_mode TEXT;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_changed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_removed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS consecutive_full_refreshes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_partial_refresh_at TIMESTAMPTZ;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_forced_refresh_at TIMESTAMPTZ;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_forced_refresh_reduced_warning BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE router_projection_state
    ADD COLUMN IF NOT EXISTS last_forced_refresh_cleared_warning BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS router_projection_inputs (
    message_id TEXT PRIMARY KEY,
    source_fingerprint TEXT NOT NULL,
    is_link BOOLEAN NOT NULL DEFAULT FALSE,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE router_index
SET metadata_terms = COALESCE((
    SELECT ARRAY(
        SELECT DISTINCT lower(concat(entry.key, ':', value_item))
        FROM jsonb_each(searchable_metadata) AS entry(key, value)
        CROSS JOIN LATERAL (
            SELECT CASE
                WHEN jsonb_typeof(entry.value) = 'string' THEN entry.value #>> '{}'
                WHEN jsonb_typeof(entry.value) IN ('number', 'boolean') THEN entry.value::text
                ELSE NULL
            END AS value_item
            UNION ALL
            SELECT array_item
            FROM jsonb_array_elements_text(entry.value) AS array_values(array_item)
            WHERE jsonb_typeof(entry.value) = 'array'
        ) AS normalized
        WHERE entry.key <> ''
          AND COALESCE(value_item, '') <> ''
        ORDER BY lower(concat(entry.key, ':', value_item))
    )
), '{}')
WHERE searchable_metadata IS NOT NULL
  AND cardinality(metadata_terms) = 0;
