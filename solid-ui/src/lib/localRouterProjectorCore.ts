// @locs-version: 1.0
export type QueryableDb = {
  exec(query: string): Promise<unknown>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type TransactionalDb = QueryableDb & {
  transaction<T>(callback: (tx: QueryableDb) => Promise<T>): Promise<T>;
};

type ProjectionStateRow = {
  source_message_count: number;
  source_latest_timestamp: string | null;
  source_fingerprint: string | null;
  last_refresh_mode: string | null;
  last_changed_count: number;
  last_removed_count: number;
  consecutive_full_refreshes: number;
  last_partial_refresh_at: string | null;
  last_forced_refresh_at: string | null;
  last_forced_refresh_reduced_warning: boolean;
  last_forced_refresh_cleared_warning: boolean;
};

export type LocalRouterProjectionHealth = {
  sourceMessageCount: number;
  sourceLatestTimestamp: string | null;
  sourceFingerprint: string | null;
  lastRefreshMode: "partial" | "full" | null;
  lastChangedCount: number;
  lastRemovedCount: number;
  consecutiveFullRefreshes: number;
  lastPartialRefreshAt: string | null;
  lastForcedRefreshAt: string | null;
  lastForcedRefreshReducedWarning: boolean;
  lastForcedRefreshClearedWarning: boolean;
  refreshedAt: string | null;
} | null;

type MessageStatsRow = {
  source_message_count: number;
  source_latest_timestamp: string | null;
  source_fingerprint: string | null;
};

type MessageFingerprintRow = {
  message_id: string;
  source_fingerprint: string;
  is_link: boolean;
};

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function hasTransaction(db: QueryableDb): db is TransactionalDb {
  return typeof (db as Partial<TransactionalDb>).transaction === "function";
}

async function ensureProjectionStateTable(db: QueryableDb): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS router_projection_state (
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
    )`);
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS source_fingerprint TEXT`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_refresh_mode TEXT`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_changed_count INTEGER NOT NULL DEFAULT 0`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_removed_count INTEGER NOT NULL DEFAULT 0`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS consecutive_full_refreshes INTEGER NOT NULL DEFAULT 0`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_partial_refresh_at TIMESTAMPTZ`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_forced_refresh_at TIMESTAMPTZ`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_forced_refresh_reduced_warning BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await db.exec(
    `ALTER TABLE router_projection_state
       ADD COLUMN IF NOT EXISTS last_forced_refresh_cleared_warning BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await db.exec(`CREATE TABLE IF NOT EXISTS router_projection_inputs (
      message_id TEXT PRIMARY KEY,
      source_fingerprint TEXT NOT NULL,
      is_link BOOLEAN NOT NULL DEFAULT FALSE,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

async function messageStats(db: QueryableDb): Promise<MessageStatsRow> {
  const result = await db.query<MessageStatsRow>(
    `SELECT COUNT(*)::int AS source_message_count,
            MAX(timestamp)::text AS source_latest_timestamp,
            md5(COALESCE(string_agg(
              md5(jsonb_build_array(
                id,
                thread_id,
                from_agent,
                timestamp::text,
                type,
                COALESCE(kind, ''),
                COALESCE(subtype, ''),
                COALESCE(summary, ''),
                COALESCE(content, '{}'::jsonb),
                COALESCE(metadata, '{}'::jsonb),
                COALESCE(to_jsonb(supertags), '[]'::jsonb),
                COALESCE(to_jsonb(reference_targets), '[]'::jsonb),
                COALESCE(to_jsonb(reference_types), '[]'::jsonb),
                COALESCE(to_jsonb(link_types), '[]'::jsonb)
              )::text),
              '|' ORDER BY id
            ), '')) AS source_fingerprint
       FROM messages`,
  );
  return result.rows[0] ?? {
    source_message_count: 0,
    source_latest_timestamp: null,
    source_fingerprint: null,
  };
}

async function projectionState(db: QueryableDb): Promise<ProjectionStateRow | null> {
  const result = await db.query<ProjectionStateRow>(
    `SELECT source_message_count,
            source_latest_timestamp::text AS source_latest_timestamp,
            source_fingerprint,
            last_refresh_mode,
            last_changed_count,
            last_removed_count,
            consecutive_full_refreshes,
            last_partial_refresh_at::text AS last_partial_refresh_at,
            last_forced_refresh_at::text AS last_forced_refresh_at,
            last_forced_refresh_reduced_warning,
            last_forced_refresh_cleared_warning
       FROM router_projection_state
      WHERE projection_name = 'router_index'`,
  );
  return result.rows[0] ?? null;
}

export async function localRouterProjectionHealth(db: QueryableDb): Promise<LocalRouterProjectionHealth> {
  await ensureProjectionStateTable(db);
  const result = await db.query<ProjectionStateRow & { refreshed_at: string | null }>(
    `SELECT source_message_count,
            source_latest_timestamp::text AS source_latest_timestamp,
            source_fingerprint,
            last_refresh_mode,
            last_changed_count,
            last_removed_count,
            consecutive_full_refreshes,
            last_partial_refresh_at::text AS last_partial_refresh_at,
            last_forced_refresh_at::text AS last_forced_refresh_at,
            last_forced_refresh_reduced_warning,
            last_forced_refresh_cleared_warning,
            refreshed_at::text AS refreshed_at
       FROM router_projection_state
      WHERE projection_name = 'router_index'`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    sourceMessageCount: row.source_message_count,
    sourceLatestTimestamp: row.source_latest_timestamp ?? null,
    sourceFingerprint: row.source_fingerprint ?? null,
    lastRefreshMode:
      row.last_refresh_mode === "partial" || row.last_refresh_mode === "full"
        ? row.last_refresh_mode
        : null,
    lastChangedCount: row.last_changed_count,
    lastRemovedCount: row.last_removed_count,
    consecutiveFullRefreshes: row.consecutive_full_refreshes,
    lastPartialRefreshAt: row.last_partial_refresh_at ?? null,
    lastForcedRefreshAt: row.last_forced_refresh_at ?? null,
    lastForcedRefreshReducedWarning: row.last_forced_refresh_reduced_warning,
    lastForcedRefreshClearedWarning: row.last_forced_refresh_cleared_warning,
    refreshedAt: row.refreshed_at ?? null,
  };
}

function stateMatches(left: ProjectionStateRow | null, right: MessageStatsRow): boolean {
  if (!left) return false;
  return (
    left.source_message_count === right.source_message_count
    && (left.source_latest_timestamp ?? null) === (right.source_latest_timestamp ?? null)
    && (left.source_fingerprint ?? null) === (right.source_fingerprint ?? null)
  );
}

async function currentMessageFingerprints(db: QueryableDb): Promise<Map<string, MessageFingerprintRow>> {
  const result = await db.query<MessageFingerprintRow>(
    `SELECT id AS message_id,
            md5(jsonb_build_array(
              id,
              thread_id,
              from_agent,
              timestamp::text,
              type,
              COALESCE(kind, ''),
              COALESCE(subtype, ''),
              COALESCE(summary, ''),
              COALESCE(content, '{}'::jsonb),
              COALESCE(metadata, '{}'::jsonb),
              COALESCE(to_jsonb(supertags), '[]'::jsonb),
              COALESCE(to_jsonb(reference_targets), '[]'::jsonb),
              COALESCE(to_jsonb(reference_types), '[]'::jsonb),
              COALESCE(to_jsonb(link_types), '[]'::jsonb)
            )::text) AS source_fingerprint,
            (
              type IN ('knowledge_link', 'relation_link')
              AND COALESCE(content ->> 'source_message_id', '') <> ''
              AND COALESCE(content ->> 'target_message_id', '') <> ''
              AND COALESCE(content ->> 'link_type', '') <> ''
            ) AS is_link
       FROM messages`,
  );
  return new Map(result.rows.map((row) => [row.message_id, row]));
}

async function projectedMessageFingerprints(db: QueryableDb): Promise<Map<string, MessageFingerprintRow>> {
  const result = await db.query<MessageFingerprintRow>(
    `SELECT message_id, source_fingerprint, is_link
       FROM router_projection_inputs`,
  );
  return new Map(result.rows.map((row) => [row.message_id, row]));
}

function diffProjectionInputs(
  current: Map<string, MessageFingerprintRow>,
  projected: Map<string, MessageFingerprintRow>,
): {
  changedIds: string[];
  removedIds: string[];
} {
  const changedIds: string[] = [];
  for (const [messageId, currentRow] of current.entries()) {
    const projectedRow = projected.get(messageId);
    if (
      !projectedRow
      || projectedRow.source_fingerprint !== currentRow.source_fingerprint
      || projectedRow.is_link !== currentRow.is_link
    ) {
      changedIds.push(messageId);
    }
  }

  const removedIds: string[] = [];
  for (const messageId of projected.keys()) {
    if (!current.has(messageId)) {
      removedIds.push(messageId);
    }
  }

  return { changedIds, removedIds };
}

const UPSERT_ROUTER_INDEX_FOR_MESSAGE_IDS_SQL = `
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
    WHERE m.id = ANY($1::text[])
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
        summary_tsv = EXCLUDED.summary_tsv
`;

const UPSERT_ROUTER_LINKS_FOR_MESSAGE_IDS_SQL = `
WITH projected_links AS (
    SELECT
        m.id AS link_message_id,
        m.content ->> 'source_message_id' AS source_message_id,
        m.content ->> 'target_message_id' AS target_message_id,
        m.content ->> 'link_type' AS link_type,
        COALESCE(NULLIF(m.content ->> 'weight', '')::real, 1.0::real) AS weight,
        NULLIF(m.content ->> 'label', '') AS label
    FROM messages m
    WHERE m.id = ANY($1::text[])
      AND m.type IN ('knowledge_link', 'relation_link')
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
        label = EXCLUDED.label
`;

async function deleteRouterStateForMessageIds(db: QueryableDb, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await db.query(`DELETE FROM router_index WHERE message_id = ANY($1::text[])`, [messageIds]);
  await db.query(`DELETE FROM router_links WHERE link_message_id = ANY($1::text[])`, [messageIds]);
  await db.query(`DELETE FROM router_projection_inputs WHERE message_id = ANY($1::text[])`, [messageIds]);
}

async function pruneStaleRouterState(db: QueryableDb, currentMessageIds: string[]): Promise<void> {
  if (currentMessageIds.length === 0) {
    await db.exec(`TRUNCATE router_index`);
    await db.exec(`TRUNCATE router_links`);
    await db.exec(`TRUNCATE router_projection_inputs`);
    return;
  }

  await db.query(
    `DELETE FROM router_index
      WHERE message_id <> ALL($1::text[])`,
    [currentMessageIds],
  );
  await db.query(
    `DELETE FROM router_projection_inputs
      WHERE message_id <> ALL($1::text[])`,
    [currentMessageIds],
  );
  await db.query(
    `DELETE FROM router_links rl
      WHERE NOT EXISTS (
        SELECT 1
          FROM messages m
         WHERE m.id = rl.link_message_id
           AND m.type IN ('knowledge_link', 'relation_link')
           AND COALESCE(m.content ->> 'source_message_id', '') <> ''
           AND COALESCE(m.content ->> 'target_message_id', '') <> ''
           AND COALESCE(m.content ->> 'link_type', '') <> ''
      )`,
  );
}

async function upsertRouterStateForChangedMessages(
  db: QueryableDb,
  currentFingerprints: Map<string, MessageFingerprintRow>,
  changedIds: string[],
): Promise<void> {
  if (changedIds.length === 0) return;
  await db.query(UPSERT_ROUTER_INDEX_FOR_MESSAGE_IDS_SQL, [changedIds]);
  const changedLinkIds = changedIds.filter((messageId) => currentFingerprints.get(messageId)?.is_link);
  if (changedLinkIds.length > 0) {
    await db.query(UPSERT_ROUTER_LINKS_FOR_MESSAGE_IDS_SQL, [changedLinkIds]);
  }
  await db.query(
    `DELETE FROM router_links
      WHERE link_message_id = ANY($1::text[])
        AND link_message_id <> ALL($2::text[])`,
    [changedIds, changedLinkIds],
  );
  const changedRows = changedIds
    .map((messageId) => currentFingerprints.get(messageId))
    .filter((row): row is MessageFingerprintRow => !!row);
  for (const row of changedRows) {
    await db.query(
      `INSERT INTO router_projection_inputs (
          message_id,
          source_fingerprint,
          is_link,
          refreshed_at
       ) VALUES (
          $1,
          $2,
          $3,
          NOW()
       )
       ON CONFLICT (message_id) DO UPDATE
           SET source_fingerprint = EXCLUDED.source_fingerprint,
               is_link = EXCLUDED.is_link,
               refreshed_at = EXCLUDED.refreshed_at`,
      [row.message_id, row.source_fingerprint, row.is_link],
    );
  }
}

export async function refreshLocalRouterDerivedStateIfStale(
  db: QueryableDb,
  refreshSql: string,
  options?: {
    force?: boolean;
  },
): Promise<boolean> {
  await ensureProjectionStateTable(db);
  const stats = await messageStats(db);
  const current = await projectionState(db);
  if (!options?.force && stateMatches(current, stats)) {
    return false;
  }

  const applyRefresh = async (executor: QueryableDb) => {
    const warningWasActive = (current?.consecutive_full_refreshes ?? 0) >= 2;
    const currentFingerprints = await currentMessageFingerprints(executor);
    const projectedFingerprints = await projectedMessageFingerprints(executor);
    const { changedIds, removedIds } = diffProjectionInputs(currentFingerprints, projectedFingerprints);

    const shouldRunFullRefresh =
      projectedFingerprints.size > 0
      && (changedIds.length + removedIds.length) > Math.max(100, currentFingerprints.size / 2);
    const refreshMode = shouldRunFullRefresh ? "full" : "partial";
    const consecutiveFullRefreshes =
      refreshMode === "full"
        ? (current?.consecutive_full_refreshes ?? 0) + 1
        : 0;
    const warningIsActive = consecutiveFullRefreshes >= 2;
    const nextPartialRefreshAt = refreshMode === "partial"
      ? new Date().toISOString()
      : (current?.last_partial_refresh_at ?? null);
    const nextForcedRefreshAt = options?.force
      ? new Date().toISOString()
      : (current?.last_forced_refresh_at ?? null);
    const nextForcedRefreshReducedWarning = options?.force
      ? ((current?.consecutive_full_refreshes ?? 0) > consecutiveFullRefreshes)
      : (current?.last_forced_refresh_reduced_warning ?? false);
    const nextForcedRefreshClearedWarning = options?.force
      ? (warningWasActive && !warningIsActive)
      : (current?.last_forced_refresh_cleared_warning ?? false);

    if (shouldRunFullRefresh) {
      for (const statement of splitSqlStatements(refreshSql)) {
        await executor.exec(statement);
      }
      await executor.exec(`TRUNCATE router_projection_inputs`);
      for (const row of currentFingerprints.values()) {
        await executor.query(
          `INSERT INTO router_projection_inputs (
              message_id,
              source_fingerprint,
              is_link,
              refreshed_at
           ) VALUES (
              $1,
              $2,
              $3,
              NOW()
           )`,
          [row.message_id, row.source_fingerprint, row.is_link],
        );
      }
    } else {
      await pruneStaleRouterState(executor, [...currentFingerprints.keys()]);
      await deleteRouterStateForMessageIds(executor, removedIds);
      await upsertRouterStateForChangedMessages(executor, currentFingerprints, changedIds);
    }

    await executor.query(
      `INSERT INTO router_projection_state (
          projection_name,
          source_message_count,
          source_latest_timestamp,
          source_fingerprint,
          last_refresh_mode,
          last_changed_count,
          last_removed_count,
          consecutive_full_refreshes,
          last_partial_refresh_at,
          last_forced_refresh_at,
          last_forced_refresh_reduced_warning,
          last_forced_refresh_cleared_warning,
          refreshed_at
       ) VALUES (
          'router_index',
          $1,
          $2::timestamptz,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::timestamptz,
          $9::timestamptz,
          $10,
          $11,
          NOW()
       )
       ON CONFLICT (projection_name) DO UPDATE
           SET source_message_count = EXCLUDED.source_message_count,
               source_latest_timestamp = EXCLUDED.source_latest_timestamp,
               source_fingerprint = EXCLUDED.source_fingerprint,
               last_refresh_mode = EXCLUDED.last_refresh_mode,
               last_changed_count = EXCLUDED.last_changed_count,
               last_removed_count = EXCLUDED.last_removed_count,
               consecutive_full_refreshes = EXCLUDED.consecutive_full_refreshes,
               last_partial_refresh_at = EXCLUDED.last_partial_refresh_at,
               last_forced_refresh_at = EXCLUDED.last_forced_refresh_at,
               last_forced_refresh_reduced_warning = EXCLUDED.last_forced_refresh_reduced_warning,
               last_forced_refresh_cleared_warning = EXCLUDED.last_forced_refresh_cleared_warning,
               refreshed_at = EXCLUDED.refreshed_at`,
      [
        stats.source_message_count,
        stats.source_latest_timestamp,
        stats.source_fingerprint,
        refreshMode,
        changedIds.length,
        removedIds.length,
        consecutiveFullRefreshes,
        nextPartialRefreshAt,
        nextForcedRefreshAt,
        nextForcedRefreshReducedWarning,
        nextForcedRefreshClearedWarning,
      ],
    );
  };

  if (hasTransaction(db)) {
    await db.transaction(async (tx) => {
      await applyRefresh(tx);
    });
  } else {
    await applyRefresh(db);
  }
  return true;
}
