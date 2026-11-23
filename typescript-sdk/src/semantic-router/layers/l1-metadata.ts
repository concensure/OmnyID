import type { Candidate, IndexedMessage, ParsedQuery } from '../types.js';

/**
 * Storage abstraction over the LOCAL replica (ElectricSQL-synced
 * PGlite/Postgres). The router never talks to the homeserver.
 * Implementations bind these to prepared statements against the
 * tables in sql/002_router_indexes.sql.
 */
export interface LocalStore {
  queryMetadata(filter: MetadataFilter): Promise<IndexedMessage[]>;
  fullTextSearch(text: string, filter: MetadataFilter, limit: number): Promise<ScoredRow[]>;
  vectorSearch(embedding: number[], filter: MetadataFilter, limit: number): Promise<ScoredRow[]>;
  /** Outbound + inbound knowledge_link edges for a set of message ids. */
  neighbors(messageIds: string[], maxDepth: number, limit: number): Promise<EdgeRow[]>;
  /** Fetch + decrypt bodies with the user's local key. The ONLY decrypting call. */
  decryptBodies(messageIds: string[]): Promise<Map<string, string>>;
  /** Embed query text locally (e.g. on-device MiniLM via ONNX). */
  embed(text: string): Promise<number[]>;
}

export interface MetadataFilter {
  kinds?: string[];
  supertags?: string[];
  referenceTargets?: string[];
  referenceTypes?: string[];
  linkTypes?: string[];
  metadataKeys?: string[];
  metadataValues?: string[];
  metadataTerms?: string[];
  threadIds?: string[];
  fromAgents?: string[];
  timeFrom?: string;
  timeTo?: string;
  limit: number;
}

export interface ScoredRow {
  message: IndexedMessage;
  score: number; // normalized 0–1 by the store
}

export interface EdgeRow {
  source_message_id: string;
  target_message_id: string;
  link_type: string;
  weight: number;
  depth?: number;
  target: IndexedMessage;
}

// ---------------------------------------------------------------------------
// Layer 1 — Metadata Filter. Zero decryption, zero embeddings, index-only.
// ---------------------------------------------------------------------------

export async function layerMetadata(
  store: LocalStore,
  parsed: ParsedQuery,
  limit: number,
): Promise<Candidate[]> {
  const rows = await store.queryMetadata({
    kinds: parsed.kinds.length ? parsed.kinds : undefined,
    supertags: parsed.supertags.length ? parsed.supertags : undefined,
    metadataKeys: parsed.metadataKeys.length ? parsed.metadataKeys : undefined,
    metadataValues: parsed.metadataValues.length ? parsed.metadataValues : undefined,
    metadataTerms: parsed.metadataTerms.length ? parsed.metadataTerms : undefined,
    referenceTargets: parsed.referenceTargets.length ? parsed.referenceTargets : undefined,
    referenceTypes: parsed.referenceTypes.length ? parsed.referenceTypes : undefined,
    linkTypes: parsed.linkTypes.length ? parsed.linkTypes : undefined,
    threadIds: parsed.threadIds.length ? parsed.threadIds : undefined,
    fromAgents: parsed.fromAgents.length ? parsed.fromAgents : undefined,
    timeFrom: parsed.timeRange?.from,
    timeTo: parsed.timeRange?.to,
    limit,
  });

  // Score: recency × salience — explainable and cheap.
  const now = Date.now();
  return rows.map(message => {
    const ageDays = Math.max(0, (now - Date.parse(message.timestamp)) / 86_400_000);
    const recency = Math.exp(-ageDays / 90); // half-life ~2 months
    const actionBonus = suggestedActionAlignmentBonus(message, parsed);
    const facetBonus = metadataFacetAlignmentBonus(message, parsed);
    const score = 0.6 * recency + 0.4 * (message.salience ?? 0.5) + actionBonus + facetBonus;
    return {
      message,
      scores: { metadata: score },
      fused: score,
      provenance: [describeMatch(message, parsed)],
    } satisfies Candidate;
  });
}

function describeMatch(m: IndexedMessage, p: ParsedQuery): string {
  const parts: string[] = [];
  if (p.kinds.includes(m.kind)) parts.push(`kind=${m.kind}`);
  const tagHit = m.supertags.find(t => p.supertags.some(q => t === q || t.startsWith(q + '/')));
  if (tagHit) parts.push(`#${tagHit}`);
  if (p.referenceTargets.some(target => m.referenceTargets.includes(target))) {
    parts.push('reference target match');
  }
  if (p.referenceTypes.some(type => m.referenceTypes.includes(type))) {
    parts.push('reference type match');
  }
  if (p.linkTypes.some(type => m.linkTypes.includes(type))) {
    parts.push('link type match');
  }
  if (suggestedActionAlignmentBonus(m, p) > 0) {
    parts.push('suggested action match');
  }
  if (memorySpaceAlignmentBonus(m, p) > 0) {
    parts.push('memory space match');
  }
  if (authorshipAlignmentBonus(m, p) > 0) {
    parts.push('authorship match');
  }
  if (p.metadataKeys.length || p.metadataValues.length) parts.push('metadata facet match');
  if (p.timeRange) parts.push('in time range');
  return parts.length ? `metadata: ${parts.join(', ')}` : 'metadata: recency';
}

function suggestedActionAlignmentBonus(message: IndexedMessage, parsed: ParsedQuery): number {
  if (!parsed.metadataKeys.includes('metadata.searchable_metadata.suggested_actions')) return 0;
  const actions = extractSuggestedActions(message.searchable_metadata?.suggested_actions);
  if (actions.length === 0) return 0;
  const queryTerms = new Set(
    parsed.metadataValues
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (queryTerms.size === 0) return 0;
  for (const action of actions) {
    const normalizedAction = action.trim().toLowerCase();
    if (!normalizedAction) continue;
    if (queryTerms.has(normalizedAction)) return 0.08;
    const tokens = normalizedAction.split(/[^\w]+/).filter(Boolean);
    if (tokens.some(token => queryTerms.has(token))) return 0.05;
  }
  return 0;
}

function metadataFacetAlignmentBonus(message: IndexedMessage, parsed: ParsedQuery): number {
  return Math.min(0.08, memorySpaceAlignmentBonus(message, parsed) + authorshipAlignmentBonus(message, parsed));
}

function memorySpaceAlignmentBonus(message: IndexedMessage, parsed: ParsedQuery): number {
  if (!parsed.metadataKeys.includes('metadata.searchable_metadata.memory_space')) return 0;
  const memorySpace = extractScalarFacet(message.searchable_metadata?.memory_space);
  if (!memorySpace) return 0;
  return parsed.metadataValues.some(value => value.trim().toLowerCase() === memorySpace) ? 0.04 : 0;
}

function authorshipAlignmentBonus(message: IndexedMessage, parsed: ParsedQuery): number {
  const bonuses: number[] = [];
  if (parsed.metadataKeys.includes('metadata.searchable_metadata.author_type')) {
    const authorType = extractScalarFacet(message.searchable_metadata?.author_type);
    if (
      authorType &&
      parsed.metadataValues.some(value => value.trim().toLowerCase() === authorType)
    ) {
      bonuses.push(0.03);
    }
  }
  if (parsed.metadataKeys.includes('metadata.searchable_metadata.author_id')) {
    const authorId = extractScalarFacet(message.searchable_metadata?.author_id);
    if (
      authorId &&
      parsed.metadataValues.some(value => value.trim().toLowerCase() === authorId)
    ) {
      bonuses.push(0.03);
    }
  }
  if (parsed.metadataKeys.includes('metadata.searchable_metadata.author_mask')) {
    const authorMask = extractScalarFacet(message.searchable_metadata?.author_mask);
    if (
      authorMask &&
      parsed.metadataValues.some(value => value.trim().toLowerCase() === authorMask)
    ) {
      bonuses.push(0.02);
    }
  }
  return bonuses.reduce((sum, bonus) => sum + bonus, 0);
}

function extractScalarFacet(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function extractSuggestedActions(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}
