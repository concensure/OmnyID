import type { Candidate, ParsedQuery } from '../types.js';
import type { LocalStore, MetadataFilter } from './l1-metadata.js';
import type { BudgetTracker } from '../budget.js';

function filterFrom(parsed: ParsedQuery, limit: number): MetadataFilter {
  return {
    kinds: parsed.kinds.length ? parsed.kinds : undefined,
    supertags: parsed.supertags.length ? parsed.supertags : undefined,
    referenceTargets: parsed.referenceTargets.length ? parsed.referenceTargets : undefined,
    referenceTypes: parsed.referenceTypes.length ? parsed.referenceTypes : undefined,
    linkTypes: parsed.linkTypes.length ? parsed.linkTypes : undefined,
    metadataKeys: parsed.metadataKeys.length ? parsed.metadataKeys : undefined,
    metadataValues: parsed.metadataValues.length ? parsed.metadataValues : undefined,
    threadIds: parsed.threadIds.length ? parsed.threadIds : undefined,
    fromAgents: parsed.fromAgents.length ? parsed.fromAgents : undefined,
    timeFrom: parsed.timeRange?.from,
    timeTo: parsed.timeRange?.to,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Layer 2 — Lexical / structured search over searchable_summary + entities.
// Postgres FTS (ts_rank) and trigram exact-ish matching; still no decryption.
// ---------------------------------------------------------------------------

export async function layerLexical(
  store: LocalStore,
  parsed: ParsedQuery,
  limit: number,
): Promise<Candidate[]> {
  if (!parsed.freeText) return [];
  const rows = await store.fullTextSearch(parsed.freeText, filterFrom(parsed, limit), limit);
  return rows.map(({ message, score }) => ({
    message,
    scores: { lexical: score },
    fused: score,
    provenance: [`lexical: matched "${parsed.freeText}" in summary/entities`],
  }));
}

// ---------------------------------------------------------------------------
// Layer 3 — Vector semantic search (pgvector cosine over summary embeddings).
// Costs exactly one embedding of the query text; respects the embed budget.
// ---------------------------------------------------------------------------

export async function layerVector(
  store: LocalStore,
  parsed: ParsedQuery,
  limit: number,
  budget: BudgetTracker,
): Promise<Candidate[]> {
  if (!parsed.freeText) return [];
  if (budget.reserveEmbeddings(1) < 1) return [];
  const embedding = await store.embed(parsed.freeText);
  const rows = await store.vectorSearch(embedding, filterFrom(parsed, limit), limit);
  return rows.map(({ message, score }) => ({
    message,
    scores: { vector: score },
    fused: score,
    provenance: [`vector: cosine ${score.toFixed(2)} to query`],
  }));
}

// ---------------------------------------------------------------------------
// Layer 4 — Topological neighborhood expansion along knowledge_link edges.
// Seeds = current best candidates; pulls in linked decisions, sources,
// follow-ups. Edge weight decays with depth. Index-only, no decryption.
// ---------------------------------------------------------------------------

export async function layerTopology(
  store: LocalStore,
  seeds: Candidate[],
  limit: number,
  maxDepth = 2,
): Promise<Candidate[]> {
  if (seeds.length === 0) return [];
  const seedIds = seeds.slice(0, 12).map(c => c.message.message_id);
  const seedIdSet = new Set(seedIds);
  const propagatedScore = new Map(seeds.map(c => [c.message.message_id, c.fused]));
  const edges = await store.neighbors(seedIds, maxDepth, limit * 4);

  const byTarget = new Map<string, Candidate>();
  const sortedEdges = [...edges].sort(
    (left, right) =>
      (left.depth ?? 1) - (right.depth ?? 1) ||
      right.weight - left.weight ||
      left.target.message_id.localeCompare(right.target.message_id),
  );
  for (const e of sortedEdges) {
    if (seedIdSet.has(e.target.message_id)) continue;
    const origin = propagatedScore.get(e.source_message_id) ?? 0.4;
    const score = Math.min(1, origin * e.weight * 0.9); // decay through the edge
    const existing = byTarget.get(e.target.message_id);
    if (existing && existing.fused >= score) continue;
    propagatedScore.set(e.target.message_id, score);
    byTarget.set(e.target.message_id, {
      message: e.target,
      scores: { topology: score },
      fused: score,
      provenance: [
        `topology: hop ${e.depth ?? 1} ${e.link_type} (w=${e.weight.toFixed(2)}) from ${e.source_message_id}`,
      ],
    });
  }
  return [...byTarget.values()].sort((a, b) => b.fused - a.fused).slice(0, limit);
}
