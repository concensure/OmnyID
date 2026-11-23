WITH source AS (
    SELECT
        m.id AS message_id,
        m.thread_id,
        m.from_agent,
        m.timestamp AS ts,
        m.type,
        m.kind,
        m.subtype,
        m.content,
        m.metadata,
        m.summary,
        m.supertags AS stored_supertags,
        m.reference_targets,
        m.reference_types,
        m.link_types,
        COALESCE((
            SELECT ARRAY(
                SELECT DISTINCT lower(trim(tag_value))
                FROM (
                    SELECT unnest(COALESCE(m.supertags, '{}'::text[])) AS tag_value
                    UNION ALL
                    SELECT jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(m.content -> 'supertags') = 'array' THEN m.content -> 'supertags'
                            ELSE '[]'::jsonb
                        END
                    )
                ) tag_source
                WHERE trim(tag_value) <> ''
                ORDER BY lower(trim(tag_value))
            )
        ), '{}'::text[]) AS normalized_supertags,
        COALESCE(
            CASE
                WHEN jsonb_typeof(m.metadata -> 'searchable_metadata') = 'object'
                    THEN m.metadata -> 'searchable_metadata'
                ELSE '{}'::jsonb
            END,
            '{}'::jsonb
        ) || jsonb_strip_nulls(jsonb_build_object(
            'message_type', m.type,
            'subtype', m.subtype,
            'kind', COALESCE(m.kind, NULLIF(m.content ->> 'kind', '')),
            'title', COALESCE(m.content ->> 'title', m.content ->> 'subject'),
            'summary', m.content ->> 'summary',
            'description', m.content ->> 'description',
            'status', COALESCE(m.content ->> 'status', m.metadata ->> 'status'),
            'priority', COALESCE(m.content ->> 'priority', m.metadata ->> 'priority'),
            'domain', COALESCE(m.content ->> 'domain', m.metadata ->> 'domain'),
            'follow_up_at', COALESCE(m.content ->> 'follow_up_at', m.metadata ->> 'follow_up_at'),
            'memory_space', m.metadata ->> 'memory_space',
            'author_mask', m.metadata ->> 'author_mask',
            'author_type', m.metadata ->> 'author_type',
            'author_id', m.metadata ->> 'author_id',
            'owner', COALESCE(m.content -> 'metadata' ->> 'owner', m.metadata ->> 'owner'),
            'is_human_authored',
                CASE
                    WHEN m.metadata ? 'is_human_authored' THEN m.metadata -> 'is_human_authored'
                    ELSE NULL
                END,
            'human_only',
                CASE
                    WHEN m.metadata ? 'human_only' THEN m.metadata -> 'human_only'
                    ELSE NULL
                END,
            'suggested_actions',
                CASE
                    WHEN jsonb_typeof(m.content -> 'suggested_actions') = 'array' THEN m.content -> 'suggested_actions'
                    WHEN jsonb_typeof(m.content -> 'suggested_actions') = 'string'
                        THEN jsonb_build_array(m.content ->> 'suggested_actions')
                    ELSE NULL
                END
        )) AS searchable_metadata
    FROM messages m
),
facets AS (
    SELECT
        source.message_id,
        source.thread_id,
        source.from_agent,
        source.ts,
        source.type,
        source.subtype,
        COALESCE(source.kind, NULLIF(source.content ->> 'kind', ''), source.type) AS router_kind,
        source.normalized_supertags,
        source.reference_targets,
        source.reference_types,
        source.link_types,
        COALESCE((
            SELECT ARRAY(
                SELECT DISTINCT 'metadata.searchable_metadata.' || entry.key
                FROM jsonb_each(source.searchable_metadata) AS entry(key, value)
                WHERE entry.key <> ''
                ORDER BY 'metadata.searchable_metadata.' || entry.key
            )
        ), '{}'::text[]) AS metadata_keys,
        COALESCE((
            SELECT ARRAY(
                SELECT DISTINCT value_item
                FROM jsonb_each(source.searchable_metadata) AS entry(key, value)
                CROSS JOIN LATERAL (
                    SELECT trim(entry.value #>> '{}') AS value_item
                    WHERE jsonb_typeof(entry.value) = 'string'
                    UNION ALL
                    SELECT trim(entry.value::text) AS value_item
                    WHERE jsonb_typeof(entry.value) IN ('number', 'boolean')
                    UNION ALL
                    SELECT trim(array_item) AS value_item
                    FROM jsonb_array_elements_text(entry.value) AS array_values(array_item)
                    WHERE jsonb_typeof(entry.value) = 'array'
                ) normalized
                WHERE value_item <> ''
                ORDER BY value_item
            )
        ), '{}'::text[]) AS metadata_values,
        COALESCE((
            SELECT ARRAY(
                SELECT DISTINCT lower(entry.key || ':' || value_item)
                FROM jsonb_each(source.searchable_metadata) AS entry(key, value)
                CROSS JOIN LATERAL (
                    SELECT trim(entry.value #>> '{}') AS value_item
                    WHERE jsonb_typeof(entry.value) = 'string'
                    UNION ALL
                    SELECT trim(entry.value::text) AS value_item
                    WHERE jsonb_typeof(entry.value) IN ('number', 'boolean')
                    UNION ALL
                    SELECT trim(array_item) AS value_item
                    FROM jsonb_array_elements_text(entry.value) AS array_values(array_item)
                    WHERE jsonb_typeof(entry.value) = 'array'
                ) normalized
                WHERE value_item <> ''
                ORDER BY lower(entry.key || ':' || value_item)
            )
        ), '{}'::text[]) AS metadata_terms,
        COALESCE((
            SELECT ARRAY(
                SELECT DISTINCT lower(trim(entity_value))
                FROM (
                    SELECT NULLIF(source.content ->> 'title', '') AS entity_value
                    UNION ALL
                    SELECT NULLIF(source.content ->> 'subject', '')
                ) entity_source
                WHERE entity_value IS NOT NULL
                ORDER BY lower(trim(entity_value))
            )
        ), '{}'::text[]) AS entities,
        COALESCE(
            NULLIF(source.summary, ''),
            NULLIF(source.searchable_metadata ->> 'summary', ''),
            NULLIF(source.searchable_metadata ->> 'title', ''),
            NULLIF(source.searchable_metadata ->> 'description', ''),
            NULLIF(source.content ->> 'summary', ''),
            NULLIF(source.content ->> 'title', ''),
            NULLIF(source.content ->> 'subject', ''),
            NULLIF(source.content ->> 'description', '')
        ) AS searchable_summary,
        source.searchable_metadata,
        0.5::real AS salience,
        TRUE AS body_available
    FROM source
)
INSERT INTO router_index (
    message_id,
    thread_id,
    from_agent,
    ts,
    type,
    subtype,
    kind,
    supertags,
    reference_targets,
    reference_types,
    link_types,
    entities,
    searchable_summary,
    searchable_metadata,
    metadata_keys,
    metadata_values,
    metadata_terms,
    salience,
    body_available,
    summary_tsv
)
SELECT
    facets.message_id,
    facets.thread_id,
    facets.from_agent,
    facets.ts,
    facets.type,
    facets.subtype,
    facets.router_kind,
    facets.normalized_supertags,
    COALESCE(facets.reference_targets, '{}'::text[]),
    COALESCE(facets.reference_types, '{}'::text[]),
    COALESCE(facets.link_types, '{}'::text[]),
    facets.entities,
    facets.searchable_summary,
    facets.searchable_metadata,
    facets.metadata_keys,
    facets.metadata_values,
    facets.metadata_terms,
    facets.salience,
    facets.body_available,
    to_tsvector('simple', COALESCE(facets.searchable_summary, ''))
FROM facets
ON CONFLICT (message_id) DO UPDATE
    SET thread_id = EXCLUDED.thread_id,
        from_agent = EXCLUDED.from_agent,
        ts = EXCLUDED.ts,
        type = EXCLUDED.type,
        subtype = EXCLUDED.subtype,
        kind = EXCLUDED.kind,
        supertags = EXCLUDED.supertags,
        reference_targets = EXCLUDED.reference_targets,
        reference_types = EXCLUDED.reference_types,
        link_types = EXCLUDED.link_types,
        entities = EXCLUDED.entities,
        searchable_summary = EXCLUDED.searchable_summary,
        searchable_metadata = EXCLUDED.searchable_metadata,
        metadata_keys = EXCLUDED.metadata_keys,
        metadata_values = EXCLUDED.metadata_values,
        metadata_terms = EXCLUDED.metadata_terms,
        salience = EXCLUDED.salience,
        body_available = EXCLUDED.body_available,
        summary_tsv = EXCLUDED.summary_tsv;

DELETE FROM router_index ri
WHERE NOT EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.id = ri.message_id
);

WITH projected_links AS (
    SELECT
        m.id AS link_message_id,
        m.content ->> 'source_message_id' AS source_message_id,
        m.content ->> 'target_message_id' AS target_message_id,
        m.content ->> 'link_type' AS link_type,
        COALESCE(NULLIF(m.content ->> 'weight', '')::real, 1.0::real) AS weight,
        NULLIF(m.content ->> 'label', '') AS label
    FROM messages m
    WHERE m.type IN ('knowledge_link', 'relation_link')
      AND COALESCE(m.content ->> 'source_message_id', '') <> ''
      AND COALESCE(m.content ->> 'target_message_id', '') <> ''
      AND COALESCE(m.content ->> 'link_type', '') <> ''
)
INSERT INTO router_links (
    link_message_id,
    source_message_id,
    target_message_id,
    link_type,
    weight,
    label
)
SELECT
    projected_links.link_message_id,
    projected_links.source_message_id,
    projected_links.target_message_id,
    projected_links.link_type,
    projected_links.weight,
    projected_links.label
FROM projected_links
ON CONFLICT (link_message_id) DO UPDATE
    SET source_message_id = EXCLUDED.source_message_id,
        target_message_id = EXCLUDED.target_message_id,
        link_type = EXCLUDED.link_type,
        weight = EXCLUDED.weight,
        label = EXCLUDED.label;

DELETE FROM router_links rl
WHERE NOT EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.id = rl.link_message_id
      AND m.type IN ('knowledge_link', 'relation_link')
      AND COALESCE(m.content ->> 'source_message_id', '') <> ''
      AND COALESCE(m.content ->> 'target_message_id', '') <> ''
      AND COALESCE(m.content ->> 'link_type', '') <> ''
);
