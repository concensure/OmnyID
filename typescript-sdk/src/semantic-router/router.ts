import type { Candidate, LayerName, RouterQuery, RouterResult } from './types.js';
import { BudgetTracker } from './budget.js';
import { judgeLayer, parseQuery, shouldRun } from './heuristics.js';
import { layerMetadata, type LocalStore } from './layers/l1-metadata.js';
import { layerLexical, layerTopology, layerVector } from './layers/l2-l4.js';
import { layerDeep } from './layers/l5-deep.js';
import { renderHint } from './a2ui.js';

/**
 * Cascaded Lazy Semantic Router.
 *
 * Invariants enforced here:
 *  - Layers run strictly in order L1→L5; each may be SKIPPED (shouldRun)
 *    and the cascade STOPS at the first layer whose verdict satisfies.
 *  - L5 is the only layer that decrypts, and only the fused-top shortlist.
 *  - Budget is checked between every layer; exhaustion → graceful return
 *    of best-so-far with the budget report attached.
 *  - Every returned candidate carries provenance back to signed ledger ids.
 */
export class SemanticRouter {
  constructor(private readonly store: LocalStore) {}

  async route(query: RouterQuery): Promise<RouterResult> {
    const budget = new BudgetTracker(query.budget);
    const limit = query.limit ?? 10;
    const parsed = parseQuery(query.text, query.hints);

    let working: Candidate[] = [];
    let terminalLayer: LayerName = 'metadata';
    let confidence = 0;

    const cascade: { name: LayerName; run: () => Promise<Candidate[]> }[] = [
      { name: 'metadata', run: () => layerMetadata(this.store, parsed, budget.budget.maxWorkingSet) },
      { name: 'lexical', run: () => layerLexical(this.store, parsed, budget.budget.maxWorkingSet) },
      { name: 'vector', run: () => layerVector(this.store, parsed, budget.budget.maxWorkingSet, budget) },
      { name: 'topology', run: () => layerTopology(this.store, working, limit * 2) },
      { name: 'deep', run: () => layerDeep(this.store, working.slice(0, limit * 2), parsed.freeText || query.text, budget) },
    ];

    for (const layer of cascade) {
      if (!budget.latencyOk) break;                      // budget wall
      if (!shouldRun(layer.name, parsed, working)) continue; // lazy skip

      const produced = await layer.run();
      terminalLayer = layer.name;
      working = layer.name === 'deep' ? produced : fuse(working, produced, budget.budget.maxWorkingSet);

      const verdict = judgeLayer(layer.name, working, parsed, limit);
      confidence = Math.max(confidence, verdict.confidence);
      if (verdict.satisfied) break;                      // lazy stop
    }

    const final = working.slice(0, limit);
    return {
      candidates: final,
      terminalLayer,
      confidence,
      budget: budget.report(),
      a2ui: renderHint(final, terminalLayer, confidence, parsed),
      sources: final.map(c => ({
        message_id: c.message.message_id,
        signature_present: true, // every ledger row is signed by construction
      })),
    };
  }
}

/**
 * Reciprocal Rank Fusion across layers — robust to incomparable score
 * scales, cheap, and order-stable. k=60 is the standard RRF constant.
 */
function fuse(a: Candidate[], b: Candidate[], cap: number): Candidate[] {
  const K = 60;
  const merged = new Map<string, Candidate>();

  const absorb = (list: Candidate[]) => {
    list.forEach((c, rank) => {
      const rrf = 1 / (K + rank + 1);
      const prev = merged.get(c.message.message_id);
      if (prev) {
        prev.fused += rrf;
        Object.assign(prev.scores, c.scores);
        prev.provenance.push(...c.provenance.filter(p => !prev.provenance.includes(p)));
        if (c.decryptedExcerpt) prev.decryptedExcerpt = c.decryptedExcerpt;
      } else {
        merged.set(c.message.message_id, { ...c, fused: rrf, provenance: [...c.provenance] });
      }
    });
  };

  absorb(a);
  absorb(b);

  return [...merged.values()]
    .map((candidate) => applyFusionBonuses(candidate))
    .sort(compareCandidates)
    .slice(0, cap);
}

function applyFusionBonuses(candidate: Candidate): Candidate {
  const corroborationCount = Object.keys(candidate.scores).length;
  const corroborationBonus = Math.min(0.03, Math.max(0, corroborationCount - 1) * 0.015);
  const salienceBonus = Math.min(0.025, Math.max(0, candidate.message.salience ?? 0) * 0.025);
  const recencyBonus = recencyFusionBonus(candidate.message.timestamp);
  return {
    ...candidate,
    fused: candidate.fused + corroborationBonus + salienceBonus + recencyBonus,
  };
}

function recencyFusionBonus(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 0;
  const ageDays = Math.max(0, (Date.now() - parsed) / 86_400_000);
  const recency = Math.exp(-ageDays / 45);
  return Math.min(0.02, recency * 0.02);
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    right.fused - left.fused ||
    (right.message.salience ?? 0) - (left.message.salience ?? 0) ||
    right.message.timestamp.localeCompare(left.message.timestamp) ||
    left.message.message_id.localeCompare(right.message.message_id)
  );
}
