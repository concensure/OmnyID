// @locs-version: 1.0
/**
 * Concrete LocalStore implementation backed by PGlite (on-device local replica).
 *
 * Invariants:
 *  - Never connects to the homeserver. All queries run against the local replica.
 *  - `decryptFn` is the ONLY path where plaintext leaves function scope; it must
 *    use the user's locally-held key material (libsodium, WebCrypto, etc.).
 *  - `embedder` is injected so the caller can choose between Xenova/Transformers,
 *    a WASM model, or a stub during testing.
 *
 * Wire-up example (solid-ui):
 *   import { PGlite } from '@electric-sql/pglite';
 *   const db = new PGlite({ extensions: { vector } });
 *   const store = new PGliteStore(db, myEmbedder, myDecryptFn);
 *   const router = createRouter(store, myGrantVerifier);
 */

import type { PGlite, Results } from '@electric-sql/pglite';
import type {
  LocalStore,
  MetadataFilter,
  ScoredRow,
  EdgeRow,
  IndexedMessage,
  LedgerKind,
} from 'afp-ts/semantic-router';

export type Embedder = (text: string) => Promise<number[]>;
export type DecryptFn = (messageIds: string[]) => Promise<Map<string, string>>;
type MetadataFilterWithTerms = MetadataFilter & { metadataTerms?: string[] };

interface RawIndexRow {
  message_id: string;
  thread_id: string;
  from_agent: string;
  timestamp: string;
  type: string;
  subtype: string | null;
  kind: string;
  supertags: string[];
  reference_targets: string[];
  reference_types: string[];
  link_types: string[];
  entities: string[];
  searchable_summary: string | null;
  searchable_metadata: Record<string, unknown> | null;
  metadata_keys: string[];
  metadata_values: string[];
  metadata_terms: string[];
  salience: number;
  body_available: boolean;
}

interface RawEdgeRow extends RawIndexRow {
  source_message_id: string;
  target_message_id: string;
  link_type: string;
  weight: number;
}

async function queryOneHopNeighborRows(
  db: PGlite,
  messageIds: string[],
  limit: number,
): Promise<RawEdgeRow[]> {
  if (messageIds.length === 0) return [];
  const res: Results<RawEdgeRow> = await db.query(
    `SELECT rl.source_message_id AS source_message_id,
            rl.target_message_id AS target_message_id,
            rl.link_type,
            rl.weight,
            ri.message_id,
            ri.thread_id,
            ri.from_agent,
            ri.ts::text AS timestamp,
            ri.type,
            ri.subtype,
            ri.kind,
            ri.supertags,
            ri.reference_targets,
            ri.reference_types,
            ri.link_types,
            ri.entities,
            ri.searchable_summary,
            ri.searchable_metadata,
            ri.metadata_keys,
            ri.metadata_values,
            ri.metadata_terms,
            ri.salience,
            ri.body_available
     FROM router_links rl
     JOIN router_index ri ON ri.message_id = rl.target_message_id
     WHERE rl.source_message_id = ANY($1)
     UNION ALL
     SELECT rl.target_message_id AS source_message_id,
            rl.source_message_id AS target_message_id,
            rl.link_type,
            rl.weight,
            ri.message_id,
            ri.thread_id,
            ri.from_agent,
            ri.ts::text AS timestamp,
            ri.type,
            ri.subtype,
            ri.kind,
            ri.supertags,
            ri.reference_targets,
            ri.reference_types,
            ri.link_types,
            ri.entities,
            ri.searchable_summary,
            ri.searchable_metadata,
            ri.metadata_keys,
            ri.metadata_values,
            ri.metadata_terms,
            ri.salience,
            ri.body_available
     FROM router_links rl
     JOIN router_index ri ON ri.message_id = rl.source_message_id
     WHERE rl.target_message_id = ANY($1)
     LIMIT $2`,
    [messageIds, limit],
  );
  return res.rows;
}

function toMessage(r: RawIndexRow): IndexedMessage {
  return {
    message_id: r.message_id,
    thread_id: r.thread_id,
    from_agent: r.from_agent,
    timestamp: r.timestamp,
    type: r.type,
    subtype: r.subtype ?? undefined,
    kind: r.kind as LedgerKind,
    supertags: r.supertags ?? [],
    referenceTargets: r.reference_targets ?? [],
    referenceTypes: r.reference_types ?? [],
    linkTypes: r.link_types ?? [],
    entities: r.entities ?? [],
    searchable_summary: r.searchable_summary,
    searchable_metadata: r.searchable_metadata ?? undefined,
    salience: r.salience,
    body_available: r.body_available,
  };
}

const LOCAL_METADATA_TERM_FALLBACK_SQL = `EXISTS (
              SELECT 1
              FROM unnest($TERM_PARAM::text[]) AS term
              WHERE split_part(term, ':', 1) <> ''
                AND (
                  coalesce(searchable_metadata ->> split_part(term, ':', 1), '') = split_part(term, ':', 2)
                  OR (
                    jsonb_typeof(searchable_metadata -> split_part(term, ':', 1)) = 'array'
                    AND EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements_text(searchable_metadata -> split_part(term, ':', 1)) AS array_value(value)
                      WHERE lower(array_value.value) = lower(split_part(term, ':', 2))
                    )
                  )
                )
          )`;

export class PGliteStore implements LocalStore {
  constructor(
    private readonly db: PGlite,
    private readonly embedder: Embedder,
    private readonly decryptFn: DecryptFn,
  ) {}

  async queryMetadata(f: MetadataFilter): Promise<IndexedMessage[]> {
    const metadataTerms = (f as MetadataFilterWithTerms).metadataTerms ?? null;
    const res: Results<RawIndexRow> = await this.db.query(
      `SELECT message_id, thread_id, from_agent, ts::text AS timestamp,
              type, subtype, kind, supertags, reference_targets, reference_types, link_types, entities,
              searchable_summary, searchable_metadata, metadata_keys, metadata_values, metadata_terms, salience, body_available
       FROM router_index
       WHERE ($1::text[]  IS NULL OR kind       = ANY($1))
         AND ($2::text[]  IS NULL OR supertags  && $2)
         AND ($3::text[]  IS NULL OR reference_targets && $3)
         AND ($4::text[]  IS NULL OR reference_types && $4)
         AND ($5::text[]  IS NULL OR link_types && $5)
         AND ($6::text[]  IS NULL OR metadata_keys && $6)
         AND ($7::text[]  IS NULL OR metadata_values && $7)
         AND ($8::text[]  IS NULL OR metadata_terms && $8 OR (cardinality(metadata_terms) = 0 AND ${LOCAL_METADATA_TERM_FALLBACK_SQL.replaceAll("$TERM_PARAM", "$8")}))
         AND ($9::text[]  IS NULL OR thread_id  = ANY($9))
         AND ($10::text[] IS NULL OR from_agent = ANY($10))
         AND ($11::text   IS NULL OR ts >= $11::timestamptz)
         AND ($12::text   IS NULL OR ts <= $12::timestamptz)
       ORDER BY ts DESC
       LIMIT $13`,
      [
        f.kinds ?? null,
        f.supertags ?? null,
        f.referenceTargets ?? null,
        f.referenceTypes ?? null,
        f.linkTypes ?? null,
        f.metadataKeys ?? null,
        f.metadataValues ?? null,
        metadataTerms,
        f.threadIds ?? null,
        f.fromAgents ?? null,
        f.timeFrom ?? null,
        f.timeTo ?? null,
        f.limit,
      ],
    );
    return res.rows.map(toMessage);
  }

  async fullTextSearch(text: string, f: MetadataFilter, limit: number): Promise<ScoredRow[]> {
    const metadataTerms = (f as MetadataFilterWithTerms).metadataTerms ?? null;
    const res: Results<RawIndexRow & { score: number }> = await this.db.query(
      `SELECT ri.message_id, ri.thread_id, ri.from_agent, ri.ts::text AS timestamp,
              ri.type, ri.subtype, ri.kind, ri.supertags, ri.reference_targets, ri.reference_types, ri.link_types, ri.entities,
              ri.searchable_summary, ri.searchable_metadata, ri.metadata_keys, ri.metadata_values, ri.metadata_terms, ri.salience, ri.body_available,
              ts_rank(ri.summary_tsv, plainto_tsquery('simple', $1)) AS score
       FROM router_index ri
       WHERE ri.summary_tsv @@ plainto_tsquery('simple', $1)
         AND ($2::text[] IS NULL OR ri.kind       = ANY($2))
         AND ($3::text[] IS NULL OR ri.supertags  && $3)
         AND ($4::text[] IS NULL OR ri.reference_targets && $4)
         AND ($5::text[] IS NULL OR ri.reference_types && $5)
         AND ($6::text[] IS NULL OR ri.link_types && $6)
         AND ($7::text[] IS NULL OR ri.metadata_keys && $7)
         AND ($8::text[] IS NULL OR ri.metadata_values && $8)
         AND ($9::text[] IS NULL OR ri.metadata_terms && $9 OR (cardinality(ri.metadata_terms) = 0 AND ${LOCAL_METADATA_TERM_FALLBACK_SQL.replaceAll("searchable_metadata", "ri.searchable_metadata").replaceAll("$TERM_PARAM", "$9")}))
         AND ($10::text[] IS NULL OR ri.thread_id  = ANY($10))
         AND ($11::text  IS NULL OR ri.ts >= $11::timestamptz)
         AND ($12::text  IS NULL OR ri.ts <= $12::timestamptz)
       ORDER BY score DESC, ri.ts DESC
       LIMIT $13`,
      [
        text,
        f.kinds ?? null,
        f.supertags ?? null,
        f.referenceTargets ?? null,
        f.referenceTypes ?? null,
        f.linkTypes ?? null,
        f.metadataKeys ?? null,
        f.metadataValues ?? null,
        metadataTerms,
        f.threadIds ?? null,
        f.timeFrom ?? null,
        f.timeTo ?? null,
        limit,
      ],
    );
    const max = res.rows[0]?.score ?? 1;
    return res.rows.map(r => ({
      message: toMessage(r),
      score: max > 0 ? r.score / max : 0,
    }));
  }

  async vectorSearch(embedding: number[], f: MetadataFilter, limit: number): Promise<ScoredRow[]> {
    const metadataTerms = (f as MetadataFilterWithTerms).metadataTerms ?? null;
    try {
      const vec = `[${embedding.join(',')}]`;
      const res: Results<RawIndexRow & { score: number }> = await this.db.query(
        `SELECT ri.message_id, ri.thread_id, ri.from_agent, ri.ts::text AS timestamp,
                ri.type, ri.subtype, ri.kind, ri.supertags, ri.reference_targets, ri.reference_types, ri.link_types, ri.entities,
                ri.searchable_summary, ri.searchable_metadata, ri.metadata_keys, ri.metadata_values, ri.metadata_terms, ri.salience, ri.body_available,
                (1 - (re.embedding <=> $1::vector)) AS score
         FROM router_embeddings re
         JOIN router_index ri ON ri.message_id = re.message_id
         WHERE ($2::text[] IS NULL OR ri.kind      = ANY($2))
           AND ($3::text[] IS NULL OR ri.supertags && $3)
           AND ($4::text[] IS NULL OR ri.reference_targets && $4)
           AND ($5::text[] IS NULL OR ri.reference_types && $5)
           AND ($6::text[] IS NULL OR ri.link_types && $6)
           AND ($7::text[] IS NULL OR ri.metadata_keys && $7)
           AND ($8::text[] IS NULL OR ri.metadata_values && $8)
           AND ($9::text[] IS NULL OR ri.metadata_terms && $9 OR (cardinality(ri.metadata_terms) = 0 AND ${LOCAL_METADATA_TERM_FALLBACK_SQL.replaceAll("searchable_metadata", "ri.searchable_metadata").replaceAll("$TERM_PARAM", "$9")}))
           AND ($10::text[] IS NULL OR ri.thread_id = ANY($10))
           AND ($11::text[] IS NULL OR ri.from_agent = ANY($11))
           AND ($12::text IS NULL OR ri.ts >= $12::timestamptz)
           AND ($13::text IS NULL OR ri.ts <= $13::timestamptz)
         ORDER BY re.embedding <=> $1::vector
         LIMIT $14`,
        [
          vec,
          f.kinds ?? null,
          f.supertags ?? null,
          f.referenceTargets ?? null,
          f.referenceTypes ?? null,
          f.linkTypes ?? null,
          f.metadataKeys ?? null,
          f.metadataValues ?? null,
          metadataTerms,
          f.threadIds ?? null,
          f.fromAgents ?? null,
          f.timeFrom ?? null,
          f.timeTo ?? null,
          limit,
        ],
      );
      return res.rows.map(r => ({ message: toMessage(r), score: Math.max(0, r.score) }));
    } catch {
      // pgvector extension not loaded in this PGlite instance — degrade gracefully.
      return [];
    }
  }

  async neighbors(messageIds: string[], _maxDepth: number, limit: number): Promise<EdgeRow[]> {
    if (messageIds.length === 0) return [];
    const maxDepth = Math.max(1, _maxDepth);
    const visited = new Set(messageIds);
    const emittedEdges = new Set<string>();
    let frontier = [...new Set(messageIds)];
    const edges: EdgeRow[] = [];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0 && edges.length < limit; depth++) {
      const rows = await queryOneHopNeighborRows(this.db, frontier, Math.max(limit * 2, frontier.length * 4));
      const nextFrontier = new Set<string>();

      for (const row of rows) {
        const edgeKey = `${row.source_message_id}->${row.target_message_id}:${row.link_type}`;
        if (emittedEdges.has(edgeKey)) continue;
        emittedEdges.add(edgeKey);
        edges.push({
          source_message_id: row.source_message_id,
          target_message_id: row.target_message_id,
          link_type: row.link_type,
          weight: row.weight,
          depth,
          target: toMessage(row),
        } as EdgeRow);
        if (!visited.has(row.target_message_id)) {
          nextFrontier.add(row.target_message_id);
        }
        if (edges.length >= limit) break;
      }

      for (const messageId of nextFrontier) visited.add(messageId);
      frontier = [...nextFrontier];
    }

    return edges;
  }

  async decryptBodies(messageIds: string[]): Promise<Map<string, string>> {
    return this.decryptFn(messageIds);
  }

  async embed(text: string): Promise<number[]> {
    return this.embedder(text);
  }
}
