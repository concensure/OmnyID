import {
  resolveContinuityTargetLabel,
  type ContinuityMessageLike,
} from './continuity.js';

export interface RetrievalStateLike {
  summary?: string | null;
  badges?: string[] | null;
}

export interface ObjectFacetMoveEntryLike {
  value?: string | null;
  count?: number | null;
  score?: number | null;
  rationale?: string | null;
}

export interface ObjectFacetNextMovesLike {
  kinds?: ObjectFacetMoveEntryLike[] | null;
  tags?: ObjectFacetMoveEntryLike[] | null;
  reference_targets?: ObjectFacetMoveEntryLike[] | null;
  reference_types?: ObjectFacetMoveEntryLike[] | null;
  link_types?: ObjectFacetMoveEntryLike[] | null;
  metadata_terms?: ObjectFacetMoveEntryLike[] | null;
}

export type ObjectFacetFamily =
  | 'kind'
  | 'tag'
  | 'reference_target'
  | 'reference_type'
  | 'link_type'
  | 'metadata_term';

export interface ObjectMessagesLike {
  retrieval_state?: RetrievalStateLike | null;
  facet_next_moves?: ObjectFacetNextMovesLike | null;
  focus_thread_id?: string | null;
  focus_object_id?: string | null;
  query?: string | null;
}

export interface ObjectRetrievalLaunchLike {
  sourceLabel?: string | null;
  reason?: string | null;
}

export interface ThreadSummaryLike {
  thread_id: string;
  title?: string | null;
  preview?: string | null;
  message_count?: number | null;
  activity_freshness?: string | null;
  dominant_kind?: string | null;
  supertags?: string[] | null;
  metadata_terms?: string[] | null;
}

export interface ThreadSearchLaunchLike {
  sourceLabel?: string | null;
  reason?: string | null;
}

export interface ContinuityThreadSearchQueryInputLike {
  title?: string | null;
  linked_target_label?: string | null;
  reference_labels?: string[] | null;
  object_labels?: string[] | null;
  file_labels?: string[] | null;
  pack_kind?: string | null;
  draft_class?: string | null;
  panel_kind?: string | null;
  source_refs?: string[] | null;
  reference_refs?: string[] | null;
  object_refs?: string[] | null;
  file_refs?: string[] | null;
  messages?: ContinuityMessageLike[] | null;
  thread_summaries?: ThreadSummaryLike[] | null;
}

export interface ThreadFacetSuggestionEntryLike {
  value?: string | null;
  count?: number | null;
}

export interface ThreadFacetMoveEntryLike extends ThreadFacetSuggestionEntryLike {
  score?: number | null;
  rationale?: string | null;
}

export interface TopThreadFreshnessState {
  badge: string;
  summary: string;
  tone: 'success' | 'info' | 'warning';
}

export interface TopObjectFreshnessState {
  badge: string;
  summary: string;
  tone: 'success' | 'info' | 'warning';
}

export interface ThreadFacetNextMovesLike {
  kinds?: ThreadFacetMoveEntryLike[] | null;
  tags?: ThreadFacetMoveEntryLike[] | null;
  metadata_terms?: ThreadFacetMoveEntryLike[] | null;
}

export type ThreadFacetFamily = 'kind' | 'tag' | 'metadata_term';

export function hasRetrievalState(state?: RetrievalStateLike | null): boolean {
  return Boolean(state?.summary?.trim() || (state?.badges?.length ?? 0) > 0);
}

export function humanizeRetrievalBadge(badge: string): string {
  const normalized = badge.trim();
  if (!normalized) return '';
  switch (normalized) {
    case 'kind-concentrated':
      return 'kind concentrated';
    case 'mixed neighborhood':
      return 'mixed results';
    case 'fresh-object supported':
      return 'fresh object support';
    case 'older-object supported':
      return 'older object support';
    case 'fresh-thread supported':
      return 'fresh thread support';
    case 'older-thread supported':
      return 'older thread support';
    default:
      return normalized;
  }
}

export function retrievalBadgeTone(badge: string): 'success' | 'warning' | 'info' | 'neutral' {
  const normalized = humanizeRetrievalBadge(badge).toLowerCase();
  if (normalized === 'kind concentrated' || normalized === 'focused object') {
    return 'success';
  }
  if (
    normalized === 'mixed results'
    || normalized === 'older object support'
    || normalized === 'older thread support'
  ) {
    return 'warning';
  }
  if (
    normalized === 'narrowing-first'
    || normalized === 'continuity-local'
    || normalized === 'active-state weighted'
    || normalized === 'fresh object support'
    || normalized === 'fresh thread support'
    || normalized.startsWith('thread ')
    || normalized.startsWith('from ')
    || normalized.endsWith(' context')
    || normalized.endsWith(' authored')
    || normalized.endsWith(' status')
    || normalized.endsWith(' priority')
    || normalized.endsWith(' domain')
    || normalized.startsWith('follow-up ')
  ) {
    return 'info';
  }
  return 'neutral';
}

function humanizeMetadataTermLabel(key: string, value: string): string {
  const normalizedKey = key.trim().toLowerCase();
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return `${normalizedKey}:${value}`;
  if (normalizedKey === 'memory_space') {
    return `${normalizedValue.replace(/[_-]+/g, ' ')} context`;
  }
  if (normalizedKey === 'author_type' && normalizedValue === 'human') {
    return 'human authored';
  }
  if (normalizedKey === 'author_type' && normalizedValue === 'agent') {
    return 'agent authored';
  }
  if (normalizedKey === 'author_mask' && normalizedValue === 'private') {
    return 'private authored';
  }
  if (normalizedKey === 'author_mask' && normalizedValue === 'public') {
    return 'public authored';
  }
  if (normalizedKey === 'status') {
    return `${normalizedValue.replace(/[_-]+/g, ' ')} status`;
  }
  if (normalizedKey === 'priority') {
    return `${normalizedValue.replace(/[_-]+/g, ' ')} priority`;
  }
  if (normalizedKey === 'domain') {
    return `${normalizedValue.replace(/[_-]+/g, ' ')} domain`;
  }
  if (normalizedKey === 'follow_up_at') {
    return `follow-up ${normalizedValue.replace(/[_-]+/g, ' ')}`;
  }
  return `${normalizedKey}:${value}`;
}

export function retrievalScopeBadgesFromQuery(query?: string | null): string[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return [];

  const badges: string[] = [];
  const memoryMatch = normalized.match(/\b(?:memory_space|memory|space):([^\s]+)/);
  if (memoryMatch?.[1]) {
    badges.push(humanizeMetadataTermLabel('memory_space', memoryMatch[1]));
  }

  const authorTypeMatch = normalized.match(/\bauthor_type:([^\s]+)/);
  if (authorTypeMatch?.[1] === 'human') {
    badges.push(humanizeMetadataTermLabel('author_type', 'human'));
  } else if (authorTypeMatch?.[1] === 'agent') {
    badges.push(humanizeMetadataTermLabel('author_type', 'agent'));
  }

  const authorMaskMatch = normalized.match(/\b(?:author_mask|mask):([^\s]+)/);
  if (authorMaskMatch?.[1] === 'private') {
    badges.push(humanizeMetadataTermLabel('author_mask', 'private'));
  } else if (authorMaskMatch?.[1] === 'public') {
    badges.push(humanizeMetadataTermLabel('author_mask', 'public'));
  }

  const statusMatch = normalized.match(/\bstatus:([^\s]+)/);
  if (statusMatch?.[1]) {
    badges.push(humanizeMetadataTermLabel('status', statusMatch[1]));
  }

  const priorityMatch = normalized.match(/\bpriority:([^\s]+)/);
  if (priorityMatch?.[1]) {
    badges.push(humanizeMetadataTermLabel('priority', priorityMatch[1]));
  }

  const domainMatch = normalized.match(/\bdomain:([^\s]+)/);
  if (domainMatch?.[1]) {
    badges.push(humanizeMetadataTermLabel('domain', domainMatch[1]));
  }

  const followUpMatch = normalized.match(/\b(?:followup|follow_up|follow_up_at):([^\s]+)/);
  if (followUpMatch?.[1]) {
    badges.push(humanizeMetadataTermLabel('follow_up_at', followUpMatch[1]));
  }

  return [...new Set(badges)];
}

export function retrievalScopeSummaryFromQuery(query?: string | null): string | null {
  const badges = retrievalScopeBadgesFromQuery(query);
  if (badges.length === 0) return null;
  if (badges.length === 1) return `Scoped to ${badges[0]}.`;
  if (badges.length === 2) return `Scoped to ${badges[0]} and ${badges[1]}.`;
  return `Scoped to ${badges.slice(0, -1).join(', ')}, and ${badges.at(-1)}.`;
}

export function retrievalStateBadges(state?: RetrievalStateLike | null): string[] {
  return (state?.badges ?? [])
    .map((badge) => humanizeRetrievalBadge(badge))
    .filter((badge) => badge.trim());
}

export function retrievalStateSummary(state?: RetrievalStateLike | null): string | null {
  const summary = state?.summary?.trim();
  return summary || null;
}

export function collectObjectFacetRationales(result: ObjectMessagesLike): string[] {
  const nextMoves = result.facet_next_moves;
  if (!nextMoves) return [];
  return [
    ...(nextMoves.kinds ?? []),
    ...(nextMoves.tags ?? []),
    ...(nextMoves.reference_targets ?? []),
    ...(nextMoves.reference_types ?? []),
    ...(nextMoves.link_types ?? []),
    ...(nextMoves.metadata_terms ?? []),
  ]
    .slice(0, 8)
    .map((entry) => entry.rationale?.trim() ?? '')
    .filter(Boolean);
}

export function objectRetrievalPressureLabels(result: ObjectMessagesLike): string[] {
  const joined = collectObjectFacetRationales(result).join(' || ').toLowerCase();
  const labels: string[] = [];
  if (joined.includes('focused object anchor')) labels.push('focused-object anchored');
  if (joined.includes('local continuity')) labels.push('continuity-local');
  if (joined.includes('active-state pressure')) labels.push('active-state weighted');
  if (joined.includes('strong narrowing power')) labels.push('narrowing-first');
  return labels;
}

export function objectRetrievalStateBadges(args: {
  result: ObjectMessagesLike;
  launchContext?: ObjectRetrievalLaunchLike | null;
  focusedObjectId?: string | null;
}): string[] {
  if ((args.result.retrieval_state?.badges?.length ?? 0) > 0) {
    const badges = [...(args.result.retrieval_state?.badges ?? [])].map((badge) =>
      humanizeRetrievalBadge(badge),
    );
    if (args.launchContext?.sourceLabel?.trim()) {
      badges.unshift(`from ${args.launchContext.sourceLabel.trim()}`);
    }
    badges.push(...retrievalScopeBadgesFromQuery(args.result.query));
    return [...new Set(badges.filter((badge) => badge.trim()))];
  }

  const badges: string[] = [];
  if (args.launchContext?.sourceLabel?.trim()) {
    badges.push(`from ${args.launchContext.sourceLabel.trim()}`);
  }
  if (args.result.focus_thread_id?.trim()) {
    badges.push(`thread ${args.result.focus_thread_id.trim()}`);
  }
  if ((args.focusedObjectId ?? args.result.focus_object_id)?.trim()) {
    badges.push('focused object');
  }
  for (const label of objectRetrievalPressureLabels(args.result)) {
    if (!badges.includes(label)) badges.push(label);
  }
  badges.push(...retrievalScopeBadgesFromQuery(args.result.query));
  return [...new Set(badges.filter((badge) => badge.trim()))];
}

export function topObjectFreshnessState(
  state?: RetrievalStateLike | null,
): TopObjectFreshnessState | null {
  const badges = state?.badges ?? [];
  if (badges.includes('fresh-top-object')) {
    return {
      badge: 'Top object fresh',
      summary: 'Top object context is fresh.',
      tone: 'success',
    };
  }
  if (badges.includes('active-top-object')) {
    return {
      badge: 'Top object active',
      summary: 'Top object context remains active.',
      tone: 'info',
    };
  }
  if (badges.includes('stale-top-object')) {
    return {
      badge: 'Top object stale',
      summary: 'Top object context is older but still relevant.',
      tone: 'warning',
    };
  }
  return null;
}

export function topObjectFreshnessSummary(
  state?: RetrievalStateLike | null,
): string | null {
  return topObjectFreshnessState(state)?.summary ?? null;
}

export function leadingObjectCue(
  state?: RetrievalStateLike | null,
): string | null {
  const summary = state?.summary?.trim();
  if (!summary) return null;
  const match = summary.match(/Leading object cue:\s+(.+?)\./i);
  return match?.[1]?.trim() || null;
}

export function objectRetrievalStateDisplayBadges(args: {
  result: ObjectMessagesLike;
  launchContext?: ObjectRetrievalLaunchLike | null;
  focusedObjectId?: string | null;
}): string[] {
  return objectRetrievalStateBadges(args).filter(
    (badge) =>
      badge !== 'fresh-top-object'
      && badge !== 'active-top-object'
      && badge !== 'stale-top-object',
  );
}

export function objectRetrievalStateSummary(args: {
  result: ObjectMessagesLike;
  launchContext?: ObjectRetrievalLaunchLike | null;
  focusedObjectId?: string | null;
}): string {
  const scopeSummary = retrievalScopeSummaryFromQuery(args.result.query);
  if (args.result.retrieval_state?.summary?.trim()) {
    const prefix = args.launchContext?.sourceLabel?.trim()
      ? `Launched from ${args.launchContext.sourceLabel.trim().toLowerCase()}. `
      : '';
    const reason = args.launchContext?.reason?.trim()
      ? `${args.launchContext.reason.trim()} `
      : '';
    const suffix = scopeSummary ? ` ${scopeSummary}` : '';
    return `${prefix}${reason}${args.result.retrieval_state.summary.trim()}${suffix}`.trim();
  }

  const parts: string[] = [];
  if (args.launchContext?.sourceLabel?.trim()) {
    parts.push(`Launched from ${args.launchContext.sourceLabel.trim().toLowerCase()}.`);
  }
  if (args.launchContext?.reason?.trim()) {
    parts.push(args.launchContext.reason.trim());
  }

  const pressures = objectRetrievalPressureLabels(args.result);
  if (pressures.length > 0) {
    parts.push(`Current ranking is ${pressures.join(', ')}.`);
  }
  if (scopeSummary) {
    parts.push(scopeSummary);
  }

  const focusObjectId = (args.focusedObjectId ?? args.result.focus_object_id)?.trim();
  if (focusObjectId) {
    parts.push(`Focused object anchor: ${focusObjectId}.`);
  } else if (args.result.focus_thread_id?.trim()) {
    parts.push(`Thread anchor: ${args.result.focus_thread_id.trim()}.`);
  }

  return parts.join(' ');
}

export function objectFacetStructuredLabel(
  family: ObjectFacetFamily,
  value: string,
): string {
  const trimmed = value.trim();
  switch (family) {
    case 'kind':
      return `kind:${trimmed}`;
    case 'tag':
      return `#${trimmed}`;
    case 'reference_target':
      return `target:${trimmed}`;
    case 'reference_type':
      return `reftype:${trimmed}`;
    case 'link_type':
      return `relation:${trimmed}`;
    case 'metadata_term':
    default: {
      const [rawKey, rawValue] = trimmed.split(':', 2);
      const key = rawKey?.trim().toLowerCase();
      const normalizedValue = rawValue?.trim().toLowerCase();
      if (key && normalizedValue) {
        return humanizeMetadataTermLabel(key, normalizedValue);
      }
      return trimmed;
    }
  }
}

export function objectFacetCountLabel(
  family: ObjectFacetFamily,
  value: string,
  count: number,
): string {
  return `${objectFacetStructuredLabel(family, value)} · ${count}`;
}

export interface FlattenedObjectFacetMove {
  family: ObjectFacetFamily;
  value: string;
  count?: number | null;
  score?: number | null;
  rationale: string;
  label: string;
}

export function flattenObjectFacetNextMoves(
  nextMoves?: ObjectFacetNextMovesLike | null,
  limit = 8,
): FlattenedObjectFacetMove[] {
  if (!nextMoves) return [];
  const flattened: FlattenedObjectFacetMove[] = [];

  const append = (family: ObjectFacetFamily, entries?: ObjectFacetMoveEntryLike[] | null) => {
    for (const entry of entries ?? []) {
      const value = entry.value?.trim();
      const rationale = entry.rationale?.trim();
      if (!value || !rationale) continue;
      flattened.push({
        family,
        value,
        count: entry.count ?? null,
        score: entry.score ?? null,
        rationale,
        label: objectFacetStructuredLabel(family, value),
      });
    }
  };

  append('kind', nextMoves.kinds);
  append('tag', nextMoves.tags);
  append('reference_target', nextMoves.reference_targets);
  append('reference_type', nextMoves.reference_types);
  append('link_type', nextMoves.link_types);
  append('metadata_term', nextMoves.metadata_terms);

  return flattened.slice(0, Math.max(1, limit));
}

export function objectFacetMoveDisplayLabel(entry: {
  family: ObjectFacetFamily;
  value: string;
  count?: number | null;
  label?: string | null;
}): string {
  return typeof entry.count === 'number'
    ? objectFacetCountLabel(entry.family, entry.value, entry.count)
    : (entry.label?.trim() || objectFacetStructuredLabel(entry.family, entry.value));
}

function normalizeThreadSearchSeed(text: string | null | undefined): string | null {
  const normalized = text
    ?.replace(/^(thread|object)\s*:\s*/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return normalized && normalized.length >= 3 ? normalized : null;
}

function inferredThreadSearchKind(input: {
  pack_kind?: string | null;
  draft_class?: string | null;
  panel_kind?: string | null;
}): string | null {
  if (input.pack_kind === 'obligation_pack' || input.draft_class === 'task_bundle') {
    return 'task';
  }
  if (input.draft_class === 'project_prep_note') {
    return 'project';
  }
  if (input.draft_class === 'decision_memo' || input.draft_class === 'comparison_table') {
    return 'decision';
  }
  if (
    input.draft_class === 'communication_reply'
    || input.draft_class === 'follow_up_draft'
    || input.panel_kind === 'response_queue'
  ) {
    return 'communication';
  }
  return null;
}

export function continuityThreadSearchQuery(
  input: ContinuityThreadSearchQueryInputLike,
): string | null {
  const targetLabel = resolveContinuityTargetLabel({
    linked_target_label: input.linked_target_label,
    reference_labels: input.reference_labels,
    object_labels: input.object_labels,
    file_labels: input.file_labels,
    source_refs: input.source_refs,
    reference_refs: input.reference_refs,
    object_refs: input.object_refs,
    file_refs: input.file_refs,
    messages: input.messages,
    thread_summaries: input.thread_summaries,
  });
  const seed =
    normalizeThreadSearchSeed(targetLabel)
    ?? normalizeThreadSearchSeed(input.reference_labels?.[0])
    ?? normalizeThreadSearchSeed(input.object_labels?.[0])
    ?? normalizeThreadSearchSeed(input.file_labels?.[0])
    ?? normalizeThreadSearchSeed(input.title);
  const kind = inferredThreadSearchKind(input);
  const tokens: string[] = [];
  if (seed) tokens.push(seed);
  if (kind) tokens.push(`kind:${kind}`);
  const query = tokens.join(' ').trim();
  return query || null;
}

export function threadSummaryRefineQuery(summary?: ThreadSummaryLike | null): string | null {
  if (!summary) return null;
  const tokens: string[] = [];
  const kind = summary.dominant_kind?.trim().toLowerCase();
  if (kind) {
    tokens.push(`kind:${kind}`);
  }
  const primaryTag = (summary.supertags ?? []).find((tag) => tag.trim());
  if (primaryTag) {
    tokens.push(`#${primaryTag.trim().toLowerCase()}`);
  }
  const scopeTerms = (summary.metadata_terms ?? [])
    .map((term) => term.trim().toLowerCase())
    .filter((term) =>
      term.startsWith('memory_space:')
      || term.startsWith('author_type:')
      || term.startsWith('author_mask:'),
    )
    .slice(0, 2);
  tokens.push(...scopeTerms);
  const query = tokens.join(' ').trim();
  return query || null;
}

export function threadSummaryPrimaryText(summary: ThreadSummaryLike): string {
  return summary.title?.trim() || summary.preview?.trim() || summary.thread_id;
}

export function threadRetrievalStateBadges(args: {
  state?: RetrievalStateLike | null;
  launchContext?: ThreadSearchLaunchLike | null;
  query?: string | null;
}): string[] {
  const badges = [...(args.state?.badges ?? [])]
    .map((badge) => humanizeRetrievalBadge(badge))
    .filter((badge) => badge.trim());
  if (args.launchContext?.sourceLabel?.trim()) {
    badges.unshift(`from ${args.launchContext.sourceLabel.trim()}`);
  }
  badges.push(...retrievalScopeBadgesFromQuery(args.query));
  return [...new Set(badges)];
}

export function topThreadFreshnessState(
  state?: RetrievalStateLike | null,
): TopThreadFreshnessState | null {
  const badges = state?.badges ?? [];
  if (badges.includes('fresh-top-thread')) {
    return {
      badge: 'Top thread fresh',
      summary: 'Top thread context is fresh.',
      tone: 'success',
    };
  }
  if (badges.includes('active-top-thread')) {
    return {
      badge: 'Top thread active',
      summary: 'Top thread context remains active.',
      tone: 'info',
    };
  }
  if (badges.includes('stale-top-thread')) {
    return {
      badge: 'Top thread stale',
      summary: 'Top thread context is older but still relevant.',
      tone: 'warning',
    };
  }
  return null;
}

export function topThreadFreshnessSummary(
  state?: RetrievalStateLike | null,
): string | null {
  return topThreadFreshnessState(state)?.summary ?? null;
}

export function leadingThreadCue(
  state?: RetrievalStateLike | null,
): string | null {
  const summary = state?.summary?.trim();
  if (!summary) return null;
  const match = summary.match(/Leading neighborhood cue:\s+(.+?)\./i);
  return match?.[1]?.trim() || null;
}

export function threadRetrievalStateDisplayBadges(args: {
  state?: RetrievalStateLike | null;
  launchContext?: ThreadSearchLaunchLike | null;
  query?: string | null;
}): string[] {
  return threadRetrievalStateBadges(args).filter(
    (badge) =>
      badge !== 'fresh-top-thread'
      && badge !== 'active-top-thread'
      && badge !== 'stale-top-thread',
  );
}

export function threadRetrievalStateSummary(args: {
  state?: RetrievalStateLike | null;
  launchContext?: ThreadSearchLaunchLike | null;
  query?: string | null;
}): string | null {
  const stateSummary = args.state?.summary?.trim();
  const sourceLabel = args.launchContext?.sourceLabel?.trim();
  const reason = args.launchContext?.reason?.trim();
  const scopeSummary = retrievalScopeSummaryFromQuery(args.query);

  if (stateSummary) {
    const prefix = sourceLabel ? `Launched from ${sourceLabel.toLowerCase()}. ` : '';
    const rationale = reason ? `${reason} ` : '';
    const suffix = scopeSummary ? ` ${scopeSummary}` : '';
    return `${prefix}${rationale}${stateSummary}${suffix}`.trim();
  }

  if (sourceLabel && reason) {
    return `Launched from ${sourceLabel.toLowerCase()}. ${reason}${scopeSummary ? ` ${scopeSummary}` : ''}`;
  }
  if (sourceLabel) {
    return `Launched from ${sourceLabel.toLowerCase()}.${scopeSummary ? ` ${scopeSummary}` : ''}`;
  }
  if (reason) {
    return `${reason}${scopeSummary ? ` ${scopeSummary}` : ''}`;
  }
  if (scopeSummary) return scopeSummary;
  return null;
}

function humanizeThreadKind(kind?: string | null): string | null {
  const raw = kind?.trim();
  if (!raw) return null;
  return raw.replaceAll(/[_-]+/g, ' ');
}

function threadSummaryFreshnessBadge(freshness?: string | null): string | null {
  const normalized = freshness?.trim().toLowerCase();
  if (normalized === 'fresh' || normalized === 'active' || normalized === 'stale') {
    return normalized;
  }
  return null;
}

export function threadSummaryMetaBadges(
  summary: ThreadSummaryLike,
  maxTags = 1,
): string[] {
  const badges: string[] = [];
  const kind = humanizeThreadKind(summary.dominant_kind);
  if (kind) badges.push(kind);
  const freshness = threadSummaryFreshnessBadge(summary.activity_freshness);
  if (freshness) badges.push(freshness);
  if (typeof summary.message_count === 'number' && summary.message_count > 0) {
    badges.push(`${summary.message_count} msg${summary.message_count === 1 ? '' : 's'}`);
  }
  for (const tag of (summary.supertags ?? []).filter((value) => value.trim()).slice(0, Math.max(0, maxTags))) {
    badges.push(`#${tag}`);
  }
  return badges;
}

export function threadSummaryMetaLine(
  summary: ThreadSummaryLike,
  maxTags = 1,
): string | null {
  const badges = threadSummaryMetaBadges(summary, maxTags);
  if (badges.length === 0) return null;
  return badges.join(' · ');
}

export function threadFacetStructuredLabel(
  family: ThreadFacetFamily,
  value: string,
): string {
  const trimmed = value.trim();
  if (family === 'kind') return `kind:${trimmed}`;
  if (family === 'tag') return `#${trimmed}`;
  const [rawKey, rawValue] = trimmed.split(':', 2);
  const key = rawKey?.trim().toLowerCase();
  const normalizedValue = rawValue?.trim().toLowerCase();
  if (key && normalizedValue) {
    return humanizeMetadataTermLabel(key, normalizedValue);
  }
  return trimmed;
}

export function threadFacetCountLabel(
  family: ThreadFacetFamily,
  value: string,
  count: number,
): string {
  return `${threadFacetStructuredLabel(family, value)} · ${count}`;
}

export interface FlattenedThreadFacetMove {
  family: ThreadFacetFamily;
  value: string;
  count?: number | null;
  score?: number | null;
  rationale: string;
  label: string;
}

export function flattenThreadFacetNextMoves(
  nextMoves?: ThreadFacetNextMovesLike | null,
  limit = 8,
): FlattenedThreadFacetMove[] {
  if (!nextMoves) return [];
  const flattened: FlattenedThreadFacetMove[] = [];

  const append = (family: ThreadFacetFamily, entries?: ThreadFacetMoveEntryLike[] | null) => {
    for (const entry of entries ?? []) {
      const value = entry.value?.trim();
      const rationale = entry.rationale?.trim();
      if (!value || !rationale) continue;
      flattened.push({
        family,
        value,
        count: entry.count ?? null,
        score: entry.score ?? null,
        rationale,
        label: threadFacetStructuredLabel(family, value),
      });
    }
  };

  append('kind', nextMoves.kinds);
  append('tag', nextMoves.tags);
  append('metadata_term', nextMoves.metadata_terms);

  return flattened.slice(0, Math.max(1, limit));
}
