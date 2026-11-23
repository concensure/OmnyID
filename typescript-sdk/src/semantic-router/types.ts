/**
 * AFP v1 extensions for the Cascaded Lazy Semantic Router.
 *
 * Nothing here changes the wire protocol (proto/afp.proto is untouched).
 * All additions live inside existing free-form fields:
 *   - `metadata` (JSON field) gains routing keys via RoutingMetadata
 *   - `type: "knowledge_link"` and `type: "relation_link"` are AFP message
 *     types already defined in the OmnyID AFP contract (index.ts)
 *
 * Privacy model:
 *   - The homeserver stores ciphertext + minimal envelope metadata only.
 *   - Everything indexable below exists ONLY in the local replica
 *     (ElectricSQL → PGlite/Postgres on-device), derived after local
 *     decryption with the user's own key. Derived index tables are
 *     local-only and never sync back to the homeserver.
 */

// ---------------------------------------------------------------------------
// Ledger routing metadata (written inside Message.metadata by the producing agent)
// ---------------------------------------------------------------------------

/** Coarse AFP kind written at message-creation time. Drives L1 metadata filter. */
export type LedgerKind =
  | 'note'
  | 'decision'
  | 'communication'
  | 'task'
  | 'project'
  | 'observation'
  | 'resource'
  | 'relationship'
  | 'meeting'
  | 'document'
  | 'database_view'
  | 'chat_thread'
  | 'rich_note'
  | 'research'
  | 'event'
  | 'telemetry'
  | 'knowledge_link'
  | (string & {});

export interface RoutingMetadata {
  /** Coarse kind — the single highest-value L1 filter. */
  kind: LedgerKind;
  /** Free hierarchical tags, e.g. "trip/japan", "supplier/acme", "health". */
  supertags: string[];
  /**
   * One- or two-sentence plaintext summary written by the producing agent
   * BEFORE encryption, stored only in the local index (never on the homeserver).
   * Powers L2 full-text and L3 embeddings without decrypting the body.
   */
  searchable_summary?: string;
  /** Structured metadata exposed to local index for faceted retrieval. */
  searchable_metadata?: Record<string, unknown>;
  /** Named entities the producing agent chose to expose to the local index. */
  entities?: string[];
  /** ISO-8601; defaults to message timestamp when absent. */
  occurred_at?: string;
  /** Importance hint 0–1 set at append time; boosts ranking. */
  salience?: number;
}

// ---------------------------------------------------------------------------
// knowledge_link content shape (AFP type already defined in protocol constants)
// ---------------------------------------------------------------------------

export type LinkType =
  | 'derived_from'   // summary → sources
  | 'decision_about' // decision → subject messages
  | 'follows_up'     // temporal/causal chain
  | 'same_topic'     // clustering edge from Background Watcher
  | 'contradicts'
  | 'supersedes';

/** Content of an AFP message with type === "knowledge_link" or "relation_link". */
export interface KnowledgeLinkContent {
  link_type: LinkType;
  source_message_id: string;
  target_message_id: string;
  /** 0–1 edge confidence assigned by whoever minted the link. */
  weight: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// Local index row (router's working representation; never leaves device)
// ---------------------------------------------------------------------------

export interface IndexedMessage {
  message_id: string;
  thread_id: string;
  from_agent: string;
  timestamp: string;
  type: string;
  subtype?: string;
  kind: LedgerKind;
  supertags: string[];
  referenceTargets: string[];
  referenceTypes: string[];
  linkTypes: string[];
  entities: string[];
  searchable_summary: string | null;
  searchable_metadata?: Record<string, unknown>;
  salience: number;
  /** Whether the encrypted body is present in the local replica. */
  body_available: boolean;
}

// ---------------------------------------------------------------------------
// Router I/O
// ---------------------------------------------------------------------------

export type LayerName = 'metadata' | 'lexical' | 'vector' | 'topology' | 'deep';

export interface RouterQuery {
  text: string;
  /** Structured hints a caller (e.g. Master Agent) can pass to skip parsing. */
  hints?: Partial<ParsedQuery>;
  budget?: Partial<import('./budget.js').Budget>;
  /** Max results in the final set. */
  limit?: number;
}

export interface ParsedQuery {
  kinds: LedgerKind[];
  supertags: string[];
  referenceTargets: string[];
  referenceTypes: string[];
  linkTypes: string[];
  entities: string[];
  metadataKeys: string[];
  metadataValues: string[];
  metadataTerms: string[];
  timeRange?: { from?: string; to?: string };
  threadIds: string[];
  fromAgents: string[];
  /** Terms left over after structured extraction; drives L2/L3. */
  freeText: string;
  /** True when the query is purely structured ("everything tagged #japan"). */
  isStructuredOnly: boolean;
}

export interface Candidate {
  message: IndexedMessage;
  /** Per-layer scores, normalised 0–1. */
  scores: Partial<Record<LayerName, number>>;
  /** Fused score after Reciprocal Rank Fusion. */
  fused: number;
  /** Why this candidate is here — feeds A2UI provenance. */
  provenance: string[];
  /** Filled only by L5 for the shortlist. */
  decryptedExcerpt?: string;
}

export interface RouterResult {
  candidates: Candidate[];
  /** Highest layer that actually ran. */
  terminalLayer: LayerName;
  confidence: number;
  budget: import('./budget.js').BudgetReport;
  a2ui: import('./a2ui.js').A2UIRenderHint;
  /** Every claim traceable to a signed ledger message. */
  sources: { message_id: string; signature_present: boolean }[];
}
