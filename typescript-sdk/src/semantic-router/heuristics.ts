import type { Candidate, LedgerKind, ParsedQuery, LayerName } from './types.js';

/**
 * Cheap structured query understanding. No LLM, no embeddings — pure
 * lexical/rule-based parsing that runs in microseconds. The point is to
 * extract enough stable structure that Layer 1 alone answers most everyday
 * queries, while staying aligned with the broader state-monitoring model.
 */

const KIND_TRIGGERS: Record<string, LedgerKind> = {
  note: 'note', notes: 'note',
  decision: 'decision', decisions: 'decision', decided: 'decision',
  email: 'communication', emails: 'communication', message: 'communication',
  messages: 'communication', communication: 'communication',
  communications: 'communication', chat: 'communication',
  task: 'task', tasks: 'task', todo: 'task',
  project: 'project', projects: 'project',
  relationship: 'relationship', relationships: 'relationship', people: 'relationship',
  person: 'relationship',
  research: 'research',
  resource: 'resource', resources: 'resource',
  observation: 'observation', observations: 'observation',
  document: 'document', documents: 'document', file: 'document', files: 'document',
  event: 'event', events: 'event', meeting: 'meeting', meetings: 'meeting',
  health: 'telemetry', vitals: 'telemetry',
};

const RELATIVE_TIME: [RegExp, (now: Date) => { from: Date; to?: Date }][] = [
  [/last\s+month/i, n => ({ from: shift(n, -30), to: n })],
  [/this\s+month/i, n => ({ from: startOfMonth(n) })],
  [/last\s+week/i, n => ({ from: shift(n, -7), to: n })],
  [/this\s+week/i, n => ({ from: shift(n, -new Date(n).getDay()) })],
  [/yesterday/i, n => ({ from: shift(n, -1), to: n })],
  [/today/i, n => ({ from: shift(n, 0) })],
  [/recent(ly)?/i, n => ({ from: shift(n, -14), to: n })],
  [/last\s+(\d+)\s+days?/i, n => ({ from: shift(n, -30), to: n })], // refined below
];

function shift(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  out.setHours(0, 0, 0, 0);
  return out;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const STOPWORDS = new Set([
  'find', 'show', 'my', 'me', 'the', 'a', 'an', 'all', 'any', 'of', 'for',
  'from', 'in', 'on', 'about', 'related', 'to', 'and', 'or', 'with', 'last',
  'this', 'recent', 'recently', 'month', 'week', 'yesterday', 'today', 'days',
  'please', 'what', 'where', 'when', 'list', 'get',
]);

const RESERVED_METADATA_KEYS = new Set([
  'kind',
  'thread',
  'thread_id',
  'from',
  'agent',
  'sender',
  'target',
  'ref',
  'reference',
  'reftype',
  'reference_type',
  'link',
  'linktype',
  'relation',
  'after',
  'before',
  'on',
  'since',
  'until',
  'action',
  'next',
  'suggested_action',
  'suggested_actions',
  'status',
  'priority',
  'domain',
  'followup',
  'follow_up',
  'follow_up_at',
  'memory',
  'space',
  'memory_space',
  'author',
  'author_type',
  'author_id',
  'mask',
  'author_mask',
]);

function isoStartOfDay(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  return new Date(`${normalized}T00:00:00.000Z`).toISOString();
}

function isoEndOfDay(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  return new Date(`${normalized}T23:59:59.999Z`).toISOString();
}

function consumeStructuredValue(set: Set<string>, value: string): void {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  set.add(normalized);
  for (const token of normalized.split(/[^\w#]+/).filter(Boolean)) {
    set.add(token);
  }
}

function extractMetadataTerms(text: string): {
  metadataKeys: string[];
  metadataValues: string[];
  metadataTerms: string[];
} {
  const metadataKeys = new Set<string>();
  const metadataValues = new Set<string>();
  const metadataTerms = new Set<string>();
  for (const match of text.matchAll(/\b([a-zA-Z][\w.-]*)\s*:\s*([#\w./-]+)\b/g)) {
    const key = match[1]?.toLowerCase();
    const value = match[2]?.toLowerCase();
    if (key && value && ['action', 'next', 'suggested_action', 'suggested_actions'].includes(key)) {
      metadataKeys.add('metadata.searchable_metadata.suggested_actions');
      metadataValues.add(value);
      metadataTerms.add(`suggested_actions:${value}`);
      continue;
    }
    if (key && value && key === 'status') {
      metadataKeys.add('metadata.searchable_metadata.status');
      metadataValues.add(value);
      metadataTerms.add(`status:${value}`);
      continue;
    }
    if (key && value && key === 'priority') {
      metadataKeys.add('metadata.searchable_metadata.priority');
      metadataValues.add(value);
      metadataTerms.add(`priority:${value}`);
      continue;
    }
    if (key && value && key === 'domain') {
      metadataKeys.add('metadata.searchable_metadata.domain');
      metadataValues.add(value);
      metadataTerms.add(`domain:${value}`);
      continue;
    }
    if (key && value && ['followup', 'follow_up', 'follow_up_at'].includes(key)) {
      metadataKeys.add('metadata.searchable_metadata.follow_up_at');
      metadataValues.add(value);
      metadataTerms.add(`follow_up_at:${value}`);
      continue;
    }
    if (key && value && ['memory', 'space', 'memory_space'].includes(key)) {
      metadataKeys.add('metadata.searchable_metadata.memory_space');
      metadataValues.add(value);
      metadataTerms.add(`memory_space:${value}`);
      continue;
    }
    if (key && value && ['author', 'author_type'].includes(key)) {
      metadataKeys.add('metadata.searchable_metadata.author_type');
      metadataValues.add(value);
      metadataTerms.add(`author_type:${value}`);
      continue;
    }
    if (key && value && key === 'author_id') {
      metadataKeys.add('metadata.searchable_metadata.author_id');
      metadataValues.add(value);
      metadataTerms.add(`author_id:${value}`);
      continue;
    }
    if (key && value && ['mask', 'author_mask'].includes(key)) {
      metadataKeys.add('metadata.searchable_metadata.author_mask');
      metadataValues.add(value);
      metadataTerms.add(`author_mask:${value}`);
      continue;
    }
    if (!key || RESERVED_METADATA_KEYS.has(key)) continue;
    if (key) metadataKeys.add(key);
    if (value) metadataValues.add(value);
    metadataTerms.add(`${key}:${value}`);
  }
  return {
    metadataKeys: [...metadataKeys],
    metadataValues: [...metadataValues],
    metadataTerms: [...metadataTerms],
  };
}

function extractReferenceTerms(text: string): {
  referenceTargets: string[];
  referenceTypes: string[];
  linkTypes: string[];
} {
  const referenceTargets = new Set<string>();
  const referenceTypes = new Set<string>();
  const linkTypes = new Set<string>();
  for (const match of text.matchAll(/\b(?:target|ref|reference)\s*:\s*([#\w./:-]+)\b/gi)) {
    const value = match[1]?.trim();
    if (value) referenceTargets.add(value);
  }
  for (const match of text.matchAll(/\b(?:reftype|reference_type)\s*:\s*([#\w./-]+)\b/gi)) {
    const value = match[1]?.toLowerCase().trim();
    if (value) referenceTypes.add(value);
  }
  for (const match of text.matchAll(/\b(?:link|linktype|relation)\s*:\s*([#\w./-]+)\b/gi)) {
    const value = match[1]?.toLowerCase().trim();
    if (value) linkTypes.add(value);
  }
  return {
    referenceTargets: [...referenceTargets],
    referenceTypes: [...referenceTypes],
    linkTypes: [...linkTypes],
  };
}

function extractThreadIds(text: string): string[] {
  const threadIds = new Set<string>();
  for (const match of text.matchAll(/\b(?:thread|thread_id)\s*:\s*([#\w./:-]+)\b/gi)) {
    const value = match[1]?.trim();
    if (value) threadIds.add(value);
  }
  return [...threadIds];
}

function extractFromAgents(text: string): string[] {
  const fromAgents = new Set<string>();
  for (const match of text.matchAll(/\b(?:from|agent|sender)\s*:\s*([#\w./:-]+)\b/gi)) {
    const value = match[1]?.trim();
    if (value) fromAgents.add(value);
  }
  return [...fromAgents];
}

function extractExplicitKinds(text: string): LedgerKind[] {
  const kinds = new Set<LedgerKind>();
  for (const match of text.matchAll(/\bkind\s*:\s*([#\w./-]+)\b/gi)) {
    const rawValue = match[1]?.toLowerCase().trim();
    if (!rawValue) continue;
    kinds.add(rawValue as LedgerKind);
  }
  return [...kinds];
}

function extractExplicitTimeRange(
  text: string,
): { from?: string; to?: string } | undefined {
  const onMatch = text.match(/\bon\s*:\s*(\d{4}-\d{2}-\d{2})\b/i);
  if (onMatch?.[1]) {
    const from = isoStartOfDay(onMatch[1]);
    const to = isoEndOfDay(onMatch[1]);
    if (from && to) return { from, to };
  }

  const from =
    text.match(/\b(?:after|since)\s*:\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? null;
  const to =
    text.match(/\b(?:before|until)\s*:\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? null;
  const normalizedFrom = from ? isoStartOfDay(from) : null;
  const normalizedTo = to ? isoEndOfDay(to) : null;
  if (!normalizedFrom && !normalizedTo) return undefined;
  return {
    ...(normalizedFrom ? { from: normalizedFrom } : {}),
    ...(normalizedTo ? { to: normalizedTo } : {}),
  };
}

export function parseQuery(text: string, hints?: Partial<ParsedQuery>): ParsedQuery {
  const now = new Date();
  const kinds = new Set<LedgerKind>(hints?.kinds ?? []);
  const supertags = new Set<string>(hints?.supertags ?? []);
  const referenceTargets = new Set<string>(hints?.referenceTargets ?? []);
  const referenceTypes = new Set<string>(hints?.referenceTypes ?? []);
  const linkTypes = new Set<string>(hints?.linkTypes ?? []);
  const metadataKeys = new Set<string>(hints?.metadataKeys ?? []);
  const metadataValues = new Set<string>(hints?.metadataValues ?? []);
  const exactMetadataTerms = new Set<string>(hints?.metadataTerms ?? []);
  let timeRange = hints?.timeRange;
  const threadIds = new Set<string>(hints?.threadIds ?? []);
  const fromAgents = new Set<string>(hints?.fromAgents ?? []);
  const consumedTerms = new Set<string>();

  // explicit #tags
  for (const m of text.matchAll(/#([\w/_-]+)/g)) if (m[1]) supertags.add(m[1].toLowerCase());

  for (const explicitKind of extractExplicitKinds(text)) {
    kinds.add(explicitKind);
    consumeStructuredValue(consumedTerms, String(explicitKind));
  }
  for (const threadId of extractThreadIds(text)) {
    threadIds.add(threadId);
    consumeStructuredValue(consumedTerms, threadId);
  }
  for (const fromAgent of extractFromAgents(text)) {
    fromAgents.add(fromAgent);
    consumeStructuredValue(consumedTerms, fromAgent);
  }

  // kind triggers
  const words = text.toLowerCase().split(/[^\w#/]+/).filter(Boolean);
  for (const w of words) {
    const k = KIND_TRIGGERS[w];
    if (k) kinds.add(k);
  }

  const parsedMetadataTerms = extractMetadataTerms(text);
  for (const key of parsedMetadataTerms.metadataKeys) metadataKeys.add(key);
  for (const value of parsedMetadataTerms.metadataValues) {
    metadataValues.add(value);
    consumeStructuredValue(consumedTerms, value);
  }
  for (const term of parsedMetadataTerms.metadataTerms) exactMetadataTerms.add(term);
  const referenceTerms = extractReferenceTerms(text);
  for (const value of referenceTerms.referenceTargets) {
    referenceTargets.add(value);
    consumeStructuredValue(consumedTerms, value);
  }
  for (const value of referenceTerms.referenceTypes) {
    referenceTypes.add(value);
    consumeStructuredValue(consumedTerms, value);
  }
  for (const value of referenceTerms.linkTypes) {
    linkTypes.add(value);
    consumeStructuredValue(consumedTerms, value);
  }

  // relative time
  if (!timeRange) {
    const explicitTimeRange = extractExplicitTimeRange(text);
    if (explicitTimeRange) {
      timeRange = explicitTimeRange;
    } else {
      const lastN = text.match(/last\s+(\d+)\s+days?/i);
      if (lastN) {
        timeRange = { from: shift(now, -Number(lastN[1])).toISOString(), to: now.toISOString() };
      } else {
        for (const [re, fn] of RELATIVE_TIME) {
          if (re.test(text)) {
            const r = fn(now);
            timeRange = { from: r.from.toISOString(), to: r.to?.toISOString() };
            break;
          }
        }
      }
    }
  }

  // residual free text = candidate entities / topics for L2+L3
  const residual = words.filter(
    w =>
      !STOPWORDS.has(w) &&
      !RESERVED_METADATA_KEYS.has(w) &&
      !KIND_TRIGGERS[w] &&
      !w.startsWith('#') &&
      !w.includes(':') &&
      !/^\d+$/.test(w) &&
      !consumedTerms.has(w),
  );
  const freeText = residual.join(' ');

  return {
    kinds: [...kinds],
    supertags: [...supertags],
    referenceTargets: [...referenceTargets],
    referenceTypes: [...referenceTypes],
    linkTypes: [...linkTypes],
    entities: hints?.entities ?? residual,
    metadataKeys: [...metadataKeys],
    metadataValues: [...metadataValues],
    metadataTerms: [...exactMetadataTerms],
    timeRange,
    threadIds: [...threadIds],
    fromAgents: [...fromAgents],
    freeText,
    isStructuredOnly:
      freeText.length === 0 &&
      (kinds.size > 0 ||
        supertags.size > 0 ||
        referenceTargets.size > 0 ||
        referenceTypes.size > 0 ||
        linkTypes.size > 0 ||
        metadataKeys.size > 0 ||
        metadataValues.size > 0 ||
        threadIds.size > 0 ||
        fromAgents.size > 0 ||
        Boolean(timeRange)),
  };
}

// ---------------------------------------------------------------------------
// Escalation rules — the heart of "lazy"
// ---------------------------------------------------------------------------

export interface LayerVerdict {
  satisfied: boolean;
  confidence: number; // 0–1
  reason: string;
}

/**
 * Confidence model per layer (cheap, explainable — no learned model):
 *  - coverage: do we have >= min results?
 *  - separation: is there a clear score gap between head and tail?
 *  - specificity: did the query give us structure that L1/L2 could fully honor?
 */
export function judgeLayer(
  layer: LayerName,
  candidates: Candidate[],
  parsed: ParsedQuery,
  wanted: number,
): LayerVerdict {
  if (candidates.length === 0) {
    return { satisfied: false, confidence: 0, reason: 'no candidates' };
  }

  const coverage = Math.min(1, candidates.length / wanted);
  const head = candidates[0]?.fused ?? 0;
  const tail = candidates[Math.min(candidates.length - 1, wanted * 2)]?.fused ?? 0;
  const separation = head === 0 ? 0 : Math.min(1, (head - tail) / head + 0.3);

  switch (layer) {
    case 'metadata': {
      // L1 fully answers structured-only queries; otherwise it only pre-filters.
      if (parsed.isStructuredOnly) {
        const conf = 0.55 + 0.45 * coverage;
        return {
          satisfied: coverage >= 0.6,
          confidence: conf,
          reason: `structured-only query, coverage=${coverage.toFixed(2)}`,
        };
      }
      return { satisfied: false, confidence: 0.3 * coverage, reason: 'free text present → escalate' };
    }
    case 'lexical': {
      // Exact/FTS hits on summaries are trustworthy when separation is high.
      const conf = 0.4 * coverage + 0.5 * separation;
      return {
        satisfied: conf >= 0.65 && candidates.length >= Math.min(wanted, 3),
        confidence: conf,
        reason: `fts coverage=${coverage.toFixed(2)} separation=${separation.toFixed(2)}`,
      };
    }
    case 'vector': {
      const conf = 0.35 * coverage + 0.55 * separation;
      return {
        satisfied: conf >= 0.6,
        confidence: conf,
        reason: `cosine separation=${separation.toFixed(2)}`,
      };
    }
    case 'topology': {
      // Expansion never satisfies alone; it enriches the set for L5 or final return.
      const conf = 0.5 * coverage + 0.3 * separation;
      return { satisfied: conf >= 0.6, confidence: conf, reason: 'neighborhood enriched' };
    }
    case 'deep': {
      return { satisfied: true, confidence: Math.max(0.5, head), reason: 'terminal layer' };
    }
  }
}

/**
 * Should we even run a given layer? (skip rules — laziness in both directions)
 */
export function shouldRun(layer: LayerName, parsed: ParsedQuery, soFar: Candidate[]): boolean {
  switch (layer) {
    case 'metadata':
      return true;
    case 'lexical':
      return parsed.freeText.length > 0;
    case 'vector':
      // Skip embeddings when shallow lexical/metadata already look decisive.
      return shouldRunVector(parsed, soFar);
    case 'topology':
      // Only worth it when we already have seeds to expand from.
      return soFar.length > 0;
    case 'deep':
      // Only when summaries were not decisive, there is residual text to test
      // against bodies, and at least one shortlisted candidate can actually
      // provide local body evidence.
      return shouldRunDeep(parsed, soFar);
  }
}

function shouldRunVector(parsed: ParsedQuery, soFar: Candidate[]): boolean {
  if (parsed.freeText.trim().length === 0 || parsed.isStructuredOnly) return false;
  if (soFar.length === 0) return true;

  const termCount = parsed.freeText.split(/\s+/).filter(Boolean).length;
  const head = soFar[0];
  const runnerUp = soFar[1];
  const headShallowStrength = Math.max(
    head?.scores.metadata ?? 0,
    head?.scores.lexical ?? 0,
  );
  const fusedGap = Math.max(0, (head?.fused ?? 0) - (runnerUp?.fused ?? 0));

  if (termCount < 2) {
    return headShallowStrength < 0.9 || fusedGap < 0.12;
  }

  if (headShallowStrength >= 0.92 && fusedGap >= 0.1 && soFar.length >= 2) {
    return false;
  }

  return true;
}

function shouldRunDeep(parsed: ParsedQuery, soFar: Candidate[]): boolean {
  if (soFar.length === 0) return false;
  if (parsed.freeText.trim().length === 0 || parsed.isStructuredOnly) return false;

  const bodyCandidates = soFar.filter((candidate) => candidate.message.body_available);
  if (bodyCandidates.length === 0) return false;

  const head = soFar[0];
  const runnerUp = soFar[1];
  const headShallowStrength = Math.max(
    head?.scores.metadata ?? 0,
    head?.scores.lexical ?? 0,
    head?.scores.vector ?? 0,
  );
  const headTopology = head?.scores.topology ?? 0;
  const bodyCoverage = bodyCandidates.length / Math.min(soFar.length, 3);
  const fusedGap = Math.max(0, (head?.fused ?? 0) - (runnerUp?.fused ?? 0));

  if (headShallowStrength < 0.88) return true;
  if (headTopology > 0) return true;
  if (bodyCoverage >= 0.5 && fusedGap < 0.08) return true;

  return false;
}
