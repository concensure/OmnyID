import type { Candidate } from '../types.js';
import type { LocalStore } from './l1-metadata.js';
import type { BudgetTracker } from '../budget.js';

/**
 * Layer 5 - Selective Deep Retrieval. The ONLY place plaintext bodies exist.
 *
 * Rules:
 *  - Decrypt at most budget.maxDecryptions bodies, taken from the TOP of the
 *    fused ranking only.
 *  - Excerpts are clipped to fit the token budget; if the token budget is
 *    gone, we return the shortlist with summaries only (graceful fallback).
 *  - Plaintext lives in function scope; nothing is written back to any store.
 */

const APPROX_CHARS_PER_TOKEN = 4;

export async function layerDeep(
  store: LocalStore,
  shortlist: Candidate[],
  query: string,
  budget: BudgetTracker,
): Promise<Candidate[]> {
  const allowed = budget.reserveDecryptions(
    Math.min(shortlist.length, budget.budget.maxDecryptions),
  );
  if (allowed === 0) return shortlist;

  const targets = selectDeepTargets(shortlist, allowed);
  if (targets.length === 0) return shortlist;

  const bodies = await store.decryptBodies(targets.map((candidate) => candidate.message.message_id));
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const terms = [...new Set(normalizedQuery.split(/\W+/).filter((word) => word.length > 2))];

  for (const candidate of targets) {
    const body = bodies.get(candidate.message.message_id);
    if (!body) continue;

    const lower = body.toLowerCase();
    const deepScore = scoreBodyMatch(lower, normalizedQuery, terms);
    candidate.scores.deep = deepScore;
    candidate.fused = 0.55 * candidate.fused + 0.45 * deepScore;

    const excerptTokens = 120;
    if (budget.spendTokens(excerptTokens)) {
      candidate.decryptedExcerpt = excerpt(body, terms, excerptTokens * APPROX_CHARS_PER_TOKEN);
      candidate.provenance.push(
        deepEvidenceSummary(normalizedQuery, terms, lower, deepScore),
      );
    } else {
      candidate.provenance.push('deep: token budget exhausted - summary only');
    }
  }

  return [...shortlist].sort((left, right) => right.fused - left.fused);
}

function selectDeepTargets(shortlist: Candidate[], allowed: number): Candidate[] {
  const ranked = shortlist
    .map((candidate, rank) => ({ candidate, rank }))
    .filter(({ candidate }) => candidate.message.body_available);
  if (ranked.length <= allowed) {
    return ranked.map(({ candidate }) => candidate);
  }

  const headFused = shortlist[0]?.fused ?? 0;
  const priorityScore = (entry: { candidate: Candidate; rank: number }): number => {
    const rankWeight = 1 / (entry.rank + 1);
    const closenessWeight = Math.max(0, 1 - (headFused - entry.candidate.fused) * 4);
    const topologyWeight = Math.min(1, entry.candidate.scores.topology ?? 0);
    return 0.5 * rankWeight + 0.35 * closenessWeight + 0.15 * topologyWeight;
  };
  const shallowStrength = (candidate: Candidate): number =>
    Math.max(
      candidate.scores.metadata ?? 0,
      candidate.scores.lexical ?? 0,
      candidate.scores.vector ?? 0,
    );
  const isAmbiguous = (candidate: Candidate): boolean =>
    shallowStrength(candidate) < 0.88 || (candidate.scores.topology ?? 0) > 0;

  const ambiguous = ranked
    .filter(({ candidate }) => isAmbiguous(candidate))
    .sort((left, right) => priorityScore(right) - priorityScore(left));
  const decisive = ranked
    .filter(({ candidate }) => !isAmbiguous(candidate))
    .sort((left, right) => priorityScore(right) - priorityScore(left));

  return [...ambiguous, ...decisive].slice(0, allowed).map(({ candidate }) => candidate);
}

function scoreBodyMatch(lowerBody: string, normalizedQuery: string, terms: string[]): number {
  if (terms.length === 0) return 0.5;
  const coverageHits = terms.filter((term) => lowerBody.includes(term)).length;
  const coverage = coverageHits / terms.length;
  const termFrequency = terms.reduce(
    (sum, term) => sum + boundedOccurrenceCount(lowerBody, term),
    0,
  );
  const normalizedFrequency = Math.min(1, termFrequency / Math.max(terms.length * 2, 1));
  const exactPhraseBoost =
    normalizedQuery.length >= 5 && lowerBody.includes(normalizedQuery) ? 0.2 : 0;
  return Math.max(
    0,
    Math.min(1, 0.55 * coverage + 0.35 * normalizedFrequency + exactPhraseBoost),
  );
}

function boundedOccurrenceCount(body: string, term: string): number {
  let total = 0;
  let at = 0;
  while (at < body.length) {
    const next = body.indexOf(term, at);
    if (next < 0) break;
    total += 1;
    if (total >= 3) return 3;
    at = next + term.length;
  }
  return total;
}

function deepEvidenceSummary(
  normalizedQuery: string,
  terms: string[],
  lowerBody: string,
  deepScore: number,
): string {
  const matchedTerms = terms.filter((term) => lowerBody.includes(term));
  const phraseMatched = normalizedQuery.length >= 5 && lowerBody.includes(normalizedQuery);
  if (phraseMatched) {
    return `deep: body decrypted locally; exact phrase evidence found (${deepScore.toFixed(2)})`;
  }
  if (matchedTerms.length > 0) {
    return `deep: body decrypted locally; matched ${matchedTerms.length}/${terms.length} query terms (${deepScore.toFixed(2)})`;
  }
  return `deep: body decrypted locally for final ranking (${deepScore.toFixed(2)})`;
}

function excerpt(body: string, terms: string[], maxChars: number): string {
  if (terms.length === 0) {
    const slice = body.slice(0, maxChars).trim();
    return slice + (slice.length < body.length ? '...' : '');
  }
  const lower = body.toLowerCase();
  const windowSize = Math.max(maxChars, 180);
  let bestStart = 0;
  let bestScore = -1;

  for (const term of terms) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const at = lower.indexOf(term, searchFrom);
      if (at < 0) break;
      const start = Math.max(0, at - Math.floor(windowSize / 3));
      const window = lower.slice(start, start + windowSize);
      const score = terms.reduce(
        (sum, queryTerm) => sum + boundedOccurrenceCount(window, queryTerm),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
      searchFrom = at + term.length;
    }
  }

  const start = Math.max(0, bestStart);
  const slice = body.slice(start, start + maxChars).trim();
  return (start > 0 ? '...' : '') + slice + (start + maxChars < body.length ? '...' : '');
}
