export interface ThreadSummaryLike {
  thread_id: string;
  title?: string | null;
}

export interface ContinuityMessageLike {
  id: string;
  thread_id: string;
  type?: string | null;
  subtype?: string | null;
  content?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface WatcherSignalLike {
  id: string;
  signal_key: string;
  category: string;
  freshness: string;
  urgency: string;
  confidence: string;
  urgency_hint?: string | null;
  suppression_status?: string | null;
  suppression_reason?: string | null;
  escalation_status?: string | null;
  escalation_reason?: string | null;
  decrypt_needed?: boolean | null;
  source_type: string;
  source_subtype: string;
  thread_id: string;
  source_refs: string[];
}

export interface ContinuityDecisionContextItem {
  type: 'email' | 'calendar' | 'note' | 'person';
  icon: string;
  title: string;
  snippet?: string;
  time?: string;
  sourceType?: 'thread' | 'email' | 'note';
  sourceRefs?: string[];
  relationPath?: string[];
}

export interface ContinuityObjectSearchTarget {
  query: string;
  focusObjectId?: string;
}

export interface ContinuityPriorityDecision {
  id: string;
  urgency: 'urgent' | 'high';
  title: string;
  context: string;
  impact: 'high';
  effort: string;
  durationScope: 'day';
  confidence: number;
  confidenceReason: string;
  whyBullets: Array<{ icon: string; text: string }>;
  whyMatters: string;
  contextItems?: ContinuityDecisionContextItem[];
  options: Array<{
    id: string;
    label: string;
    detail?: string;
    aiRecommended?: boolean;
  }>;
}

export interface ApprovalDraftPreview {
  label?: string | null;
  content?: string | null;
  content_type?: 'text' | 'code' | string | null;
}

export interface ApprovalReviewLike {
  title?: string | null;
  reason?: string | null;
  confidence?: string | null;
  provenance_summary?: string | null;
  consequence_summary_lines?: string[] | null;
  source_refs?: string[] | null;
  approval_kind?: string | null;
  autonomy_decision?: AutonomyDecisionLike | null;
  draft_preview?: ApprovalDraftPreview | null;
}

export interface StateFieldLike {
  status?: string | null;
  field_key?: string | null;
  surface_hint?: string | null;
  evidence_refs?: string[] | null;
}

export interface AutonomyDecisionLike {
  autonomy_level?: string | null;
  action_autonomy?: string | null;
  reversibility?: string | null;
  consequence_level?: string | null;
  confidence?: string | null;
  approval_required?: boolean | null;
  interruption_budget?: string | null;
  reason?: string | null;
}

function trimmedContinuityString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizedAutonomyLevel(autonomyDecision: AutonomyDecisionLike): string | null {
  const explicitLevel = trimmedContinuityString(autonomyDecision.autonomy_level)?.toLowerCase();
  if (explicitLevel) return explicitLevel;

  const actionAutonomy = trimmedContinuityString(autonomyDecision.action_autonomy)?.toLowerCase();
  switch (actionAutonomy) {
    case 'silent':
      return 'prepare_silently';
    case 'soft_confirm':
      return 'execute_reversible';
    case 'hard_confirm':
      return 'request_approval';
    default:
      break;
  }

  if (autonomyDecision.approval_required === true) return 'request_approval';
  return null;
}

function autonomyLevelSummaryLabel(level: string): string {
  switch (level) {
    case 'observe_only':
      return 'observe only';
    case 'prepare_silently':
      return 'prepare silently';
    case 'draft_silently':
      return 'draft silently';
    case 'suggest_with_artifact':
      return 'suggest with artifact';
    case 'execute_reversible':
      return 'execute reversible';
    case 'execute_irreversible':
      return 'execute irreversible';
    case 'request_approval':
      return 'Approval boundary';
    case 'ask_always':
      return 'ask always';
    case 'notify_then_act':
      return 'notify then act';
    case 'auto_execute':
      return 'auto execute';
    default:
      return level.replaceAll('_', ' ');
  }
}

export const CONTINUITY_PRIORITY_DECISION_ID = 'continuity-priority-card';
export const CONTINUITY_ACTION_DECISION_PREFIX = 'continuity-action:';

type ContinuityRefKind = 'thread' | 'message' | 'calendar' | 'file';

interface NormalizedContinuityRef {
  kind: ContinuityRefKind;
  value: string;
}

function normalizeContinuityRef(sourceRef: string): NormalizedContinuityRef | null {
  const raw = sourceRef.trim();
  if (!raw) return null;
  if (raw.startsWith('calendar:')) {
    const value = raw.slice('calendar:'.length).trim();
    return value ? { kind: 'calendar', value } : null;
  }
  if (raw.startsWith('file:')) {
    const value = raw.slice('file:'.length).trim();
    return value ? { kind: 'file', value } : null;
  }
  for (const prefix of ['thread:', 'conversation:']) {
    if (raw.startsWith(prefix)) {
      const value = raw.slice(prefix.length).trim();
      return value ? { kind: 'thread', value } : null;
    }
  }
  for (const prefix of ['message:', 'msg:', 'email:', 'note:']) {
    if (raw.startsWith(prefix)) {
      const value = raw.slice(prefix.length).trim();
      return value ? { kind: 'message', value } : null;
    }
  }
  return { kind: 'message', value: raw };
}

function humanizeContinuityRef(ref: NormalizedContinuityRef): string {
  if (ref.kind === 'calendar') {
    return 'Calendar';
  }
  if (ref.kind === 'file') {
    const normalizedPath = ref.value.replaceAll('\\', '/').trim();
    const filename = normalizedPath.split('/').filter(Boolean).at(-1) ?? normalizedPath;
    return filename || 'File';
  }
  const cleaned = ref.value
    .replaceAll(/[-_]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return ref.kind === 'thread' ? 'Thread' : 'Object';
  }
  if (ref.kind === 'thread') return `Thread: ${cleaned}`;
  return `Object: ${cleaned}`;
}

function messageDisplayTitle(message: ContinuityMessageLike): string | null {
  const contentTitle =
    typeof message.content?.title === 'string' ? message.content.title.trim() : '';
  if (contentTitle) return contentTitle;
  const metadataTitle =
    typeof message.metadata?.title === 'string' ? message.metadata.title.trim() : '';
  if (metadataTitle) return metadataTitle;
  const contentName =
    typeof message.content?.name === 'string' ? message.content.name.trim() : '';
  if (contentName) return contentName;
  return null;
}

export function resolveContinuityTargetLabel(input: {
  linked_target_label?: string | null;
  reference_labels?: string[] | null;
  object_labels?: string[] | null;
  file_labels?: string[] | null;
  source_refs?: string[] | null;
  reference_refs?: string[] | null;
  object_refs?: string[] | null;
  file_refs?: string[] | null;
  messages?: ContinuityMessageLike[] | null;
  thread_summaries?: ThreadSummaryLike[] | null;
}): string | null {
  if (input.linked_target_label?.trim()) {
    return input.linked_target_label.trim();
  }
  const explicitReferenceLabel = (input.reference_labels ?? []).find((label) => label.trim());
  if (explicitReferenceLabel?.trim()) {
    return explicitReferenceLabel.trim();
  }
  const explicitObjectLabel = (input.object_labels ?? []).find((label) => label.trim());
  if (explicitObjectLabel?.trim()) {
    return explicitObjectLabel.trim();
  }
  const explicitFileLabel = (input.file_labels ?? []).find((label) => label.trim());
  if (explicitFileLabel?.trim()) {
    return explicitFileLabel.trim();
  }

  const candidates = [
    ...(input.reference_refs ?? []),
    ...(input.object_refs ?? []),
    ...(input.file_refs ?? []),
    ...(input.source_refs ?? []),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeContinuityRef(candidate);
    if (!normalized) continue;
    if (normalized.kind === 'thread') {
      const threadTitle = (input.thread_summaries ?? []).find(
        (summary) => summary.thread_id === normalized.value,
      )?.title;
      if (threadTitle?.trim()) return threadTitle.trim();
    }
    if (normalized.kind === 'message') {
      const message = (input.messages ?? []).find(
        (item) => item.id === normalized.value || item.thread_id === normalized.value,
      );
      const resolvedTitle = message ? messageDisplayTitle(message) : null;
      if (resolvedTitle) return resolvedTitle;
      const threadTitle = (input.thread_summaries ?? []).find(
        (summary) => summary.thread_id === normalized.value,
      )?.title;
      if (threadTitle?.trim()) return threadTitle.trim();
    }
    return humanizeContinuityRef(normalized);
  }
  return null;
}

export function summarizeReferenceLabels(input: {
  reference_labels?: string[] | null;
  object_labels?: string[] | null;
  reference_refs?: string[] | null;
  object_refs?: string[] | null;
  limit?: number;
  prefix?: string;
}): string | null {
  const labels = [...(input.reference_labels ?? []), ...(input.object_labels ?? [])].filter(
    (label) => label.trim(),
  );
  const refs = [...(input.reference_refs ?? []), ...(input.object_refs ?? [])].filter((ref) =>
    ref.trim(),
  );
  const values = labels.length > 0 ? labels : refs;
  if (values.length === 0) return null;
  const limit = Math.max(1, input.limit ?? 2);
  const visible = values.slice(0, limit);
  const suffix = values.length > limit ? ', ...' : '.';
  const prefix = input.prefix?.trim() || 'Linked objects';
  return `${prefix}: ${visible.join(', ')}${suffix}`;
}

export function sourceCountSummary(sourceRefs: string[] | null | undefined): string | null {
  const count = sourceRefs?.length ?? 0;
  if (count <= 0) return null;
  return `Based on ${count} source${count === 1 ? '' : 's'}`;
}

export function approvalReviewKindLabel(approvalKind: string | null | undefined): string | null {
  const normalized = (approvalKind ?? '').trim().toLowerCase();
  if (!normalized) return null;
  switch (normalized) {
    case 'send':
      return 'Send approval';
    case 'publish':
      return 'Publish approval';
    case 'booking':
      return 'Booking approval';
    case 'destructive':
      return 'Destructive approval';
    case 'purchase':
      return 'Purchase approval';
    case 'submit':
      return 'Submission approval';
    case 'review':
      return 'Approval review';
    default:
      return `${normalized.replaceAll('_', ' ')} approval`;
  }
}

export function approvalDecisionLabel(
  decision: 'approved' | 'rejected',
  context?:
    | 'generic'
    | 'export_generation'
    | 'outbound_send'
    | 'change_proposal'
    | 'change_set',
): string {
  if (decision === 'rejected') return 'Reject';
  if (context === 'export_generation') return 'Approve & generate';
  if (context === 'outbound_send') return 'Approve & send';
  if (context === 'change_proposal') return 'Apply changes';
  if (context === 'change_set') return 'Apply selected edits';
  return 'Approve';
}

export function approvalDecisionActionTitle(
  decision: 'approved' | 'rejected',
  context?:
    | 'generic'
    | 'export_generation'
    | 'outbound_send'
    | 'change_proposal'
    | 'change_set',
): string {
  if (decision === 'rejected') {
    return 'Reject and stop this work before it continues.';
  }
  if (context === 'export_generation') {
    return 'Approve and generate this export file.';
  }
  if (context === 'outbound_send') {
    return 'Approve and send this message.';
  }
  if (context === 'change_proposal') {
    return 'Apply this proposed change to your workspace.';
  }
  if (context === 'change_set') {
    return 'Apply the selected coordinated edits to your workspace.';
  }
  return 'Approve and let this work continue.';
}

export function approvalPendingStatusLabel(): string {
  return 'Awaiting your approval';
}

export function approvalPendingCountSummary(
  count: number,
  noun = 'task',
): string {
  const safeCount = Math.max(0, Math.floor(count));
  const label = safeCount === 1 ? noun : `${noun}s`;
  return `${safeCount} ${label} awaiting your approval`;
}

export function approvalRequestTitle(
  context: 'generic' | 'shell_command' = 'generic',
): string {
  if (context === 'shell_command') return 'Shell command requires your approval';
  return 'Approval required';
}

export function approvalContinuationSummary(
  context: 'work' | 'branch' = 'work',
): string {
  if (context === 'branch') return 'Approval required before this branch can continue.';
  return 'Approval required before this work can continue.';
}

export function approvalRequiredStatusLabel(): string {
  return 'Needs approval';
}

export function approvalEventLabel(
  event: 'request' | 'approved' | 'rejected',
): string {
  if (event === 'request') return 'Awaiting approval';
  if (event === 'approved') return 'Approval granted';
  return 'Approval rejected';
}

export function approvalModeLabel(mode?: string): string {
  if (mode === 'autonomous') return 'Autonomous';
  if (mode === 'suggest_only') return 'Suggest only';
  if (mode === 'human_approval_required') return 'Requires approval';
  return (mode ?? '').replace(/_/g, ' ') || 'Unknown';
}

export function approvalStatusLabel(status?: string): string {
  if (!status) return 'Pending';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'pending') return 'Pending';
  return status.replace(/_/g, ' ');
}

export function approvalOptionLabel(optionId?: string): string {
  if (optionId === 'approved' || optionId === 'rejected') {
    return approvalDecisionLabel(optionId);
  }
  return (optionId ?? '').replace(/_/g, ' ');
}

export function approvalOptionActionTitle(optionId?: string): string | undefined {
  if (optionId === 'approved' || optionId === 'rejected') {
    return approvalDecisionActionTitle(optionId);
  }
  return undefined;
}

export function approvalDecisionResultSummary(input: {
  decision: 'approved' | 'rejected';
  context?:
    | 'generic'
    | 'queued_execution'
    | 'shell_command'
    | 'outbound_send'
    | 'export_generation'
    | 'change_proposal'
    | 'change_set';
}): string {
  const context = input.context ?? 'generic';
  if (input.decision === 'approved') {
    if (context === 'queued_execution') {
      return 'Approved and queued for execution.';
    }
    if (context === 'shell_command') {
      return 'Command approved. Results will appear below when the command completes.';
    }
    if (context === 'outbound_send') {
      return 'Approved and sent on your behalf.';
    }
    if (context === 'export_generation') {
      return 'Approved and generated the export file.';
    }
    if (context === 'change_proposal') {
      return 'Applied the proposed change to your workspace.';
    }
    if (context === 'change_set') {
      return 'Applied the selected edits to your workspace.';
    }
    return 'Approved. The work can continue.';
  }
  if (context === 'shell_command') {
    return 'Command rejected. The agent will stop and report back.';
  }
  if (context === 'outbound_send') {
    return 'Send rejected. The draft is kept for your review.';
  }
  if (context === 'export_generation') {
    return 'Export rejected. Nothing was generated.';
  }
  if (context === 'change_proposal') {
    return 'Change rejected. Nothing was applied.';
  }
  if (context === 'change_set') {
    return 'Change set rejected. Nothing was applied.';
  }
  return 'Rejected. The work stops and the agent reports back.';
}

export function autonomyDecisionSummary(
  autonomyDecision: AutonomyDecisionLike | null | undefined,
): string | null {
  if (!autonomyDecision) return null;
  const level = normalizedAutonomyLevel(autonomyDecision);
  const reason = trimmedContinuityString(autonomyDecision.reason);
  if (level === 'request_approval') {
    return reason
      ? `Approval boundary: ${reason}`
      : 'Approval boundary identified by the autonomy policy.';
  }
  if (level) {
    const label = autonomyLevelSummaryLabel(level);
    return reason ? `${label}: ${reason}` : label;
  }
  return reason ?? null;
}

export function approvalReviewDetailLines(input: {
  approvalReview?: ApprovalReviewLike | null;
  autonomyDecision?: AutonomyDecisionLike | null;
  fallbackReason?: string | null;
}): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    lines.push(trimmed);
  };

  push(input.approvalReview?.reason ?? input.fallbackReason);
  push(input.approvalReview?.provenance_summary);
  push(sourceCountSummary(input.approvalReview?.source_refs));
  for (const line of input.approvalReview?.consequence_summary_lines ?? []) {
    push(line);
  }
  push(autonomyDecisionSummary(input.autonomyDecision ?? input.approvalReview?.autonomy_decision));
  return lines;
}

export function approvalReviewTrustSummary(
  approvalReview: ApprovalReviewLike | null | undefined,
): string | null {
  if (!approvalReview) return null;
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    parts.push(trimmed);
  };

  push(sourceCountSummary(approvalReview.source_refs));
  push(approvalReview.provenance_summary);
  push(approvalReview.consequence_summary_lines?.[0] ?? null);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function approvalDraftPreviewLines(
  preview: ApprovalDraftPreview | null | undefined,
): string[] {
  if (!preview?.content || preview.content_type === 'code') return [];
  const content = preview.content;
  const normalizedContent = [
    ' | ',
    ' \u2022 ',
    ' â€¢ ',
    ' Ã¢â‚¬Â¢ ',
    ' Ã¢â‚¬Â¢ ',
    ' ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ',
  ].reduce(
    (content, separator) => content.replaceAll(separator, '\n'),
    content,
  );
  return normalizedContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  /* legacy fallback removed
  return content
    .split(/\s(?:\||\u2022|â€¢|Ã¢â‚¬Â¢)\s/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  */
}

export function approvalDraftPreviewSummary(input: {
  draft_preview?: ApprovalDraftPreview | null;
  maxLength?: number;
}): string | null {
  const preview = input.draft_preview;
  if (!preview?.content) return null;
  const maxLength =
    input.maxLength
    ?? (preview.content_type === 'code' ? 96 : 140);
  const normalized =
    preview.content_type === 'code'
      ? preview.content.replace(/\s+/g, ' ').trim()
      : approvalDraftPreviewLines(preview).join(' ').trim() || preview.content.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeEvidenceKindLabel(kind: string): string {
  return kind.replaceAll('_', ' ');
}

export function evidenceKindsSummary(
  evidenceKinds: string[] | null | undefined,
): string | null {
  const kinds = (evidenceKinds ?? []).filter(Boolean);
  if (kinds.length === 0) return null;
  return `Evidence spans ${kinds.slice(0, 3).map(normalizeEvidenceKindLabel).join(', ')}.`;
}

function isImmediateDueHint(value: string | null | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('today') ||
    normalized.includes('within 24h') ||
    normalized.includes('24h') ||
    normalized.includes('asap') ||
    normalized.includes('eod')
  );
}

function isTomorrowDueHint(value: string | null | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes('tomorrow');
}

export function boundedReasonSummary(input: {
  kind?: string | null;
  pack_kind?: string | null;
  draft_class?: string | null;
  urgency?: string | null;
  response_due_hint?: string | null;
  selection_reason?: string | null;
}): string | null {
  const selectionReason = input.selection_reason?.trim() ?? '';
  const normalizedReason = selectionReason.toLowerCase();
  if (isTomorrowDueHint(input.response_due_hint)) {
    if (input.draft_class === 'meeting_brief' || normalizedReason.includes('meeting')) {
      return 'Meeting tomorrow.';
    }
    return 'Due tomorrow.';
  }
  if (isImmediateDueHint(input.response_due_hint) || input.urgency === 'today') {
    return 'Due today.';
  }
  if (
    normalizedReason.includes('reactivated')
    || normalizedReason.includes('follow-up chain')
    || input.draft_class === 'follow_up_draft'
  ) {
    return 'Follow-up chain reactivated.';
  }
  if (selectionReason) return selectionReason;
  if (input.kind === 'context_pack' && input.pack_kind === 'obligation_pack') {
    return 'High queue pressure.';
  }
  return null;
}

export function hasDistinctReasonSummary(
  selectionReason: string | null | undefined,
  boundedReason: string | null | undefined,
): boolean {
  const normalizedSelectionReason = selectionReason?.trim().toLowerCase() ?? '';
  const normalizedBoundedReason = boundedReason?.trim().toLowerCase() ?? '';
  if (!normalizedSelectionReason) return false;
  if (!normalizedBoundedReason) return true;
  return normalizedSelectionReason !== normalizedBoundedReason;
}

export function provenanceCueSummary(input: {
  kind?: string | null;
  pack_kind?: string | null;
  draft_class?: string | null;
  source_refs?: string[] | null;
  object_refs?: string[] | null;
  object_labels?: string[] | null;
  evidence_kinds?: string[] | null;
}): string | null {
  const sourceCount = input.source_refs?.length ?? 0;
  const objectCount =
    (input.object_labels?.filter((label) => label.trim()).length ?? 0)
    || (input.object_refs?.filter((ref) => ref.trim()).length ?? 0);
  const evidenceCount = input.evidence_kinds?.length ?? 0;
  if (input.kind === 'context_pack' || input.pack_kind) {
    if (evidenceCount > 0) {
      return 'Traceable to grouped continuity evidence in append-only artifacts.';
    }
    if (sourceCount > 0) {
      return 'Traceable to grouped continuity sources in the append-only ledger.';
    }
  }
  if (input.draft_class === 'comparison_table' || input.draft_class === 'decision_memo') {
    return sourceCount > 0
      ? 'Traceable to the decision evidence used to prepare this artifact.'
      : null;
  }
  if (input.draft_class) {
    return sourceCount > 0
      ? 'Traceable to the continuity artifacts used to prepare this draft.'
      : null;
  }
  if (objectCount > 0) {
    return sourceCount > 0
      ? 'Traceable to append-only continuity artifacts anchored to linked objects.'
      : 'Traceable to linked object anchors in append-only continuity artifacts.';
  }
  if (sourceCount > 0) {
    return 'Traceable to append-only continuity artifacts.';
  }
  return null;
}

export function consequencePreviewSummary(input: {
  kind?: string | null;
  pack_kind?: string | null;
  draft_class?: string | null;
  requires_approval?: boolean | null;
  readiness?: string | null;
  response_due_hint?: string | null;
}): string | null {
  if (input.kind === 'context_pack' || input.pack_kind) {
    return 'Opening this reveals grouped context only; it does not trigger an external action.';
  }
  if (input.requires_approval) {
    return 'Acting now opens a review step first; no external action runs without approval.';
  }
  if (input.draft_class === 'comparison_table' || input.draft_class === 'decision_memo') {
    return 'Acting now opens prepared decision support without committing to a final action.';
  }
  if (input.draft_class === 'communication_reply') {
    return 'Acting now opens a prepared reply for review; sending remains explicitly gated.';
  }
  if (input.draft_class === 'follow_up_draft') {
    return 'Acting now resumes the follow-up context before any outbound step is taken.';
  }
  if (input.draft_class === 'project_prep_note' || input.draft_class === 'meeting_brief') {
    return 'Acting now opens prepared context for review rather than executing a side effect.';
  }
  if (input.readiness === 'ready_now' || isImmediateDueHint(input.response_due_hint)) {
    return 'Acting now opens the prepared item immediately for review.';
  }
  return null;
}

export function priorityRationaleSummary(input: {
  kind?: string | null;
  pack_kind?: string | null;
  draft_class?: string | null;
  requires_approval?: boolean | null;
  readiness?: string | null;
  response_due_hint?: string | null;
  source_refs?: string[] | null;
  reference_refs?: string[] | null;
  object_refs?: string[] | null;
  object_labels?: string[] | null;
}): string | null {
  if (input.requires_approval) {
    return 'Prioritized because it crosses an approval boundary.';
  }
  if (input.kind === 'context_pack' && input.pack_kind === 'obligation_pack') {
    return 'Prioritized because it bundles related obligations into one review point.';
  }
  if (input.kind === 'context_pack' && (input.reference_refs?.length ?? 0) > 0) {
    return 'Prioritized because linked objects reinforce the same active topic.';
  }
  if ((input.object_labels?.length ?? 0) > 0 || (input.object_refs?.length ?? 0) > 0) {
    return 'Prioritized because object-linked continuity reinforces the same active work item.';
  }
  if (input.kind === 'context_pack' && input.pack_kind === 'topic_pack') {
    return 'Prioritized because it groups one active topic across related evidence.';
  }
  if (input.draft_class === 'comparison_table' || input.draft_class === 'decision_memo') {
    return 'Prioritized because it reduces judgment overhead before interruption.';
  }
  if (
    input.draft_class === 'communication_reply' &&
    (input.readiness === 'ready_now' || isImmediateDueHint(input.response_due_hint))
  ) {
    return 'Prioritized because a reply is due soon and already prepared.';
  }
  if (input.draft_class === 'follow_up_draft') {
    return 'Prioritized because continuity suggests an active follow-up chain.';
  }
  if (input.draft_class === 'project_prep_note') {
    return 'Prioritized because project continuity is stronger than a standalone reply.';
  }
  if (input.draft_class === 'meeting_brief') {
    return 'Prioritized because prepared context can remove coordination drag before the meeting.';
  }
  if ((input.source_refs?.length ?? 0) >= 3) {
    return 'Prioritized because multiple continuity sources point to the same need.';
  }
  return null;
}

const DECISION_SUPPORT_DRAFT_CLASSES = new Set(['comparison_table', 'decision_memo']);

const PREP_DRAFT_LABELS: Record<string, string> = {
  communication_reply: 'reply draft',
  comparison_table: 'comparison',
  decision_memo: 'decision memo',
  follow_up_draft: 'follow-up draft',
  project_prep_note: 'project prep',
  meeting_brief: 'meeting brief',
};

export function preparedDraftClassLabel(draftClass: string): string {
  return PREP_DRAFT_LABELS[draftClass] ?? draftClass.replaceAll('_', ' ');
}

export function preparedDraftDestinationForItem(
  item: { draft_class: string },
): 'home' | 'decision_queue' | 'response_queue' {
  if (item.draft_class === 'communication_reply') return 'response_queue';
  if (DECISION_SUPPORT_DRAFT_CLASSES.has(item.draft_class)) return 'decision_queue';
  return 'home';
}

export function preparedDraftDestinationForItems(
  items: Array<{ draft_class: string }>,
): 'home' | 'decision_queue' | 'response_queue' {
  if (items.length === 0) return 'home';
  if (items.every((item) => item.draft_class === 'communication_reply')) {
    return 'response_queue';
  }
  if (items.some((item) => preparedDraftDestinationForItem(item) === 'decision_queue')) {
    return 'decision_queue';
  }
  return 'home';
}

export function preparedDraftActionLabel(
  items: Array<{ draft_class: string }>,
): string {
  const destination = preparedDraftDestinationForItems(items);
  if (destination === 'response_queue') return 'Open responses';
  if (destination === 'decision_queue') return 'Open decision queue';
  return 'Open workspace';
}

export function preparedDraftHeading(
  items: Array<{ draft_class: string }>,
): string {
  if (items.every((item) => item.draft_class === 'communication_reply')) {
    return 'Reply drafts ready for review';
  }
  if (items.some((item) => DECISION_SUPPORT_DRAFT_CLASSES.has(item.draft_class))) {
    return 'Prepared decision support ready for review';
  }
  if (items.some((item) => item.draft_class === 'meeting_brief')) {
    return 'Prepared briefs and drafts ready for review';
  }
  return 'Prepared artifacts ready for review';
}

export function preparedDraftIntro(
  items: Array<{ draft_class: string }>,
): string {
  const destination = preparedDraftDestinationForItems(items);
  if (destination === 'response_queue') {
    return 'Quietly prepared from current continuity state. Sending remains approval-gated.';
  }
  if (destination === 'decision_queue') {
    return 'Quietly prepared from current continuity state to reduce judgment overhead before interruption.';
  }
  return 'Quietly prepared from current continuity state using existing append-only artifacts.';
}

export function outcomeFeedbackLabel(
  feedback?: ContinuityOutcomeFeedbackLike | null,
): string | null {
  if (!feedback?.status) return null;
  const scope = feedback.scope === 'family' ? 'family' : 'exact';
  switch (feedback.status) {
    case 'reinforced':
      return scope === 'family' ? 'trusted family' : 'trusted';
    case 'trusted':
      return scope === 'family' ? 'trusted pattern' : 'trusted';
    case 'cooldown_recommended':
      return scope === 'family' ? 'family cooldown' : 'cooldown';
    case 'cautious':
      return 'caution';
    case 'suppressed':
      return 'suppressed';
    default:
      return feedback.status.replaceAll('_', ' ');
  }
}

export function outcomeFeedbackTone(
  feedback?: ContinuityOutcomeFeedbackLike | null,
): string {
  const status = feedback?.status;
  if (status === 'reinforced' || status === 'trusted') {
    return 'border-emerald-300/40 bg-emerald-50/85 text-emerald-800';
  }
  if (status === 'cooldown_recommended' || status === 'cautious') {
    return 'border-amber-300/40 bg-amber-50/85 text-amber-800';
  }
  if (status === 'suppressed') {
    return 'border-rose-300/40 bg-rose-50/85 text-rose-800';
  }
  return 'border-slate-200/80 bg-white/75 text-slate-600';
}

export function outcomeFeedbackDetail(
  feedback?: ContinuityOutcomeFeedbackLike | null,
): string | null {
  if (!feedback?.status) return null;
  const acceptancePct = Math.round((feedback.acceptance_rate ?? 0) * 100);
  if (
    feedback.scope === 'family' &&
    (feedback.status === 'cooldown_recommended' || feedback.status === 'cautious')
  ) {
    return `Similar variants were often dismissed (${acceptancePct}% acceptance), so this is surfaced more cautiously.`;
  }
  if (feedback.status === 'trusted' || feedback.status === 'reinforced') {
    return `This pattern has been accepted ${acceptancePct}% of the time.`;
  }
  if (feedback.status === 'cooldown_recommended') {
    return `Recent dismissals lowered priority for now (${acceptancePct}% acceptance).`;
  }
  return null;
}

export function outcomeFeedbackAdaptationDetail(
  feedback?: ContinuityOutcomeFeedbackLike | null,
): string | null {
  if (!feedback?.status) return null;
  const signals = Array.isArray(feedback.adaptation_signals)
    ? feedback.adaptation_signals.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : [];
  const delta =
    typeof feedback.threshold_delta === 'number' && Number.isFinite(feedback.threshold_delta)
      ? feedback.threshold_delta
      : null;
  const reason =
    typeof feedback.adaptation_reason === 'string' ? feedback.adaptation_reason : null;

  const thresholdLine =
    delta === null || Math.abs(delta) < 0.01
      ? null
      : delta > 0
        ? 'Adaptive feedback tightened the interruption threshold slightly.'
        : 'Adaptive feedback relaxed the interruption threshold slightly.';

  const reasonLine = (() => {
    switch (reason) {
      case 'suppression_active':
        return 'Adaptive suppression remains active for this pattern.';
      case 'cooldown_active':
        return 'Adaptive cooldown remains active for this pattern.';
      case 'trust_building':
        return 'Adaptive trust is building for this pattern.';
      case 'reinforced':
        return 'Adaptive trust is reinforced for this pattern.';
      default:
        return null;
    }
  })();

  const signalLine =
    signals.length > 0
      ? `Adjusted using live signals: ${signals.join(', ')}.`
      : null;

  const parts = [thresholdLine, signalLine, reasonLine].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

type PreparedDraftFeedbackSuggestion = {
  kind?: string | null;
  heuristic_family_id?: string | null;
  outcome_feedback?: unknown;
};

export type ContinuityOutcomeFeedbackLike = {
  status?: string | null;
  scope?: string | null;
  acceptance_rate?: number | null;
  adaptation_reason?: string | null;
  threshold_delta?: number | null;
  adaptation_signals?: string[] | null;
} & Record<string, unknown>;

export type ContinuityNavigationTarget =
  | { view: 'calendar' }
  | { view: 'threads'; threadId?: string; messageId?: string };

export function contextPackObjectSearchTarget(input: {
  pack_kind?: string | null;
  reference_refs?: string[] | null;
  object_refs?: string[] | null;
  file_refs?: string[] | null;
}): ContinuityObjectSearchTarget | null {
  const focusObjectId = (
    input.object_refs?.find((value) => value.trim())
    ?? input.reference_refs?.find((value) => value.trim())
    ?? input.file_refs?.find((value) => value.trim())
    ?? ''
  ).trim();
  if (focusObjectId) {
    return {
      query: `target:${focusObjectId}`,
      focusObjectId,
    };
  }
  return {
    query: input.pack_kind === 'obligation_pack' ? 'kind:task' : 'kind:note',
  };
}

function continuityDestinationLabel(value: string | null | undefined): string {
  switch (value) {
    case 'context_panel':
      return 'context panel';
    case 'decision_queue':
      return 'decision queue';
    case 'response_queue':
      return 'response queue';
    case 'agent_settings':
      return 'agent settings';
    case 'cost_dashboard':
      return 'cost dashboard';
    case 'knowledge_graph':
      return 'knowledge graph';
    case 'public_feed':
      return 'public feed';
    case 'space_feed':
      return 'space feed';
    case 'cofounder_studio':
      return 'cofounder studio';
    case 'connected_apps':
      return 'connected apps';
    case 'sovereignty_audit':
      return 'sovereignty audit';
    default:
      return value ? value.replaceAll('_', ' ') : 'home';
  }
}

type ContinuityContextPanelItemLike = {
  label: string;
  why_surfaced: string;
  relation_path: string[];
  source_refs: string[];
};

type ContinuityPriorityCardLike = {
  title: string;
  description: string;
  panel_kind: string;
  requires_approval: boolean;
  action_label: string;
  surface_hint?: string | null;
  confidence?: string | null;
  source_refs?: string[] | null;
  object_refs?: string[] | null;
  object_labels?: string[] | null;
};

type ContinuityActionItemLike = {
  id: string;
  title: string;
  category: string;
  urgency: string;
  confidence: string;
  requires_approval: boolean;
  suggested_action: string;
  surface_hint?: string | null;
  source_refs: string[];
};

function preparedDraftHeuristicFamilyId(item: { id: string }): string {
  const raw = item.id ?? '';
  const normalized = raw
    .replace(/^prepared_draft:/, '')
    .replace(/^draft:/, '')
    .trim();
  if (!normalized) return 'prepared_draft';
  const family = normalized.replace(/[-_][0-9]+$/g, '');
  return family || normalized;
}

export function preparedDraftOutcomeFeedbackForItem<
  TFeedback = ContinuityOutcomeFeedbackLike,
>(
  item: { id: string },
  proactiveSuggestions: PreparedDraftFeedbackSuggestion[],
): TFeedback | undefined {
  const familyId = preparedDraftHeuristicFamilyId(item);
  return proactiveSuggestions.find((suggestion) => {
    if (suggestion.kind !== 'prepared_draft') return false;
    return suggestion.heuristic_family_id === familyId;
  })?.outcome_feedback as TFeedback | undefined;
}

export function responseItemOutcomeFeedbackForItem<
  TFeedback = ContinuityOutcomeFeedbackLike,
>(
  item: { prepared_draft_id?: string | null; prepared_draft_available?: boolean | null },
  proactiveSuggestions: PreparedDraftFeedbackSuggestion[],
): TFeedback | undefined {
  if (!item.prepared_draft_available || !item.prepared_draft_id) return undefined;
  const familyId = preparedDraftHeuristicFamilyId({ id: item.prepared_draft_id });
  return proactiveSuggestions.find((suggestion) => {
    if (suggestion.kind !== 'prepared_draft') return false;
    return suggestion.heuristic_family_id === familyId;
  })?.outcome_feedback as TFeedback | undefined;
}

export function responseItemPreparedDraftLeadSummary(input: {
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_summary?: string | null;
  prepared_draft_object_refs?: string[] | null;
  prepared_draft_object_labels?: string[] | null;
  prepared_draft_thread_retrieval_state?: {
    summary?: string | null;
  } | null;
}): string | null {
  const explicitLeadSummary = input.prepared_draft_lead_summary?.trim();
  const explicitLines = (input.prepared_draft_summary_lines ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preferredStructuredLine = explicitLines.find((line) =>
    line.startsWith('Draft: ') || line.startsWith('Next action: '),
  );
  if (preferredStructuredLine) return preferredStructuredLine;
  if (explicitLeadSummary) return explicitLeadSummary;
  const summaryLine = explicitLines.find((line) => line.trim());
  if (summaryLine?.trim()) return summaryLine.trim();
  const retrievalSummary = input.prepared_draft_thread_retrieval_state?.summary?.trim();
  if (retrievalSummary) return retrievalSummary;
  return (
    summarizeReferenceLabels({
      object_refs: input.prepared_draft_object_refs,
      object_labels: input.prepared_draft_object_labels,
      limit: 2,
      prefix: 'Object anchors',
    })
    ??
    input.prepared_draft_summary?.trim() ??
    null
  );
}

export function responseItemPreparedDraftSummaryLines(input: {
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary?: string | null;
  prepared_draft_object_refs?: string[] | null;
  prepared_draft_object_labels?: string[] | null;
  prepared_draft_thread_retrieval_state?: {
    summary?: string | null;
  } | null;
}): string[] {
  const explicitLines = (input.prepared_draft_summary_lines ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (explicitLines.length > 0) return explicitLines;
  const leadSummary = responseItemPreparedDraftLeadSummary(input);
  return leadSummary ? [leadSummary] : [];
}

export function responseItemPreparedDraftDisplayedSummaryLines(input: {
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary?: string | null;
  prepared_draft_object_refs?: string[] | null;
  prepared_draft_object_labels?: string[] | null;
  prepared_draft_thread_retrieval_state?: {
    summary?: string | null;
  } | null;
}): string[] {
  return [
    responseItemPreparedDraftLeadSummary(input),
    ...responseItemPreparedDraftSupportingSummaryLines(input),
  ].filter((line): line is string => Boolean(line));
}

function prefixedSummaryLineValues(
  lines: string[] | null | undefined,
  prefix: string,
): string[] {
  const normalizedPrefix = `${prefix.toLowerCase()}:`;
  const values: string[] = [];
  for (const rawLine of lines ?? []) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!line.toLowerCase().startsWith(normalizedPrefix)) continue;
    const remainder = line.slice(prefix.length + 1).trim().replace(/\.$/, '');
    if (!remainder) continue;
    for (const value of remainder.split(',')) {
      const trimmed = value.trim();
      if (trimmed && !values.includes(trimmed)) {
        values.push(trimmed);
      }
    }
  }
  return values;
}

export function responseItemPreparedDraftAnchorLabels(input: {
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_object_labels?: string[] | null;
}): string[] {
  const labels: string[] = [];
  for (const label of input.prepared_draft_object_labels ?? []) {
    const trimmed = label.trim();
    if (trimmed && !labels.includes(trimmed)) {
      labels.push(trimmed);
    }
  }
  for (const label of prefixedSummaryLineValues(input.prepared_draft_summary_lines, 'Object anchors')) {
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }
  for (const label of prefixedSummaryLineValues(input.prepared_draft_summary_lines, 'File anchors')) {
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

export function responseItemPreparedDraftAnchorSummary(input: {
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_object_labels?: string[] | null;
  prefix?: string | null;
  limit?: number | null;
}): string | null {
  const labels = responseItemPreparedDraftAnchorLabels(input);
  if (labels.length === 0) return null;
  const prefix = input.prefix?.trim() || 'Anchors';
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
      ? Math.floor(input.limit)
      : labels.length;
  return `${prefix}: ${labels.slice(0, limit).join(', ')}.`;
}

export function responseItemPreparedDraftSupportingSummaryLines(input: {
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary?: string | null;
  prepared_draft_object_refs?: string[] | null;
  prepared_draft_object_labels?: string[] | null;
  prepared_draft_thread_retrieval_state?: {
    summary?: string | null;
  } | null;
}): string[] {
  const allLines = responseItemPreparedDraftSummaryLines(input);
  const leadSummary = responseItemPreparedDraftLeadSummary(input);
  if (!leadSummary) return allLines;
  const leadIndex = allLines.findIndex((line) => line === leadSummary);
  if (leadIndex === -1) return allLines;
  return allLines.filter((_, index) => index !== leadIndex);
}

export function responseItemPreparedDraftScopeCue(input: {
  prepared_draft_summary_lines?: string[] | null;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary?: string | null;
}): string | null {
  const displayedSummaryLines = responseItemPreparedDraftDisplayedSummaryLines(input);
  const scopeLine = displayedSummaryLines.find((line) => line.startsWith('Scope: '));
  return scopeLine ? scopeLine.replace(/^Scope:\s*/, '').trim() : null;
}

export function artifactSummaryLeadLine(input: {
  artifact_summary_lines?: string[] | null;
  description?: string | null;
  draft_preview?: ApprovalDraftPreview | null;
}): string | null {
  const explicitLines = (input.artifact_summary_lines ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const summaryLines = explicitLines.length > 0 ? explicitLines : approvalDraftPreviewLines(input.draft_preview);
  const preferredStructuredLine = summaryLines.find((line) =>
    line.startsWith('Draft: ')
    || line.startsWith('Next action: ')
    || line.startsWith('Flight: ')
    || line.startsWith('Planned window: ')
    || line.startsWith('Draft window: '),
  );
  if (preferredStructuredLine) return preferredStructuredLine;
  const firstNonScopeLine = summaryLines.find((line) => !line.startsWith('Scope: '));
  if (firstNonScopeLine) return firstNonScopeLine;
  return input.description?.trim() || null;
}

export function artifactSummarySupportingLines(input: {
  artifact_summary_lines?: string[] | null;
  description?: string | null;
  draft_preview?: ApprovalDraftPreview | null;
}): string[] {
  const explicitLines = (input.artifact_summary_lines ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const summaryLines = explicitLines.length > 0 ? explicitLines : approvalDraftPreviewLines(input.draft_preview);
  const leadLine = artifactSummaryLeadLine(input);
  if (!leadLine) return summaryLines;
  const leadIndex = summaryLines.findIndex((line) => line === leadLine);
  if (leadIndex === -1) return summaryLines;
  return summaryLines.filter((_, index) => index !== leadIndex);
}

export function artifactSummaryDisplayedLines(input: {
  artifact_summary_lines?: string[] | null;
  description?: string | null;
  draft_preview?: ApprovalDraftPreview | null;
}): string[] {
  return [
    artifactSummaryLeadLine(input),
    ...artifactSummarySupportingLines(input),
  ].filter((line): line is string => Boolean(line));
}

export function artifactSummaryScopeCue(input: {
  artifact_summary_lines?: string[] | null;
  description?: string | null;
  draft_preview?: ApprovalDraftPreview | null;
}): string | null {
  const displayedArtifactLines = artifactSummaryDisplayedLines(input);
  const scopeLine = displayedArtifactLines.find((line) => line.startsWith('Scope: '));
  return scopeLine ? scopeLine.replace(/^Scope:\s*/, '').trim() : null;
}

function fieldCalibrationNotesFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function watcherSignalFromUnknown(value: unknown): WatcherSignalLike | null {
  if (!value || typeof value !== 'object') return null;
  const signal = value as Record<string, unknown>;
  if (
    typeof signal.id !== 'string'
    || typeof signal.signal_key !== 'string'
    || typeof signal.category !== 'string'
    || typeof signal.freshness !== 'string'
    || typeof signal.urgency !== 'string'
    || typeof signal.confidence !== 'string'
    || typeof signal.source_type !== 'string'
    || typeof signal.source_subtype !== 'string'
    || typeof signal.thread_id !== 'string'
    || !Array.isArray(signal.source_refs)
  ) {
    return null;
  }
  return {
    id: signal.id,
    signal_key: signal.signal_key,
    category: signal.category,
    freshness: signal.freshness,
    urgency: signal.urgency,
    confidence: signal.confidence,
    urgency_hint: typeof signal.urgency_hint === 'string' ? signal.urgency_hint : null,
    suppression_status: typeof signal.suppression_status === 'string' ? signal.suppression_status : null,
    suppression_reason: typeof signal.suppression_reason === 'string' ? signal.suppression_reason : null,
    escalation_status: typeof signal.escalation_status === 'string' ? signal.escalation_status : null,
    escalation_reason: typeof signal.escalation_reason === 'string' ? signal.escalation_reason : null,
    decrypt_needed: typeof signal.decrypt_needed === 'boolean' ? signal.decrypt_needed : null,
    source_type: signal.source_type,
    source_subtype: signal.source_subtype,
    thread_id: signal.thread_id,
    source_refs: signal.source_refs.filter((item): item is string => typeof item === 'string'),
  };
}

export function watcherSignalsFromMessage(
  message: ContinuityMessageLike | null | undefined,
): WatcherSignalLike[] {
  const rawSignals = message?.content?.watcher_signals;
  if (!Array.isArray(rawSignals)) return [];
  return rawSignals
    .map((entry) => watcherSignalFromUnknown(entry))
    .filter((entry): entry is WatcherSignalLike => !!entry);
}

export function watcherSignalSummary(signal: WatcherSignalLike | null | undefined): string | null {
  if (!signal) return null;
  const urgencyHint = signal.urgency_hint?.trim();
  const escalationReason = signal.escalation_reason?.trim();
  const suppressionReason = signal.suppression_reason?.trim();
  const suppressionStatus = signal.suppression_status?.trim().toLowerCase();
  const escalationStatus = signal.escalation_status?.trim().toLowerCase();
  if ((suppressionStatus === 'suppressed' || suppressionStatus === 'cooldown') && suppressionReason) {
    return suppressionReason;
  }
  if (
    (escalationStatus === 'required' || escalationStatus === 'escalated')
    && escalationReason
  ) {
    return escalationReason;
  }
  if (urgencyHint) return urgencyHint;
  if (escalationReason) return escalationReason;
  if (suppressionReason) return suppressionReason;
  if (signal.decrypt_needed) {
    return 'Full context still needs decryption before this signal can be reviewed completely.';
  }
  return null;
}

function watcherConfidenceLabel(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0.9) return 'high';
    if (value >= 0.7) return 'medium';
    if (value >= 0) return 'low';
  }
  return null;
}

function watcherCategoryLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll(/[_-]+/g, ' ');
  return normalized || null;
}

function watcherSeverityLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'urgent':
      return 'Urgent';
    case 'important':
      return 'Important';
    case 'gentle':
      return 'Gentle';
    default:
      return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : null;
  }
}

function directWatcherMessageSummary(
  message: ContinuityMessageLike | null | undefined,
): string | null {
  const content = message?.content;
  if (!content || typeof content !== 'object') return null;
  if (message?.type === 'watcher_alert') {
    const severity = watcherSeverityLabel(content.severity);
    const category = watcherCategoryLabel(content.category);
    const confidence = watcherConfidenceLabel(content.confidence);
    const parts = [
      severity,
      category ? `${category} watcher alert` : 'watcher alert',
      confidence ? `(${confidence} confidence)` : null,
    ].filter((value): value is string => Boolean(value));
    return parts.length > 0 ? `${parts.join(' ')}.` : null;
  }
  if (message?.type === 'smart_suggestion') {
    const category = watcherCategoryLabel(content.category);
    const confidence = watcherConfidenceLabel(content.confidence);
    const parts = [
      category ? `${category} watcher suggestion` : 'watcher suggestion',
      confidence ? `(${confidence} confidence)` : null,
    ].filter((value): value is string => Boolean(value));
    if (parts.length === 0) return null;
    const sentence = parts.join(' ');
    return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
  }
  return null;
}

export function watcherMessageSummary(
  message: ContinuityMessageLike | null | undefined,
): string | null {
  const normalizedSummary = watcherSignalSummary(watcherSignalsFromMessage(message)[0]);
  if (normalizedSummary) return normalizedSummary;
  return directWatcherMessageSummary(message);
}

export function latestWatcherSignalSummaryFromMessages(
  messages: ContinuityMessageLike[] | null | undefined,
): string | null {
  for (const message of messages ?? []) {
    const summary = watcherMessageSummary(message);
    if (summary) return summary;
  }
  return null;
}

function fieldCalibrationMetricNoteFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const metrics =
    metadata?.field_engine_metrics && typeof metadata.field_engine_metrics === 'object'
      ? (metadata.field_engine_metrics as Record<string, unknown>)
      : null;
  if (!metrics) return null;
  const surfacedFieldTypes = Array.isArray(metrics.surfaced_field_types)
    ? metrics.surfaced_field_types.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const suppressedFieldTypes = Array.isArray(metrics.suppressed_field_types)
    ? metrics.suppressed_field_types.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  if (surfacedFieldTypes.includes('goal')) {
    return 'Field calibration: goal pressure now has prepared support for the next concrete commitment.';
  }
  if (surfacedFieldTypes.includes('opportunity')) {
    return 'Field calibration: opportunity pressure now has prepared support for a leverage-ready next step.';
  }
  if (suppressedFieldTypes.includes('goal')) {
    return 'Field calibration: goal pressure stayed suppressed until stronger commitment evidence appears.';
  }
  if (suppressedFieldTypes.includes('opportunity')) {
    return 'Field calibration: opportunity pressure stayed suppressed until clearer leverage evidence appears.';
  }
  const accepted =
    typeof metrics.historical_reuse_event_count === 'number'
      ? metrics.historical_reuse_event_count
      : null;
  const dismissed =
    typeof metrics.historical_dismissed_event_count === 'number'
      ? metrics.historical_dismissed_event_count
      : null;
  if (accepted !== null || dismissed !== null) {
    return `Field calibration: ${accepted ?? 0} accepted vs ${dismissed ?? 0} dismissed prepared-support events.`;
  }
  return null;
}

export function latestFieldCalibrationNoteFromMessages(
  messages: ContinuityMessageLike[] | null | undefined,
): string | null {
  for (const message of messages ?? []) {
    if (message.type !== 'state_snapshot') continue;
    const confidenceNotes = fieldCalibrationNotesFromUnknown(message.content?.confidence_notes);
    const explicitNote = confidenceNotes.find((note) => {
      const normalized = note.toLowerCase();
      return (
        normalized.includes('field engine')
        || normalized.includes('draft reuse')
        || normalized.includes('undo pressure')
        || normalized.includes('accepted vs')
        || normalized.includes('cautious or cooldown')
        || normalized.includes('goal pressure')
        || normalized.includes('opportunity pressure')
        || normalized.includes('prepared support exists')
      );
    });
    if (explicitNote) return explicitNote;
    const metricNote = fieldCalibrationMetricNoteFromMetadata(message.metadata);
    if (metricNote) return metricNote;
  }
  return null;
}

function fieldEngineSummaryFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const summary =
    typeof (value as { summary?: unknown }).summary === 'string'
      ? (value as { summary: string }).summary.trim()
      : '';
  return summary || null;
}

function fieldEnginePrimaryTypeFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  if (!value || typeof value !== 'object') return null;
  const primaryType =
    typeof (value as { primary_field_type?: unknown }).primary_field_type === 'string'
      ? (value as { primary_field_type: string }).primary_field_type.trim().toLowerCase()
      : '';
  return primaryType || null;
}

export function latestFieldEnginePrimaryTypeFromMessages(
  messages: ContinuityMessageLike[] | null | undefined,
): string | null {
  for (const message of messages ?? []) {
    if (message.type !== 'state_snapshot' && message.type !== 'state_synthesis') continue;
    const directType = fieldEnginePrimaryTypeFromUnknown(message.metadata?.field_engine_summary);
    if (directType) return directType;
    const handoffType = fieldEnginePrimaryTypeFromUnknown(
      (message.metadata?.synthesizer_handoff as { field_engine_primary_type?: unknown } | undefined)
        ?.field_engine_primary_type,
    );
    if (handoffType) return handoffType;
  }
  return null;
}

export function latestFieldEngineSummaryFromMessages(
  messages: ContinuityMessageLike[] | null | undefined,
): string | null {
  for (const message of messages ?? []) {
    if (message.type !== 'state_snapshot' && message.type !== 'state_synthesis') continue;
    const directSummary = fieldEngineSummaryFromUnknown(message.metadata?.field_engine_summary);
    if (directSummary) return directSummary;
    const handoffSummary = fieldEngineSummaryFromUnknown(
      (message.metadata?.synthesizer_handoff as { field_engine_summary?: unknown } | undefined)
        ?.field_engine_summary,
    );
    if (handoffSummary) return handoffSummary;
  }
  return null;
}

export function fieldEngineFamilyLabel(fieldType: string | null | undefined): string | null {
  switch ((fieldType ?? '').trim().toLowerCase()) {
    case 'attention':
      return 'Attention pressure';
    case 'interest':
      return 'Interest pressure';
    case 'obligation':
      return 'Obligation pressure';
    case 'relationship':
      return 'Relationship pressure';
    case 'project':
      return 'Project pressure';
    case 'goal':
      return 'Goal pressure';
    case 'opportunity':
      return 'Opportunity pressure';
    case 'knowledge':
      return 'Knowledge pressure';
    case 'decision':
      return 'Decision pressure';
    default:
      return null;
  }
}

export function stateFieldVisibilityRank(
  item: StateFieldLike,
): [number, number, number, number, string] | null {
  const statusRank =
    item.status === 'active' ? 0 : item.status === 'monitor' ? 1 : null;
  if (statusRank === null) return null;
  const fieldRank = (() => {
    switch (item.field_key) {
      case 'approval_required_work':
        return 0;
      case 'unresolved_decisions':
        return 1;
      case 'follow_up_pressure':
        return 2;
      case 'relationship_follow_up':
        return 3;
      default:
        return 4;
    }
  })();
  const surfaceRank = (() => {
    switch (item.surface_hint) {
      case 'decision_queue':
        return 0;
      case 'response_queue':
        return 1;
      case 'context_panel':
        return 2;
      default:
        return 3;
    }
  })();
  const evidenceRank = -((item.evidence_refs ?? []).length);
  return [statusRank, fieldRank, surfaceRank, evidenceRank, item.field_key ?? ''];
}

export function visibleStateFields<
  T extends StateFieldLike,
>(
  items: T[],
): T[] {
  return items
    .filter((item) => item.status === 'active' || item.status === 'monitor')
    .slice()
    .sort((left, right) => {
      const leftRank = stateFieldVisibilityRank(left);
      const rightRank = stateFieldVisibilityRank(right);
      if (!leftRank || !rightRank) return 0;
      return (
        leftRank[0] - rightRank[0] ||
        leftRank[1] - rightRank[1] ||
        leftRank[2] - rightRank[2] ||
        leftRank[3] - rightRank[3] ||
        leftRank[4].localeCompare(rightRank[4])
      );
    });
}

export function leadingVisibleStateField<T extends StateFieldLike>(
  items: T[],
): T | null {
  return visibleStateFields(items)[0] ?? null;
}

export function stateFieldSurfaceDestination(
  field: Pick<StateFieldLike, 'surface_hint'> | null | undefined,
): 'decision_queue' | 'response_queue' | 'context_panel' | 'home' {
  switch (field?.surface_hint) {
    case 'decision_queue':
    case 'response_queue':
    case 'context_panel':
      return field.surface_hint;
    default:
      return 'home';
  }
}

export function decisionIdFromActionItem(item: { id: string }): string {
  return `${CONTINUITY_ACTION_DECISION_PREFIX}${item.id}`;
}

export function isContinuitySyntheticDecisionId(id: string): boolean {
  return id === CONTINUITY_PRIORITY_DECISION_ID || id.startsWith(CONTINUITY_ACTION_DECISION_PREFIX);
}

function inferContextItemType(
  item: ContinuityContextPanelItemLike,
): ContinuityDecisionContextItem['type'] {
  const relationText = item.relation_path.join(' ').toLowerCase();
  const sourceText = item.source_refs.join(' ').toLowerCase();
  const titleText = item.label.toLowerCase();
  if (sourceText.includes('calendar:') || relationText.includes('schedule')) return 'calendar';
  if (
    sourceText.includes('email:') ||
    sourceText.includes('gmail') ||
    titleText.includes('email')
  ) {
    return 'email';
  }
  if (titleText.includes('person') || relationText.includes('same person')) return 'person';
  return 'note';
}

function inferContextSourceType(
  item: ContinuityContextPanelItemLike,
): ContinuityDecisionContextItem['sourceType'] {
  const sourceText = item.source_refs.join(' ').toLowerCase();
  if (sourceText.includes('thread:')) return 'thread';
  if (sourceText.includes('email:') || sourceText.includes('gmail')) return 'email';
  return 'note';
}

function contextIconForType(type: ContinuityDecisionContextItem['type']): string {
  switch (type) {
    case 'calendar':
      return '\u{1F4C5}';
    case 'email':
      return '\u{1F4E7}';
    case 'person':
      return '\u{1F464}';
    default:
      return '\u{1F4DD}';
  }
}

function mapContextPanelItems(
  items: ContinuityContextPanelItemLike[],
): ContinuityDecisionContextItem[] {
  return items.slice(0, 4).map((item) => {
    const type = inferContextItemType(item);
    return {
      type,
      icon: contextIconForType(type),
      title: item.label,
      snippet: item.why_surfaced,
      time:
        item.relation_path.length > 0
          ? item.relation_path.join(' -> ').replaceAll('_', ' ')
          : undefined,
      sourceType: inferContextSourceType(item),
      sourceRefs: [...item.source_refs],
      relationPath: [...item.relation_path],
    };
  });
}

export function resolveContextItemNavigationTarget(input?: {
  sourceRefs?: string[] | null;
} | null): ContinuityNavigationTarget | null {
  const candidateRefs = input?.sourceRefs ?? [];
  const seen = new Set<string>();
  const ranked = candidateRefs
    .map((sourceRef) => {
      const normalized = normalizeContinuityRef(sourceRef);
      if (!normalized) return null;
      const dedupeKey =
        normalized.kind === 'calendar' ? 'calendar' : `${normalized.kind}:${normalized.value}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      const score =
        normalized.kind === 'thread' ? 35 : normalized.kind === 'message' ? 30 : 10;
      return { normalized, score };
    })
    .filter(
      (candidate): candidate is { normalized: NormalizedContinuityRef; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.normalized;
  if (!best) return null;
  if (best.kind === 'calendar') return { view: 'calendar' };
  if (best.kind === 'thread') return { view: 'threads', threadId: best.value };
  return { view: 'threads', messageId: best.value };
}

export function resolveContextItemTargetLabel(input?: {
  sourceRefs?: string[] | null;
} | null): string | null {
  const candidateRefs = input?.sourceRefs ?? [];
  const seen = new Set<string>();
  const ranked = candidateRefs
    .map((sourceRef) => {
      const normalized = normalizeContinuityRef(sourceRef);
      if (!normalized) return null;
      const dedupeKey =
        normalized.kind === 'calendar' ? 'calendar' : `${normalized.kind}:${normalized.value}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      const score =
        normalized.kind === 'thread' ? 35 : normalized.kind === 'message' ? 30 : 10;
      return { normalized, score };
    })
    .filter(
      (candidate): candidate is { normalized: NormalizedContinuityRef; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.normalized;
  if (!best) return null;
  if (best.kind === 'calendar') return 'Calendar';
  return humanizeContinuityRef(best);
}

export function decisionFromPriorityCard(
  card: ContinuityPriorityCardLike,
  contextPanelItems: ContinuityContextPanelItemLike[] = [],
): ContinuityPriorityDecision {
  const destinationLabel = continuityDecisionThreadLabel(card);
  const priorityReason =
    priorityRationaleSummary({
      requires_approval: card.requires_approval,
      source_refs: card.source_refs,
      object_refs: card.object_refs,
      object_labels: card.object_labels,
    }) ?? card.description;
  const objectSummary = summarizeReferenceLabels({
    object_refs: card.object_refs,
    object_labels: card.object_labels,
    limit: 2,
    prefix: 'Object anchors',
  });
  const provenanceCue = provenanceCueSummary({
    source_refs: card.source_refs,
    object_refs: card.object_refs,
    object_labels: card.object_labels,
  });
  return {
    id: CONTINUITY_PRIORITY_DECISION_ID,
    urgency: card.requires_approval ? 'urgent' : 'high',
    title: card.title,
    context: card.description,
    impact: 'high',
    effort: '10 min',
    durationScope: 'day',
    confidence: card.confidence === 'high' ? 0.92 : card.confidence === 'medium' ? 0.78 : 0.62,
    confidenceReason: card.description,
    whyBullets: [
      { icon: card.requires_approval ? '\u{26A0}' : '\u{2022}', text: priorityReason },
      ...(objectSummary ? [{ icon: '\u{1F517}', text: objectSummary }] : []),
      ...(provenanceCue ? [{ icon: '\u{1F4CC}', text: provenanceCue }] : []),
      { icon: '\u{2192}', text: `Open ${destinationLabel}` },
    ],
    whyMatters: card.description,
    contextItems: mapContextPanelItems(contextPanelItems),
    options: [
      {
        id: 'continuity-priority-open',
        label: `Open ${destinationLabel}`,
        detail: destinationLabel,
        aiRecommended: true,
      },
      {
        id: 'continuity-priority-later',
        label: 'Review later',
        detail: 'Keep in briefing flow',
      },
    ],
  };
}

export function decisionFromActionItem(
  item: ContinuityActionItemLike,
  contextPanelItems: ContinuityContextPanelItemLike[] = [],
): ContinuityPriorityDecision {
  const normalizedUrgency =
    item.requires_approval || item.urgency === 'urgent'
      ? 'urgent'
      : item.urgency === 'today'
        ? 'high'
        : 'high';
  const confidence =
    item.confidence === 'high' ? 0.9 : item.confidence === 'medium' ? 0.76 : 0.6;
  const sourceCount = item.source_refs.length;

  const primaryLabel =
    item.surface_hint === 'response_queue'
      ? 'Open responses'
      : item.surface_hint === 'decision_queue' && item.requires_approval
        ? 'Open approval queue'
        : item.surface_hint === 'decision_queue'
          ? 'Open decision queue'
          : item.surface_hint === 'context_panel'
            ? 'Open context'
            : item.suggested_action;
  const secondaryOption =
    item.surface_hint === 'response_queue'
      ? {
          id: `${item.id}-later`,
          label: 'Keep in response queue',
          detail: 'Return after clearing faster replies',
        }
      : item.surface_hint === 'decision_queue' && item.requires_approval
        ? {
            id: `${item.id}-later`,
            label: 'Keep in approval queue',
            detail: 'Wait for a more deliberate review window',
          }
        : item.surface_hint === 'decision_queue'
          ? {
              id: `${item.id}-later`,
              label: 'Keep in decision queue',
              detail: 'Review with more context later',
            }
          : item.surface_hint === 'context_panel'
            ? {
                id: `${item.id}-later`,
                label: 'Keep context handy',
                detail: 'Return from the home queue later',
              }
            : {
                id: `${item.id}-later`,
                label: 'Review later',
                detail: 'Keep in decision queue',
              };
  return {
    id: decisionIdFromActionItem(item),
    urgency: normalizedUrgency,
    title: item.title,
    context: item.suggested_action,
    impact: 'high',
    effort: sourceCount > 1 ? '15 min' : '10 min',
    durationScope: 'day',
    confidence,
    confidenceReason: `${item.category} continuity action`,
    whyBullets: [
      { icon: item.requires_approval ? '!' : '-', text: item.suggested_action },
      {
        icon: '#',
        text:
          sourceCount > 0
            ? `${sourceCount} source reference${sourceCount === 1 ? '' : 's'}`
            : 'Synthesized from continuity state',
      },
    ],
    whyMatters: item.suggested_action,
    contextItems: mapContextPanelItems(contextPanelItems),
    options: [
      {
        id: `${item.id}-open`,
        label: primaryLabel,
        detail: item.category,
        aiRecommended: true,
      },
      secondaryOption,
    ],
  };
}

type ContinuityNavigationCardLike = {
  panel_kind?: string | null;
  surface_hint?: string | null;
  requires_approval?: boolean | null;
  source_refs?: string[] | null;
};

type ContinuityNavigationActionLike = {
  urgency?: string | null;
  requires_approval?: boolean | null;
  source_refs: string[];
};

type ContinuityNavigationPackLike = {
  reference_refs?: string[] | null;
  source_refs?: string[] | null;
};

function continuityUrgencyWeight(urgency: string | null | undefined): number {
  switch (urgency) {
    case 'urgent':
      return 4;
    case 'today':
      return 3;
    case 'high':
      return 2;
    case 'medium':
      return 1;
    default:
      return 0;
  }
}

function continuityRefScore(
  ref: NormalizedContinuityRef,
  card?: ContinuityNavigationCardLike | null,
): number {
  if (card?.requires_approval) {
    switch (ref.kind) {
      case 'thread':
        return 40;
      case 'message':
        return 35;
      case 'file':
        return 8;
      case 'calendar':
        return 10;
    }
  }

  if (card?.panel_kind === 'response_queue' || card?.surface_hint === 'response_queue') {
    switch (ref.kind) {
      case 'thread':
        return 38;
      case 'message':
        return 34;
      case 'file':
        return 6;
      case 'calendar':
        return 4;
    }
  }

  if (card?.panel_kind === 'context_panel' || card?.surface_hint === 'context_panel') {
    switch (ref.kind) {
      case 'thread':
        return 35;
      case 'message':
        return 30;
      case 'file':
        return 12;
      case 'calendar':
        return 15;
    }
  }

  switch (ref.kind) {
    case 'thread':
      return 30;
    case 'message':
      return 25;
    case 'file':
      return 5;
    case 'calendar':
      return 20;
  }
}

export function resolveContinuityNavigationTarget(
  card?: ContinuityNavigationCardLike | null,
  actionItems: ContinuityNavigationActionLike[] = [],
): ContinuityNavigationTarget | null {
  const sortedActionItems = [...actionItems].sort((left, right) => {
    const approvalDelta = Number(right.requires_approval) - Number(left.requires_approval);
    if (approvalDelta !== 0) return approvalDelta;
    const urgencyDelta =
      continuityUrgencyWeight(right.urgency) - continuityUrgencyWeight(left.urgency);
    if (urgencyDelta !== 0) return urgencyDelta;
    return right.source_refs.length - left.source_refs.length;
  });

  const candidateRefs = [
    ...(card?.source_refs ?? []),
    ...sortedActionItems.flatMap((item) => item.source_refs),
  ];

  const seen = new Set<string>();
  const ranked = candidateRefs
    .map((sourceRef) => {
      const normalized = normalizeContinuityRef(sourceRef);
      if (!normalized) return null;
      const dedupeKey =
        normalized.kind === 'calendar' ? 'calendar' : `${normalized.kind}:${normalized.value}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      return { normalized, score: continuityRefScore(normalized, card) };
    })
    .filter(
      (candidate): candidate is { normalized: NormalizedContinuityRef; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.normalized;
  if (!best) return null;
  if (best.kind === 'calendar') return { view: 'calendar' };
  if (best.kind === 'thread') return { view: 'threads', threadId: best.value };
  return { view: 'threads', messageId: best.value };
}

export function continuityDecisionThreadLabel(
  card?: ContinuityNavigationCardLike | null,
  actionItems: ContinuityNavigationActionLike[] = [],
): string {
  const target = resolveContinuityNavigationTarget(card, actionItems);
  if (target?.view) return continuityDestinationLabel(target.view);
  return continuityDestinationLabel('threads');
}

export function resolveResponseNavigationTarget(
  responseItems: ContinuityNavigationActionLike[] = [],
): ContinuityNavigationTarget | null {
  const sortedItems = [...responseItems].sort((left, right) => {
    const urgencyDelta =
      continuityUrgencyWeight(right.urgency) - continuityUrgencyWeight(left.urgency);
    if (urgencyDelta !== 0) return urgencyDelta;
    return right.source_refs.length - left.source_refs.length;
  });

  const candidateRefs = sortedItems.flatMap((item) => item.source_refs);
  const seen = new Set<string>();
  const ranked = candidateRefs
    .map((sourceRef) => {
      const normalized = normalizeContinuityRef(sourceRef);
      if (!normalized) return null;
      const dedupeKey =
        normalized.kind === 'calendar' ? 'calendar' : `${normalized.kind}:${normalized.value}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      const score =
        normalized.kind === 'thread' ? 30 : normalized.kind === 'message' ? 25 : 10;
      return { normalized, score };
    })
    .filter(
      (candidate): candidate is { normalized: NormalizedContinuityRef; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.normalized;
  if (!best) return null;
  if (best.kind === 'calendar') return { view: 'calendar' };
  if (best.kind === 'thread') return { view: 'threads', threadId: best.value };
  return { view: 'threads', messageId: best.value };
}

export function resolveContextPackNavigationTarget(
  item?: ContinuityNavigationPackLike | null,
): ContinuityNavigationTarget | null {
  const candidateRefs = [...(item?.reference_refs ?? []), ...(item?.source_refs ?? [])];

  const seen = new Set<string>();
  const ranked = candidateRefs
    .map((sourceRef) => {
      const normalized = normalizeContinuityRef(sourceRef);
      if (!normalized) return null;
      const dedupeKey =
        normalized.kind === 'calendar' ? 'calendar' : `${normalized.kind}:${normalized.value}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      const score =
        normalized.kind === 'thread' ? 35 : normalized.kind === 'message' ? 30 : 10;
      return {
        normalized,
        score: (item?.reference_refs ?? []).includes(sourceRef) ? score + 10 : score,
      };
    })
    .filter(
      (candidate): candidate is { normalized: NormalizedContinuityRef; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.normalized;
  if (!best) return null;
  if (best.kind === 'calendar') return { view: 'calendar' };
  if (best.kind === 'thread') return { view: 'threads', threadId: best.value };
  return { view: 'threads', messageId: best.value };
}
