-- Migration: 0074_router_metadata_terms
-- Purpose: Persist exact metadata terms in the local semantic-router index.
-- Scope: local-replica-only derived search state.

ALTER TABLE router_index
    ADD COLUMN IF NOT EXISTS metadata_terms TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ri_metadata_terms
    ON router_index USING GIN (metadata_terms);

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
