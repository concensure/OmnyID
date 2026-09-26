import type { Candidate, LayerName, LedgerKind } from './types.js';

/**
 * A2UI rendering hints. The router never renders; it tells the surface
 * what shape the result wants to take and ships full provenance so the UI
 * can show "why am I seeing this" on every card.
 */

export type A2UIComponent =
  | 'result_list'
  | 'timeline'
  | 'thread_view'
  | 'decision_cards'
  | 'kanban_board'
  | 'map_snippet'
  | 'empty_state';

export interface A2UIRenderHint {
  component: A2UIComponent;
  title: string;
  confidenceBand: 'high' | 'medium' | 'low';
  confidenceLabel: string;
  groupBy?: 'thread' | 'day' | 'kind' | 'supertag';
  items: {
    message_id: string;
    headline: string;
    sublabel: string;
    showExcerpt: boolean;
    provenance: string[];
  }[];
  refineSuggestions: string[];
}

export function renderHint(
  candidates: Candidate[],
  terminalLayer: LayerName,
  confidence: number,
  query: {
    kinds: LedgerKind[];
    supertags?: string[];
    threadIds?: string[];
    fromAgents?: string[];
    timeRange?: { from?: string; to?: string };
    freeText: string;
  },
): A2UIRenderHint {
  const band = confidence >= 0.7 ? 'high' : confidence >= 0.45 ? 'medium' : 'low';

  let component: A2UIComponent = 'result_list';
  if (candidates.length === 0) component = 'empty_state';
  else if (query.kinds.includes('decision')) component = 'decision_cards';
  else if (query.kinds.includes('task') || query.kinds.includes('project')) component = 'kanban_board';
  else if (query.timeRange && !query.freeText) component = 'timeline';
  else if (dominantThread(candidates)) component = 'thread_view';

  return {
    component,
    title: candidates.length === 0 ? 'Nothing matched yet' : titleFor(query),
    confidenceBand: band,
    confidenceLabel:
      band === 'high'
        ? 'Grounded in your ledger'
        : band === 'medium'
          ? 'Likely matches; refine if this looks off'
          : 'Low confidence; help me narrow this down',
    groupBy: groupByFor(candidates, query),
    items: candidates.map((candidate) => ({
      message_id: candidate.message.message_id,
      headline:
        candidate.message.searchable_summary ??
        `${candidate.message.kind} - ${candidate.message.type}`,
      sublabel: `${new Date(candidate.message.timestamp).toLocaleDateString()} - ${candidate.message.supertags
        .map((tag) => `#${tag}`)
        .join(' ')}`,
      showExcerpt: Boolean(candidate.decryptedExcerpt),
      provenance: candidate.provenance,
    })),
    refineSuggestions: band === 'high' ? [] : suggestRefinements(candidates, query),
  };
}

function dominantThread(cs: Candidate[]): boolean {
  if (cs.length < 3) return false;
  const counts = new Map<string, number>();
  for (const candidate of cs) {
    counts.set(candidate.message.thread_id, (counts.get(candidate.message.thread_id) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / cs.length > 0.7;
}

function titleFor(q: { kinds: LedgerKind[]; freeText: string }): string {
  if (q.freeText && q.kinds.length > 0) {
    return `${humanizeKinds(q.kinds)} matching "${q.freeText}"`;
  }
  if (q.freeText) return q.freeText.charAt(0).toUpperCase() + q.freeText.slice(1);
  if (q.kinds.length) return humanizeKinds(q.kinds);
  return 'Results';
}

function suggestRefinements(
  cs: Candidate[],
  q: {
    kinds: LedgerKind[];
    supertags?: string[];
    threadIds?: string[];
    fromAgents?: string[];
    timeRange?: unknown;
  },
): string[] {
  const out: string[] = [];
  if (!q.timeRange) out.push('Limit to a time range');
  if (q.kinds.length === 0) {
    out.push('Filter by type or kind (notes, projects, decisions, messages)');
  }
  if ((q.threadIds?.length ?? 0) === 0) {
    const dominantThreadId = dominantThreadIdFromCandidates(cs);
    if (dominantThreadId) out.push('Only this thread');
  }
  if ((q.fromAgents?.length ?? 0) === 0) {
    const dominantAgent = dominantAgentFromCandidates(cs);
    if (dominantAgent) out.push(`Only from ${dominantAgent}`);
  }
  const existingTags = new Set((q.supertags ?? []).map((tag) => tag.toLowerCase()));
  const tags = new Set(cs.flatMap((candidate) => candidate.message.supertags));
  for (const tag of [...tags]) {
    if (existingTags.has(tag.toLowerCase())) continue;
    out.push(`Only #${tag}`);
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

function humanizeKinds(kinds: LedgerKind[]): string {
  return kinds
    .map((kind) => kind.replaceAll('_', ' '))
    .join(' & ');
}

function groupByFor(
  candidates: Candidate[],
  query: {
    kinds: LedgerKind[];
    supertags?: string[];
    threadIds?: string[];
    timeRange?: { from?: string; to?: string };
  },
): 'thread' | 'day' | 'kind' | 'supertag' | undefined {
  if (query.timeRange) return 'day';
  if ((query.threadIds?.length ?? 0) > 0 || dominantThread(candidates)) return 'thread';
  if (query.kinds.length > 1) return 'kind';
  if ((query.supertags?.length ?? 0) > 0) return 'supertag';
  return undefined;
}

function dominantThreadIdFromCandidates(candidates: Candidate[]): string | null {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.message.thread_id, (counts.get(candidate.message.thread_id) ?? 0) + 1);
  }
  const [threadId, count] =
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (!threadId || !count || count < 2) return null;
  return threadId;
}

function dominantAgentFromCandidates(candidates: Candidate[]): string | null {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.message.from_agent, (counts.get(candidate.message.from_agent) ?? 0) + 1);
  }
  const [agent, count] =
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (!agent || !count || count < 2) return null;
  return agent;
}
