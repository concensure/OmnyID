// @locs-version: 1.0
import { confColor } from "@/lib/format";
import { afpOptionalRecord, afpRecord } from "@/lib/afpMessageRecord";
import { surfaceRelativeTimestamp } from "@/lib/surfaceTimestampPresentation";
import { threadDashboardTooltipState, threadDashboardTrustState } from "@/lib/threadDashboardTrustState";

const THREAD_DASHBOARD_ACTION_ICONS = {
  reply: "RP",
  summarise: "SM",
  calendar: "CA",
  task: "TS",
  archive: "AR",
} as const;

export type ThreadDashboardActionId = keyof typeof THREAD_DASHBOARD_ACTION_ICONS;
export type ThreadDashboardRowActionState = "idle" | "pending" | "done" | "error";

export type ThreadDashboardThreadRecord = {
  id: string;
  from: string;
  from_email?: string;
  subject: string;
  last_activity: string;
  suggested_action?: string;
  action_reason?: string;
  confidence?: number;
  labels?: string[];
  needs_attention?: boolean;
};

export type ThreadDashboardActionButtonState = {
  id: ThreadDashboardActionId;
  label: string;
  icon: string;
  state: ThreadDashboardRowActionState;
  disabled: boolean;
  className: string;
};

export type ThreadDashboardRowPresentationState = {
  fromText: string;
  subjectText: string;
  relativeTimeText: string;
  labels: string[];
  showAttention: boolean;
  attentionTitle: string;
  suggestedActionText: string | null;
  boundedReasonText: string | null;
  actionReasonText: string | null;
  showSuggestedAction: boolean;
  showConfidence: boolean;
  confidenceText: string | null;
  confidenceClass: string;
  rowClass: string;
  showTooltip: boolean;
  actionButtons: ThreadDashboardActionButtonState[];
};

export type ThreadDashboardFilters = {
  contactFilter: string;
  labelFilter: string;
  tagFilter: string;
};

export type ThreadDashboardSummaryState = {
  attentionCount: number;
  showAttentionCount: boolean;
  hasActiveFilters: boolean;
  visibleThreadCountText: string;
  showEmpty: boolean;
  showUndoNotice: boolean;
  undoSummary: string | null;
};

export type ThreadDashboardAvailableFilters = {
  contacts?: string[];
  labels?: string[];
  supertags?: string[];
};

export const THREAD_DASHBOARD_CLEAR_FILTERS_LABEL = "Clear filters x";
export const THREAD_DASHBOARD_ACTION_LABELS: Record<ThreadDashboardActionId, string> = {
  reply: "Reply",
  summarise: "Summarise",
  calendar: "Calendar",
  task: "Task",
  archive: "Archive",
};
export const THREAD_DASHBOARD_ARCHIVED_LABEL = "Thread archived -";

export type ThreadDashboardActionDefinition = {
  id: ThreadDashboardActionId;
  label: string;
  objective: (thread: Pick<ThreadDashboardThreadRecord, "from" | "subject">) => string;
};

export const THREAD_DASHBOARD_ACTION_DEFINITIONS: ReadonlyArray<ThreadDashboardActionDefinition> = [
  {
    id: "reply",
    label: "Reply",
    objective: (thread) =>
      `Draft a professional reply to the email thread from ${thread.from} with subject "${thread.subject}". Present the draft for user review before sending.`,
  },
  {
    id: "summarise",
    label: "Summarise",
    objective: (thread) =>
      `Summarise the email thread from ${thread.from} with subject "${thread.subject}" into a concise 3-5 bullet point digest. Return as an AFP a2ui_render message.`,
  },
  {
    id: "calendar",
    label: "Calendar",
    objective: (thread) =>
      `Extract any scheduling information from the email thread from ${thread.from} with subject "${thread.subject}" and create a calendar event. Ask the user to confirm the event details before adding.`,
  },
  {
    id: "task",
    label: "Task",
    objective: (thread) =>
      `Create an action item or task from the email thread from ${thread.from} with subject "${thread.subject}". Return as an AFP task message with suggested deadline if inferable.`,
  },
  {
    id: "archive",
    label: "Archive",
    objective: (thread) =>
      `Archive the email thread from ${thread.from} with subject "${thread.subject}" and remove it from the active inbox.`,
  },
] as const;

export function threadDashboardActionIcon(action: ThreadDashboardActionId): string {
  return THREAD_DASHBOARD_ACTION_ICONS[action];
}

export function threadDashboardThreadsFromContent(content: Record<string, unknown>): ThreadDashboardThreadRecord[] {
  const raw = content.threads;
  if (!Array.isArray(raw)) return [];
  return raw.map((value): ThreadDashboardThreadRecord => {
    const thread = afpRecord(value);
    return {
      id: String(thread.id ?? ""),
      from: String(thread.from ?? ""),
      from_email: thread.from_email ? String(thread.from_email) : undefined,
      subject: String(thread.subject ?? ""),
      last_activity: String(thread.last_activity ?? ""),
      suggested_action: thread.suggested_action ? String(thread.suggested_action) : undefined,
      action_reason: thread.action_reason ? String(thread.action_reason) : undefined,
      confidence: typeof thread.confidence === "number" ? thread.confidence : undefined,
      labels: Array.isArray(thread.labels) ? thread.labels.map(String) : [],
      needs_attention: Boolean(thread.needs_attention),
    };
  });
}

export function threadDashboardAvailableFiltersFromContent(
  content: Record<string, unknown>,
): ThreadDashboardAvailableFilters {
  const raw = afpOptionalRecord(content.available_filters);
  if (!raw) return {};
  return {
    contacts: Array.isArray(raw.contacts) ? raw.contacts.map(String) : [],
    labels: Array.isArray(raw.labels) ? raw.labels.map(String) : [],
    supertags: Array.isArray(raw.supertags) ? raw.supertags.map(String) : [],
  };
}

export function threadDashboardActionDefinition(
  action: ThreadDashboardActionId,
): ThreadDashboardActionDefinition {
  return THREAD_DASHBOARD_ACTION_DEFINITIONS.find((item) => item.id === action)!;
}

export function threadDashboardRelativeTime(iso: string, nowMs = Date.now()): string {
  return surfaceRelativeTimestamp(iso, nowMs) || iso;
}

export function threadDashboardActionButtonState(
  action: ThreadDashboardActionId,
  state: ThreadDashboardRowActionState,
): ThreadDashboardActionButtonState {
  const className =
    state === "done"
      ? "rounded px-2 py-1 text-[10px] font-medium transition bg-emerald-500/20 text-emerald-400 disabled:opacity-50"
      : state === "error"
        ? "rounded px-2 py-1 text-[10px] font-medium transition bg-red-500/20 text-red-400 disabled:opacity-50"
        : "rounded border border-white/15 bg-white/8 px-2 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white/15 hover:text-on-surface disabled:opacity-50";

  return {
    id: action,
    label: threadDashboardActionDefinition(action).label,
    icon: threadDashboardActionIcon(action),
    state,
    disabled: state === "pending",
    className,
  };
}

export function threadDashboardRowPresentationState(input: {
  thread: ThreadDashboardThreadRecord;
  rowActionStates: Partial<Record<ThreadDashboardActionId, ThreadDashboardRowActionState>>;
  tooltipRowId: string | null;
  attentionFallbackTitle: string;
}): ThreadDashboardRowPresentationState {
  const trustState = threadDashboardTrustState({
    suggestedAction: input.thread.suggested_action ?? null,
    actionReason: input.thread.action_reason ?? null,
  });
  const confidenceValue = input.thread.confidence;
  const tooltipTrustState = threadDashboardTooltipState({
    suggestedAction: input.thread.suggested_action ?? null,
    actionReason: input.thread.action_reason ?? null,
    confidence: confidenceValue ?? null,
  });

  return {
    fromText: input.thread.from,
    subjectText: input.thread.subject,
    relativeTimeText: threadDashboardRelativeTime(input.thread.last_activity),
    labels: input.thread.labels ?? [],
    showAttention: Boolean(input.thread.needs_attention),
    attentionTitle: trustState.attentionTitle ?? input.attentionFallbackTitle,
    suggestedActionText: trustState.suggestedActionText,
    boundedReasonText: tooltipTrustState.boundedReasonText,
    actionReasonText: tooltipTrustState.selectionReasonText,
    showSuggestedAction: Boolean(trustState.suggestedActionText),
    showConfidence: confidenceValue !== undefined,
    confidenceText: tooltipTrustState.confidenceText,
    confidenceClass: confidenceValue !== undefined ? confColor(confidenceValue) : "",
    rowClass: input.thread.needs_attention
      ? "border-b border-white/8 bg-amber-400/5 transition-colors last:border-0 hover:bg-amber-400/10"
      : "border-b border-white/8 transition-colors last:border-0 hover:bg-white/5",
    showTooltip: input.tooltipRowId === input.thread.id && tooltipTrustState.showTooltipTrustBlocks,
    actionButtons: THREAD_DASHBOARD_ACTION_DEFINITIONS.map((definition) =>
      threadDashboardActionButtonState(definition.id, input.rowActionStates[definition.id] ?? "idle"),
    ),
  };
}

export function threadDashboardMatchesFilters(input: {
  thread: ThreadDashboardThreadRecord;
  archivedIds: ReadonlySet<string>;
  filters: ThreadDashboardFilters;
  reasonFilterText: string;
}): boolean {
  const contactFilter = input.filters.contactFilter.trim().toLowerCase();
  const labelFilter = input.filters.labelFilter.trim();
  const tagFilter = input.filters.tagFilter.trim().toLowerCase();

  if (input.archivedIds.has(input.thread.id)) return false;
  if (
    contactFilter
    && !input.thread.from.toLowerCase().includes(contactFilter)
    && !(input.thread.from_email?.toLowerCase().includes(contactFilter) ?? false)
  ) {
    return false;
  }
  if (labelFilter && !(input.thread.labels ?? []).includes(labelFilter)) return false;
  if (tagFilter && !input.reasonFilterText.includes(tagFilter)) return false;
  return true;
}

export function threadDashboardSummaryState(input: {
  visibleThreads: ReadonlyArray<{ showAttention: boolean }>;
  filters: ThreadDashboardFilters;
  undoThreadSubject?: string | null;
}): ThreadDashboardSummaryState {
  const attentionCount = input.visibleThreads.filter((thread) => thread.showAttention).length;
  const hasActiveFilters = Boolean(
    input.filters.contactFilter || input.filters.labelFilter || input.filters.tagFilter,
  );
  const undoSummary = input.undoThreadSubject
    ? `${THREAD_DASHBOARD_ARCHIVED_LABEL} ${input.undoThreadSubject}`
    : null;

  return {
    attentionCount,
    showAttentionCount: attentionCount > 0,
    hasActiveFilters,
    visibleThreadCountText: `${input.visibleThreads.length} threads`,
    showEmpty: input.visibleThreads.length === 0,
    showUndoNotice: Boolean(input.undoThreadSubject),
    undoSummary,
  };
}
