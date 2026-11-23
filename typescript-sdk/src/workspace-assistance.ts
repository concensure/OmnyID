import {
  responseItemPreparedDraftAnchorLabels,
  responseItemPreparedDraftLeadSummary,
  responseItemPreparedDraftSupportingSummaryLines,
} from './continuity.js';

const WORKSPACE_TOPIC_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'this',
  'that',
  'your',
  'when',
  'then',
  'else',
  'true',
  'false',
  'null',
  'none',
  'void',
  'return',
  'const',
  'let',
  'var',
  'function',
  'class',
  'import',
  'export',
  'default',
  'async',
  'await',
  'props',
  'value',
  'string',
  'label',
  'title',
  'summary',
  'workspace',
  'runner',
  'editor',
  'python',
  'file',
  'files',
  'path',
  'note',
  'draft',
  'ready',
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function humanizeWorkspaceToken(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/[\\/]+/g, ' ')
      .replace(/\.[A-Za-z0-9]+$/g, '')
      .replace(/[_-]+/g, ' '),
  );
}

function tokenizeWorkspaceTopic(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !WORKSPACE_TOPIC_STOP_WORDS.has(token));
}

function basenameFromPath(value: string): string {
  const segments = value.split(/[\\/]/g).filter(Boolean);
  return segments[segments.length - 1] ?? value;
}

function firstMeaningfulEditorLine(value: string | null | undefined): string | null {
  const lines = (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const normalized = line
      .replace(/^#+\s*/g, '')
      .replace(/^\/\/+\s*/g, '')
      .replace(/^\/\*+\s*/g, '')
      .replace(/^\*+\s*/g, '')
      .replace(/^['"`]+|['"`]+$/g, '')
      .trim();
    if (!normalized) continue;
    if (normalized.length < 6) continue;
    return normalizeWhitespace(normalized);
  }
  return null;
}

function dedupeLines(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? '');
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export type WorkspaceAssistTopicInput = {
  app_label?: string | null;
  document_title?: string | null;
  file_path?: string | null;
  selected_text?: string | null;
  editor_text?: string | null;
  recent_activity_titles?: string[] | null;
};

export type WorkspaceAssistTopic = {
  label: string;
  evidence: string[];
  keywords: string[];
  looks_external_current?: boolean;
  research_query?: string | null;
};

export type WorkspaceAssistCandidate = {
  status: 'context_ready' | 'brief_ready' | 'draft_ready';
  artifact_kind?: 'context_pack' | 'prepared_draft' | 'response_draft' | 'continuity_brief' | 'research_prompt' | null;
  freshness_score?: number | null;
  title: string;
  summary?: string | null;
  confidence?: string | null;
  destination_view?: string | null;
  detail_lines?: string[] | null;
  labels?: string[] | null;
  hints?: string[] | null;
  research_query?: string | null;
};

export type WorkspaceAssistSuggestion = {
  status: 'context_ready' | 'brief_ready' | 'draft_ready';
  artifact_kind?: 'context_pack' | 'prepared_draft' | 'response_draft' | 'continuity_brief' | 'research_prompt' | null;
  title: string;
  summary: string;
  detail_lines: string[];
  confidence?: string | null;
  destination_view?: string | null;
  research_query?: string | null;
  topic_label: string;
  topic_evidence: string[];
  matched_keywords: string[];
};

export type WorkspaceAssistRefreshOrigin = 'surface_entry' | 'draft_change' | 'cached';
export type WorkspaceAssistSurfaceKind = 'runner' | 'email' | 'note' | 'thread';
export type WorkspaceAssistDraftRefreshInput = {
  channelId: string;
  surfaceKey: string;
  documentTitle?: string | null;
  filePath?: string | null;
  text: string;
};
export type WorkspaceAssistContextPackItem = {
  title: string;
  summary: string;
  confidence?: string | null;
  why_surfaced: string;
  reference_labels?: string[] | null;
  object_labels?: string[] | null;
  file_labels?: string[] | null;
  evidence_kinds?: string[] | null;
};
export type WorkspaceAssistPreparedDraftItem = {
  draft_class: string;
  title: string;
  summary: string;
  confidence?: string | null;
  suggested_action: string;
  response_due_hint?: string | null;
  selection_reason?: string | null;
  object_labels?: string[] | null;
};
export type WorkspaceAssistResponseItem = {
  title: string;
  response_due_hint?: string | null;
  prepared_draft_available?: boolean;
  prepared_draft_summary?: string | null;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_selection_reason?: string | null;
  prepared_draft_object_labels?: string[] | null;
};
export type WorkspaceAssistBriefItem = {
  title: string;
  suggested_actions?: string[] | null;
};
export type WorkspaceAssistPriorityCard = {
  title?: string | null;
  description?: string | null;
  object_labels?: string[] | null;
};
export type WorkspaceAssistThreadSummaryItem = {
  title: string;
};
export type WorkspaceAssistDashboardPayload = {
  continuity_context_pack_items?: WorkspaceAssistContextPackItem[] | null;
  continuity_prepared_draft_items?: WorkspaceAssistPreparedDraftItem[] | null;
  continuity_response_items?: WorkspaceAssistResponseItem[] | null;
  continuity_brief?: WorkspaceAssistBriefItem | null;
  continuity_priority_card?: WorkspaceAssistPriorityCard | null;
  continuity_primary_mode?: string | null;
  thread_summaries?: WorkspaceAssistThreadSummaryItem[] | null;
};

const SURFACE_REFRESH_COOLDOWN_MS = 15_000;
const DRAFT_REFRESH_COOLDOWN_MS = 20_000;
const MIN_MEANINGFUL_DRAFT_CHARS = 48;

export function workspaceAssistRefreshOriginLabel(
  origin: WorkspaceAssistRefreshOrigin,
  artifactKind?: WorkspaceAssistSuggestion["artifact_kind"] | null,
): string {
  const artifactLabel =
    artifactKind === 'research_prompt' ? 'research hint'
    : artifactKind === 'response_draft' ? 'response draft'
    : artifactKind === 'prepared_draft' ? 'prepared draft'
    : artifactKind === 'context_pack' ? 'context pack'
    : artifactKind === 'continuity_brief' ? 'continuity brief'
    : 'continuity snapshot';
  if (origin === 'surface_entry') return `Refreshed ${artifactLabel} on surface entry`;
  if (origin === 'draft_change') return `Refreshed ${artifactLabel} after draft shift`;
  return `Using current ${artifactLabel}`;
}

export function buildWorkspaceAssistSurfaceKey(input: {
  surface: WorkspaceAssistSurfaceKind;
  threadId?: string | null;
}): string | null {
  if (input.surface === 'thread') {
    return input.threadId ? `thread:${input.threadId}` : null;
  }
  return input.surface;
}

function workspaceAssistFreshnessScore(input: {
  origin?: WorkspaceAssistRefreshOrigin | null;
  artifactKind?: WorkspaceAssistSuggestion["artifact_kind"] | null;
}): number {
  const origin = input.origin ?? 'cached';
  const artifactKind = input.artifactKind ?? null;
  if (origin === 'draft_change') {
    if (artifactKind === 'response_draft') return 1.2;
    if (artifactKind === 'prepared_draft') return 0.9;
    if (artifactKind === 'context_pack') return 0.35;
    return 0.15;
  }
  if (origin === 'surface_entry') {
    if (artifactKind === 'context_pack') return 1.0;
    if (artifactKind === 'continuity_brief') return 0.75;
    if (artifactKind === 'response_draft') return 0.4;
    if (artifactKind === 'prepared_draft') return 0.35;
  }
  return 0;
}

function normalizeWorkspaceAssistDraftText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function workspaceAssistDraftRefreshSignature(input: {
  surfaceKey: string;
  documentTitle?: string | null;
  filePath?: string | null;
  text: string;
}): string | null {
  const normalizedText = normalizeWorkspaceAssistDraftText(input.text);
  if (normalizedText.length < MIN_MEANINGFUL_DRAFT_CHARS) return null;
  const title = normalizeWorkspaceAssistDraftText(input.documentTitle ?? '');
  const filePath = normalizeWorkspaceAssistDraftText(input.filePath ?? '');
  return [
    input.surfaceKey,
    title.slice(0, 80),
    filePath.slice(0, 120),
    normalizedText.slice(0, 240),
  ].join('::');
}

export function shouldRefreshWorkspaceAssistSurface(input: {
  previousKey: string | null;
  nextKey: string | null;
  now: number;
  lastRefreshedAtByKey: Map<string, number>;
}): boolean {
  const { previousKey, nextKey, now, lastRefreshedAtByKey } = input;
  if (!nextKey) return false;
  const lastAt = lastRefreshedAtByKey.get(nextKey);
  if (previousKey !== nextKey) {
    return typeof lastAt !== 'number' || now - lastAt >= SURFACE_REFRESH_COOLDOWN_MS;
  }
  return typeof lastAt !== 'number' || now - lastAt >= SURFACE_REFRESH_COOLDOWN_MS;
}

export function shouldRefreshWorkspaceAssistDraft(input: {
  previousSignature: string | null;
  nextSignature: string | null;
  now: number;
  lastRefreshedAtBySignature: Map<string, number>;
}): boolean {
  const { previousSignature, nextSignature, now, lastRefreshedAtBySignature } = input;
  if (!nextSignature || nextSignature === previousSignature) return false;
  const lastAt = lastRefreshedAtBySignature.get(nextSignature);
  return typeof lastAt !== 'number' || now - lastAt >= DRAFT_REFRESH_COOLDOWN_MS;
}

export function createWorkspaceAssistRefreshCoordinator() {
  const surfaceRefreshAt = new Map<string, number>();
  const draftRefreshAt = new Map<string, number>();
  const previousDraftSignatureByChannel = new Map<string, string | null>();
  let previousSurfaceKey: string | null = null;

  return {
    requestSurfaceKeyEntry(input: {
      surfaceKey: string | null;
      now?: number;
    }): boolean {
      const nextKey = input.surfaceKey;
      if (!nextKey) {
        previousSurfaceKey = nextKey;
        return false;
      }
      const now = input.now ?? Date.now();
      const shouldRefresh = shouldRefreshWorkspaceAssistSurface({
        previousKey: previousSurfaceKey,
        nextKey,
        now,
        lastRefreshedAtByKey: surfaceRefreshAt,
      });
      previousSurfaceKey = nextKey;
      if (shouldRefresh) {
        surfaceRefreshAt.set(nextKey, now);
      }
      return shouldRefresh;
    },
    requestDraftChange(input: WorkspaceAssistDraftRefreshInput & { now?: number }): boolean {
      const previousSignature = previousDraftSignatureByChannel.get(input.channelId) ?? null;
      const nextSignature = workspaceAssistDraftRefreshSignature({
        surfaceKey: input.surfaceKey,
        documentTitle: input.documentTitle,
        filePath: input.filePath,
        text: input.text,
      });
      const now = input.now ?? Date.now();
      const shouldRefresh = shouldRefreshWorkspaceAssistDraft({
        previousSignature,
        nextSignature,
        now,
        lastRefreshedAtBySignature: draftRefreshAt,
      });
      previousDraftSignatureByChannel.set(input.channelId, nextSignature);
      if (shouldRefresh && nextSignature) {
        draftRefreshAt.set(nextSignature, now);
      }
      return shouldRefresh;
    },
    resetDraftChannel(channelId: string) {
      previousDraftSignatureByChannel.delete(channelId);
    },
  };
}

export function buildWorkspaceAssistRecentTitlesFromDashboard(
  payload: WorkspaceAssistDashboardPayload | null,
): string[] {
  if (!payload) return [];
  return dedupeLines([
    payload.continuity_priority_card?.title,
    payload.continuity_brief?.title,
    ...(payload.continuity_context_pack_items ?? []).map((item) => item.title),
    ...((payload.thread_summaries ?? []).slice(0, 3).map((item) => item.title)),
  ]);
}

export function buildWorkspaceAssistCandidatesFromDashboard(
  payload: WorkspaceAssistDashboardPayload | null,
  options?: {
    refreshOrigin?: WorkspaceAssistRefreshOrigin | null;
  },
): WorkspaceAssistCandidate[] {
  if (!payload) return [];
  const refreshOrigin = options?.refreshOrigin ?? 'cached';

  const candidates: WorkspaceAssistCandidate[] = [
    ...((payload.continuity_context_pack_items ?? []).map((item) => ({
      status: 'context_ready' as const,
      artifact_kind: 'context_pack' as const,
      freshness_score: workspaceAssistFreshnessScore({
        origin: refreshOrigin,
        artifactKind: 'context_pack',
      }),
      title: item.title,
      summary: item.summary,
      confidence: item.confidence,
      destination_view: 'home',
      detail_lines: [item.why_surfaced],
      labels: [
        ...(item.reference_labels ?? []),
        ...(item.object_labels ?? []),
        ...(item.file_labels ?? []),
      ],
      hints: item.evidence_kinds?.map((kind) => `Evidence: ${kind}`) ?? [],
    }))),
    ...((payload.continuity_prepared_draft_items ?? []).map((item) => ({
      status: 'draft_ready' as const,
      artifact_kind: 'prepared_draft' as const,
      freshness_score: workspaceAssistFreshnessScore({
        origin: refreshOrigin,
        artifactKind: 'prepared_draft',
      }),
      title: item.title,
      summary: item.summary,
      confidence: item.confidence,
      destination_view:
        item.draft_class === 'communication_reply' ? 'response_queue' : 'decision_queue',
      detail_lines: [item.suggested_action],
      labels: item.object_labels ?? [],
      hints: [item.response_due_hint, item.selection_reason]
        .filter((value): value is string => Boolean(value)),
    }))),
    ...((payload.continuity_response_items ?? [])
      .filter((item) => item.prepared_draft_available)
      .map((item) => {
        const summary =
          responseItemPreparedDraftLeadSummary(item)
          ?? item.prepared_draft_summary
          ?? item.title;
        const detailLines = responseItemPreparedDraftSupportingSummaryLines(item);
        return {
          status: 'draft_ready' as const,
          artifact_kind: 'response_draft' as const,
          freshness_score: workspaceAssistFreshnessScore({
            origin: refreshOrigin,
            artifactKind: 'response_draft',
          }),
          title: item.title,
          summary,
          destination_view: 'response_queue',
          detail_lines: detailLines,
          labels: responseItemPreparedDraftAnchorLabels(item),
          hints: [item.response_due_hint, item.prepared_draft_selection_reason]
            .filter((value): value is string => Boolean(value)),
        };
      })),
  ];

  if (payload.continuity_brief) {
    candidates.push({
      status: 'brief_ready',
      artifact_kind: 'continuity_brief',
      freshness_score: workspaceAssistFreshnessScore({
        origin: refreshOrigin,
        artifactKind: 'continuity_brief',
      }),
      title: payload.continuity_brief.title,
      summary: payload.continuity_priority_card?.description ?? payload.continuity_brief.title,
      destination_view: 'home',
      detail_lines: payload.continuity_brief.suggested_actions ?? [],
      labels: payload.continuity_priority_card?.object_labels ?? [],
      hints: [payload.continuity_primary_mode].filter((value): value is string => Boolean(value)),
    });
  }

  return candidates;
}

const WORKSPACE_ASSIST_CURRENT_SIGNAL_PATTERN =
  /\b(latest|current|today|tomorrow|tonight|this week|this month|this quarter|this year|news|pricing|price|market|release|rollout|launch|docs|documentation|api|sdk|regulation|law|policy|weather|stock|earnings|update)\b/i;

const WORKSPACE_ASSIST_EXTERNAL_SIGNAL_PATTERN =
  /\b(https?:\/\/|www\.|api|sdk|docs|documentation|vendor|supplier|customer|client|competitor|market|pricing|price|regulation|law|policy|weather|stock|earnings|release|rollout|launch|news)\b/i;

function workspaceAssistLooksExternalCurrent(input: {
  label: string;
  documentTitle: string;
  editorLine: string | null;
  recentTitle: string | null | undefined;
  filePath: string;
}): boolean {
  const joined = [
    input.label,
    input.documentTitle,
    input.editorLine ?? '',
    normalizeWhitespace(input.recentTitle ?? ''),
  ]
    .filter(Boolean)
    .join(' ');

  if (!joined) return false;
  if (input.filePath) return false;
  return (
    WORKSPACE_ASSIST_CURRENT_SIGNAL_PATTERN.test(joined)
    && WORKSPACE_ASSIST_EXTERNAL_SIGNAL_PATTERN.test(joined)
  );
}

export function detectWorkspaceAssistTopic(
  input: WorkspaceAssistTopicInput,
): WorkspaceAssistTopic | null {
  const recentTitle = (input.recent_activity_titles ?? []).find((value) => normalizeWhitespace(value ?? ''));
  const editorLine = firstMeaningfulEditorLine(input.editor_text);
  const selectedText = normalizeWhitespace(input.selected_text ?? '');
  const documentTitle = normalizeWhitespace(input.document_title ?? '');
  const filePath = normalizeWhitespace(input.file_path ?? '');
  const fileLabel = filePath ? humanizeWorkspaceToken(basenameFromPath(filePath)) : '';
  const label =
    selectedText ||
    documentTitle ||
    fileLabel ||
    editorLine ||
    normalizeWhitespace(recentTitle ?? '');
  if (!label) return null;

  const evidence = dedupeLines([
    input.app_label ? `App: ${input.app_label}` : null,
    selectedText ? `Selection: ${selectedText}` : null,
    documentTitle ? `Title: ${documentTitle}` : null,
    filePath ? `File: ${filePath}` : null,
    editorLine ? `Editor: ${editorLine}` : null,
    recentTitle ? `Recent: ${recentTitle}` : null,
  ]);
  const keywords = Array.from(
    new Set(
      [
        ...tokenizeWorkspaceTopic(label),
        ...tokenizeWorkspaceTopic(documentTitle),
        ...tokenizeWorkspaceTopic(fileLabel),
        ...tokenizeWorkspaceTopic(editorLine ?? ''),
        ...tokenizeWorkspaceTopic(recentTitle ?? ''),
      ],
    ),
  );
  return {
    label,
    evidence,
    keywords,
    looks_external_current: workspaceAssistLooksExternalCurrent({
      label,
      documentTitle,
      editorLine,
      recentTitle,
      filePath,
    }),
    research_query: label,
  };
}

function candidateSearchText(candidate: WorkspaceAssistCandidate): string {
  return [
    candidate.title,
    candidate.summary,
    ...(candidate.detail_lines ?? []),
    ...(candidate.labels ?? []),
    ...(candidate.hints ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

export function selectWorkspaceAssistSuggestion(input: {
  topic: WorkspaceAssistTopic | null;
  candidates: WorkspaceAssistCandidate[];
}): WorkspaceAssistSuggestion | null {
  const { topic } = input;
  if (!topic || topic.keywords.length === 0) return null;

  const ranked = input.candidates
    .map((candidate) => {
      const haystack = candidateSearchText(candidate);
      const matchedKeywords = topic.keywords.filter((keyword) =>
        tokenizeWorkspaceTopic(haystack).includes(keyword),
      );
      const exactTopicMatch =
        normalizeWhitespace(haystack).toLowerCase().includes(topic.label.toLowerCase()) ? 2 : 0;
      const statusBonus =
        candidate.status === 'context_ready' ? 2 : candidate.status === 'draft_ready' ? 1 : 0;
      const baseScore = matchedKeywords.length + exactTopicMatch + statusBonus;
      const freshnessScore = Math.max(0, candidate.freshness_score ?? 0);
      const score = baseScore + freshnessScore;
      return { candidate, matchedKeywords, baseScore, freshnessScore, score };
    })
    .filter((entry) => entry.baseScore > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.baseScore - left.baseScore
      || right.freshnessScore - left.freshnessScore,
    );

  const winner = ranked[0];
  const hasGroundedLocalCandidate = ranked.some((entry) =>
    entry.baseScore >= 2
    && entry.candidate.artifact_kind !== 'continuity_brief',
  );
  if (topic.looks_external_current && !hasGroundedLocalCandidate) {
    const researchQuery = topic.research_query?.trim() || topic.label;
    const detailLines = dedupeLines([
      `Suggested query: ${researchQuery}`,
      winner
        ? `Local continuity only surfaced a weak ${winner.candidate.status.replace('_', ' ')} match.`
        : 'No strong local continuity match is available yet.',
      'Gather fresh web sources before acting on this external, time-sensitive topic.',
    ]).slice(0, 3);
    return {
      status: 'brief_ready',
      artifact_kind: 'research_prompt',
      title: `Research current ${topic.label}`,
      summary:
        'Local continuity is thin for this external, current topic. Review fresh sources before relying on older context.',
      detail_lines: detailLines,
      destination_view: 'search',
      research_query: researchQuery,
      topic_label: topic.label,
      topic_evidence: topic.evidence,
      matched_keywords: topic.keywords.slice(0, 4),
    };
  }
  if (!winner) return null;

  const detailLines = dedupeLines([
    ...(winner.candidate.detail_lines ?? []),
    ...(winner.candidate.hints ?? []),
    ...(winner.candidate.labels ?? []).slice(0, 2).map((label) => `Linked: ${label}`),
  ]).slice(0, 3);

  return {
    status: winner.candidate.status,
    artifact_kind: winner.candidate.artifact_kind,
    title: winner.candidate.title,
    summary: winner.candidate.summary?.trim() || winner.candidate.title,
    detail_lines: detailLines,
    confidence: winner.candidate.confidence,
    destination_view: winner.candidate.destination_view,
    research_query: winner.candidate.research_query,
    topic_label: topic.label,
    topic_evidence: topic.evidence,
    matched_keywords: winner.matchedKeywords,
  };
}
