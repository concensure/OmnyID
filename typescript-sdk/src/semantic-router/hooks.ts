import type { RouterQuery, RouterResult, ParsedQuery } from './types.js';
import { SemanticRouter } from './router.js';
import { BACKGROUND_BUDGET } from './budget.js';
import type { LocalStore } from './layers/l1-metadata.js';

/**
 * Integration surface — the ONLY ways other components may call the router.
 * Pure retrieval: no agent logic leaks in, no writes to the ledger happen here.
 */

/** Capability token minted by the Master Agent from a delegated short-lived key. */
export interface RetrievalGrant {
  /** Sub-agent identity, e.g. "agent:ed25519-…@homeserver". */
  agent_id: string;
  /** Scope limits the index slice the router may touch. */
  scope: Partial<Pick<ParsedQuery, 'kinds' | 'supertags' | 'threadIds' | 'timeRange'>>;
  /** Hard ceiling regardless of what the caller asks for. */
  maxDecryptions: number;
  expires_at: string; // ISO-8601
  /** Ed25519 signature by the Master Agent over the canonical grant. */
  signature: string;
}

export interface GrantVerifier {
  verify(grant: RetrievalGrant): Promise<boolean>;
}

/**
 * Master Agent hook: every sub-agent query is clamped to its grant —
 * scope intersects with the parsed query, decryption ceiling is the
 * min of grant and request. Expired or invalid grants never reach storage.
 */
export class GrantedRouter {
  constructor(
    private readonly router: SemanticRouter,
    private readonly verifier: GrantVerifier,
  ) {}

  async route(grant: RetrievalGrant, query: RouterQuery): Promise<RouterResult> {
    if (Date.parse(grant.expires_at) < Date.now()) throw new Error('grant expired');
    if (!(await this.verifier.verify(grant))) throw new Error('grant signature invalid');

    return this.router.route({
      ...query,
      hints: {
        ...query.hints,
        // Scope clamps: grant narrows, never widens.
        kinds: intersect(query.hints?.kinds, grant.scope.kinds),
        supertags: intersect(query.hints?.supertags, grant.scope.supertags),
        threadIds: intersect(query.hints?.threadIds, grant.scope.threadIds),
        timeRange: grant.scope.timeRange ?? query.hints?.timeRange,
      },
      budget: {
        ...query.budget,
        maxDecryptions: Math.min(
          query.budget?.maxDecryptions ?? grant.maxDecryptions,
          grant.maxDecryptions,
        ),
      },
    });
  }
}

function intersect<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!b || b.length === 0) return a;
  if (!a || a.length === 0) return b;
  return a.filter(x => b.includes(x));
}

/**
 * Background Watcher hook: zero-decryption, zero-token profile.
 * The watcher uses this to find clusters worth minting knowledge_link
 * messages for — it gets candidates + scores, never plaintext.
 */
export class WatcherRouter {
  constructor(private readonly router: SemanticRouter) {}

  /** e.g. "what does this new message relate to?" */
  async relatedTo(summaryText: string, limit = 10): Promise<RouterResult> {
    return this.router.route({
      text: summaryText,
      limit,
      budget: { ...BACKGROUND_BUDGET },
    });
  }
}

/** Factory wiring everything to a concrete local store. */
export function createRouter(store: LocalStore, verifier: GrantVerifier) {
  const core = new SemanticRouter(store);
  return {
    core,
    forMasterAgent: new GrantedRouter(core, verifier),
    forWatcher: new WatcherRouter(core),
  };
}
