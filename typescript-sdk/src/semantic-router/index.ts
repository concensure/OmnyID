/**
 * Cascaded Lazy Semantic Router — public API.
 *
 * This module is local-first: the router runs against the ElectricSQL local
 * replica (PGlite on-device), never against the homeserver. The homeserver
 * only ever holds ciphertext; plaintext exists solely in Layer 5 within the
 * user's local process, never in network transit.
 *
 * Entry points:
 *   createRouter(store, verifier) → { core, forMasterAgent, forWatcher }
 *
 * The LocalStore interface (layers/l1-metadata.ts) is the only coupling to
 * the underlying DB. Wire it to prepared statements against the tables in
 * postgres/migrations/0069_router_index.sql.
 */

export type { RouterQuery, RouterResult, Candidate, IndexedMessage, LayerName, LedgerKind, RoutingMetadata, KnowledgeLinkContent, LinkType, ParsedQuery } from './types.js';
export type { Budget, BudgetReport } from './budget.js';
export { DEFAULT_BUDGET, BACKGROUND_BUDGET, BudgetTracker } from './budget.js';
export { parseQuery, judgeLayer, shouldRun } from './heuristics.js';
export type { LayerVerdict } from './heuristics.js';
export type { LocalStore, MetadataFilter, ScoredRow, EdgeRow } from './layers/l1-metadata.js';
export { layerMetadata } from './layers/l1-metadata.js';
export { layerLexical, layerVector, layerTopology } from './layers/l2-l4.js';
export { layerDeep } from './layers/l5-deep.js';
export { SemanticRouter } from './router.js';
export type { A2UIRenderHint, A2UIComponent } from './a2ui.js';
export { renderHint } from './a2ui.js';
export type { RetrievalGrant, GrantVerifier } from './hooks.js';
export { GrantedRouter, WatcherRouter, createRouter } from './hooks.js';
