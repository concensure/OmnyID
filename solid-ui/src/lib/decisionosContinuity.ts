// @locs-version: 1.0
import type { AfpMessage, DashboardBootstrap } from "@/lib/api";
import {
  dashboardBootstrapActionLog,
  dashboardBootstrapCalendarRuntimeSummary,
  dashboardBootstrapCostSnapshot,
  dashboardBootstrapCostStatus,
  dashboardBootstrapDeviceSyncRuntimeSummary,
  dashboardBootstrapMessages,
  dashboardBootstrapProactiveSuggestions,
  dashboardBootstrapRuntimeDeployment,
  dashboardBootstrapRuntimeUpdates,
  dashboardBootstrapSupportAccess,
} from "@/lib/dashboardBootstrapState";
import { customEventDetail } from "@/lib/eventDetail";
import {
  fieldEngineFamilyLabel,
  latestFieldEnginePrimaryTypeFromMessages,
  latestFieldEngineSummaryFromMessages,
  responseItemPreparedDraftLeadSummary,
  visibleStateFields,
} from "afp-ts/continuity";
export {
  decisionOsContinuityLaneSummaryFromStateFieldSummary,
} from "@/lib/decisionosContinuityLaneState";
import {
  decisionOsQueueActionItems,
  decisionOsQueueBootstrapState,
  decisionOsQueueCompanionState,
  decisionOsQueueContextPackItems,
  decisionOsQueueContextPanelItems,
  decisionOsQueuePreparedDraftItems,
  decisionOsQueuePriorityCard,
  decisionOsQueueResponseItems,
  type DecisionOsQueueBootstrapState,
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

export type DecisionOsBriefing = {
  northStar: string;
  urgentCount: number;
  highImpactCount: number;
  completedCount: number;
  estimatedMinutes: number;
  totalDecisions: number;
};

export type DecisionOsSuggestedMood =
  | "focused"
  | "happy"
  | "tired"
  | "stressed"
  | "neutral";

export type DecisionOsContinuityPrimaryMode =
  | "priority_card"
  | "action_item"
  | "briefing_bar"
  | "continuity_panel";

export type DecisionOsPriorityCard = {
  title: string;
  description: string;
  panel_kind: string;
  requires_approval: boolean;
  action_label: string;
  surface_hint?: string | null;
  confidence?: string | null;
  prepared_draft_class?: string | null;
  selection_reason?: string | null;
  approval_or_reversibility_hint?: string | null;
  provenance_cue?: string | null;
  autonomy_tier?: string | null;
  retrieval_mode?: string | null;
  deeper_retrieval_recommended?: boolean;
  readiness_reason?: string | null;
  topology_budget_used?: number;
  working_set_count?: number;
  active_topic_count?: number;
  working_set_refs?: string[];
  active_topic_refs?: string[];
  decision_history_refs?: string[];
  project_refs?: string[];
  thread_refs?: string[];
  linked_target_label?: string | null;
  source_refs?: string[];
  object_refs?: string[];
  object_labels?: string[];
  file_refs?: string[];
  file_labels?: string[];
  memory_space?: string | null;
  autonomy_decision?: {
    autonomy_level?: string | null;
    reversibility?: string | null;
    consequence_level?: string | null;
    confidence?: string | null;
    approval_required?: boolean | null;
    interruption_budget?: string | null;
    reason?: string | null;
  } | null;
  author_mask?: string | null;
  author_type?: string | null;
  author_id?: string | null;
  is_human_authored?: boolean | null;
  human_only?: boolean | null;
  thread_retrieval_state?: {
    summary: string;
    badges: string[];
  } | null;
};

export type DecisionOsActionItem = {
  id: string;
  title: string;
  category: string;
  urgency: string;
  confidence: string;
  requires_approval: boolean;
  suggested_action: string;
  surface_hint?: string | null;
  selection_reason?: string | null;
  approval_or_reversibility_hint?: string | null;
  provenance_cue?: string | null;
  autonomy_tier?: string | null;
  autonomy_decision?: {
    autonomy_level?: string | null;
    reversibility?: string | null;
    consequence_level?: string | null;
    confidence?: string | null;
    approval_required?: boolean | null;
    interruption_budget?: string | null;
    reason?: string | null;
  } | null;
  source_refs: string[];
  memory_space?: string | null;
  author_mask?: string | null;
  author_type?: string | null;
  author_id?: string | null;
  is_human_authored?: boolean | null;
  human_only?: boolean | null;
};

export type DecisionOsContextPanelItem = {
  id: string;
  label: string;
  why_surfaced: string;
  confidence: string;
  relation_path: string[];
  source_refs: string[];
  decrypt_needed: boolean;
};

export type DecisionOsContextPackItem = {
  id: string;
  pack_kind: string;
  title: string;
  summary: string;
  confidence: string;
  why_surfaced: string;
  retrieval_mode?: string | null;
  deeper_retrieval_recommended?: boolean;
  readiness_reason?: string | null;
  topology_budget_used?: number;
  working_set_count?: number;
  active_topic_count?: number;
  anchor_refs: string[];
  source_refs: string[];
  reference_refs: string[];
  reference_labels: string[];
  object_refs: string[];
  object_labels: string[];
  file_refs: string[];
  file_labels: string[];
  evidence_kinds: string[];
  thread_retrieval_state?: {
    summary: string;
    badges: string[];
  } | null;
};

export type DecisionOsStateFieldItem = {
  field_key: string;
  label: string;
  status: string;
  confidence: string;
  surface_hint: string;
  recommended_action: string;
  autonomy_level: string;
  reason: string;
  evidence_refs: string[];
};

export type DecisionOsResponseItem = {
  id: string;
  title: string;
  channel: string;
  urgency: string;
  confidence: string;
  response_due_hint: string;
  suggested_action: string;
  autonomy_decision?: {
    autonomy_level?: string | null;
    reversibility?: string | null;
    consequence_level?: string | null;
    confidence?: string | null;
    approval_required?: boolean | null;
    interruption_budget?: string | null;
    reason?: string | null;
  } | null;
  prepared_draft_id?: string | null;
  prepared_draft_summary?: string | null;
  prepared_draft_readiness?: string | null;
  prepared_draft_body?: string | null;
  prepared_draft_class?: string | null;
  prepared_draft_selection_reason?: string | null;
  prepared_draft_available?: boolean;
  prepared_draft_requires_approval?: boolean;
  prepared_draft_autonomy_decision?: {
    autonomy_level?: string | null;
    reversibility?: string | null;
    consequence_level?: string | null;
    confidence?: string | null;
    approval_required?: boolean | null;
    interruption_budget?: string | null;
    reason?: string | null;
  } | null;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary_lines?: string[];
  prepared_draft_object_refs?: string[];
  prepared_draft_object_labels?: string[];
  prepared_draft_thread_retrieval_state?: {
    summary: string;
    badges: string[];
  } | null;
  source_refs: string[];
};

export type DecisionOsPreparedDraftItem = {
  id: string;
  draft_class: string;
  title: string;
  channel: string;
  summary: string;
  body: string;
  confidence: string;
  readiness: string;
  response_due_hint: string;
  requires_approval: boolean;
  suggested_action: string;
  autonomy_decision?: {
    autonomy_level?: string | null;
    reversibility?: string | null;
    consequence_level?: string | null;
    confidence?: string | null;
    approval_required?: boolean | null;
    interruption_budget?: string | null;
    reason?: string | null;
  } | null;
  selection_reason?: string | null;
  approval_or_reversibility_hint?: string | null;
  provenance_cue?: string | null;
  autonomy_tier?: string | null;
  source_refs: string[];
  object_refs?: string[];
  object_labels?: string[];
  comparison_headers?: string[];
  comparison_rows?: Array<{ label: string; values: string[] }>;
};

export type DecisionOsProactiveSuggestion = NonNullable<DashboardBootstrap["proactive_suggestions"]>[number];

export type DecisionOsCostStatus = {
  level: string;
  title: string;
  detail: string;
  action_label: string;
};

export type DecisionOsCostSnapshot = {
  total_usd: number;
  total_tokens: number;
  event_count: number;
  run_count: number;
  monthly_budget_usd: number;
  soft_limit_ratio: number;
  recent_spend_usd_14d: number;
  cost_month_usd: number;
  estimated_monthly_margin_usd: number;
  deep_queries_today: number;
  daily_deep_query_limit: number;
  margin_guard_active: boolean;
  usage_guard_active: boolean;
};

export type DecisionOsCoreUpdateDetail = {
  suggestedMood?: DecisionOsSuggestedMood;
  continuityPrimaryMode?: DecisionOsContinuityPrimaryMode;
  queueState?: DecisionOsQueueBootstrapState;
  queueCompanionState?: DecisionOsQueueCompanionState;
  operationalBootstrap?: Pick<
    DashboardBootstrap,
    | "messages"
    | "thread_retrieval_state"
    | "action_log"
    | "proactive_suggestions"
    | "continuity_brief"
    | "continuity_state_fields"
    | "continuity_action_items"
    | "continuity_context_panel_items"
    | "continuity_context_pack_items"
    | "continuity_priority_card"
    | "runtime_updates"
    | "workflow_runtime_summary"
    | "browser_runtime_summary"
    | "task_runtime_summary"
    | "calendar_runtime_summary"
    | "trust_runtime_summary"
    | "file_runtime_summary"
    | "inbox_runtime_summary"
    | "device_sync_runtime_summary"
    | "runtime_deployment"
    | "support_access"
    | "cost_status"
    | "cost_snapshot"
  >;
};

export type DecisionOsNormalizedUpdateDetail = DecisionOsCoreUpdateDetail & {
  queueState: DecisionOsQueueBootstrapState;
  queueCompanionState: DecisionOsQueueCompanionState;
};

export type DecisionOsUpdateEventDetail<TDecision = unknown> =
  DecisionOsCoreUpdateDetail & { decisions?: TDecision[] };

type DecisionOsBriefingSource = Pick<
  DashboardBootstrapContinuity,
  "messages" | "continuity_brief" | "continuity_priority_card"
>;

type DashboardBootstrapContinuity = {
  messages?: DashboardBootstrap["messages"];
  thread_retrieval_state?: DashboardBootstrap["thread_retrieval_state"];
  action_log?: DashboardBootstrap["action_log"];
  cost_snapshot?: DecisionOsCostSnapshot | null;
  cost_status?: DecisionOsCostStatus | null;
  continuity_brief?: DashboardBootstrap["continuity_brief"];
  continuity_handoff?: DashboardBootstrap["continuity_handoff"];
  continuity_primary_mode?: string;
  continuity_priority_card?: DecisionOsPriorityCard | null;
  continuity_action_items?: DecisionOsActionItem[] | null;
  continuity_response_items?: DecisionOsResponseItem[] | null;
  continuity_prepared_draft_items?: DecisionOsPreparedDraftItem[] | null;
  continuity_context_panel_items?: DecisionOsContextPanelItem[] | null;
  continuity_context_pack_items?: DecisionOsContextPackItem[] | null;
  continuity_state_fields?: DecisionOsStateFieldItem[] | null;
  proactive_suggestions?: DecisionOsProactiveSuggestion[] | null;
  runtime_updates?: DashboardBootstrap["runtime_updates"];
  workflow_runtime_summary?: DashboardBootstrap["workflow_runtime_summary"];
  browser_runtime_summary?: DashboardBootstrap["browser_runtime_summary"];
  task_runtime_summary?: DashboardBootstrap["task_runtime_summary"];
  calendar_runtime_summary?: DashboardBootstrap["calendar_runtime_summary"];
  trust_runtime_summary?: DashboardBootstrap["trust_runtime_summary"];
  file_runtime_summary?: DashboardBootstrap["file_runtime_summary"];
  inbox_runtime_summary?: DashboardBootstrap["inbox_runtime_summary"];
  device_sync_runtime_summary?: DashboardBootstrap["device_sync_runtime_summary"];
  runtime_deployment?: DashboardBootstrap["runtime_deployment"];
  support_access?: DashboardBootstrap["support_access"];
};

export const DECISION_OS_UPDATE_EVENT = "omnyid:decision-os-update";

let latestDecisionOsUpdateDetailCache: DecisionOsNormalizedUpdateDetail | null = null;

function latestDecisionOsStateMessage(
  messages?: DashboardBootstrap["messages"] | null,
): AfpMessage | null {
  const continuityMessages = (messages ?? []).filter((message) => {
    if (message.type !== "state_snapshot" && message.type !== "state_synthesis") {
      return false;
    }
    return (
      message.thread_id === "continuity:state:user_01"
      || message.subtype === "homepage_briefing"
      || (typeof message.metadata?.synthesizer_handoff === "object"
        && (message.metadata?.synthesizer_handoff as { view_id?: unknown }).view_id === "homepage:state:user_01")
    );
  });
  return continuityMessages.at(-1) ?? null;
}

function fallbackDecisionOsBriefingFromMessages(
  messages?: DashboardBootstrap["messages"] | null,
): DecisionOsBriefing | undefined {
  const message = latestDecisionOsStateMessage(messages);
  if (!message) return undefined;
  const content = afpRecord(decryptedDisplayContent(message));
  if (message.type === "state_snapshot") {
    const suggestedActions = Array.isArray(content["suggested_actions"])
      ? content["suggested_actions"].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const decisionQueue = Array.isArray(content["decision_queue"])
      ? content["decision_queue"]
      : [];
    const activeCommitments = Array.isArray(content["active_commitments"])
      ? content["active_commitments"]
      : [];
    const criticalChanges = Array.isArray(content["critical_changes"])
      ? content["critical_changes"]
      : [];
    const northStar = suggestedActions[0]?.trim();
    if (!northStar) return undefined;
    return {
      northStar,
      urgentCount: criticalChanges.length,
      highImpactCount: Math.max(decisionQueue.length, criticalChanges.length),
      completedCount: 0,
      estimatedMinutes: Math.max(10, (decisionQueue.length + activeCommitments.length) * 10),
      totalDecisions: Math.max(1, decisionQueue.length),
    };
  }
  if (message.type === "state_synthesis") {
    const headline =
      typeof content["headline"] === "string" ? content["headline"].trim() : "";
    const pendingDecisionCount =
      typeof content["pending_decision_count"] === "number"
        ? content["pending_decision_count"]
        : 0;
    const activeTaskCount =
      typeof content["active_task_count"] === "number"
        ? content["active_task_count"]
        : 0;
    const unreadAlertCount =
      typeof content["unread_alert_count"] === "number"
        ? content["unread_alert_count"]
        : 0;
    if (!headline) return undefined;
    return {
      northStar: headline,
      urgentCount: unreadAlertCount,
      highImpactCount: Math.max(1, pendingDecisionCount),
      completedCount: 0,
      estimatedMinutes: Math.max(10, (pendingDecisionCount + activeTaskCount) * 10),
      totalDecisions: Math.max(1, pendingDecisionCount),
    };
  }
  return undefined;
}

export function decisionOsBriefing(
  source?: DecisionOsBriefingSource | null,
): DecisionOsBriefing | null {
  if (!source) return null;
  if (source.continuity_brief) {
    return {
      northStar: source.continuity_priority_card?.title ?? source.continuity_brief.title,
      urgentCount: source.continuity_priority_card?.requires_approval ? 1 : 0,
      highImpactCount: source.continuity_brief.decision_count,
      completedCount: 0,
      estimatedMinutes: Math.max(10, source.continuity_brief.commitment_count * 10),
      totalDecisions: Math.max(1, source.continuity_brief.decision_count),
    };
  }
  return fallbackDecisionOsBriefingFromMessages(source.messages) ?? null;
}

function suggestedMoodFromContinuityHandoff(
  handoff?: DashboardBootstrap["continuity_handoff"],
): DecisionOsSuggestedMood | undefined {
  const raw =
    typeof handoff?.["suggested_mood"] === "string"
      ? handoff["suggested_mood"].trim()
      : "";
  return decisionOsSuggestedMood(raw) ?? undefined;
}

export function decisionOsSuggestedMood(
  value: string | null | undefined,
): DecisionOsSuggestedMood | null {
  switch (value?.trim().toLowerCase()) {
    case "focused":
    case "happy":
    case "tired":
    case "stressed":
    case "neutral":
      return value.trim().toLowerCase() as DecisionOsSuggestedMood;
    default:
      return null;
  }
}

export function decisionOsContinuityPrimaryMode(
  value: string | null | undefined,
): DecisionOsContinuityPrimaryMode | null {
  switch (value?.trim().toLowerCase()) {
    case "priority_card":
    case "action_item":
    case "briefing_bar":
    case "continuity_panel":
      return value.trim().toLowerCase() as DecisionOsContinuityPrimaryMode;
    default:
      return null;
  }
}

export function decisionOsUpdateEventDecisions<TDecision>(
  detail: unknown,
): TDecision[] | undefined {
  if (!detail || typeof detail !== "object" || !("decisions" in detail)) return undefined;
  return Array.isArray(detail.decisions) ? detail.decisions : undefined;
}

function normalizeDecisionOsStateFields<T extends DecisionOsStateFieldItem>(
  items?: T[] | null,
): T[] {
  return visibleStateFields(items ?? []);
}

export function summarizeDecisionOsStateFields<T extends DecisionOsStateFieldItem>(
  items?: T[] | null,
): {
  fields: T[];
  count: number;
  hasVisible: boolean;
  leadingField: T | null;
} {
  const fields = normalizeDecisionOsStateFields(items);
  return {
    count: fields.length,
    fields,
    hasVisible: fields.length > 0,
    leadingField: fields[0] ?? null,
  };
}

export function normalizeDecisionOsUpdateDetail(
  detail: unknown,
): DecisionOsNormalizedUpdateDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const source = detail as DecisionOsCoreUpdateDetail;
  const queueState = source.queueState
    ?? decisionOsQueueBootstrapState(source.operationalBootstrap ?? null);
  const queueCompanionState = source.queueCompanionState
    ?? decisionOsQueueCompanionState(source.operationalBootstrap ?? null);
  const operationalBootstrap = source.operationalBootstrap;
  const normalizedOperationalStateFields = normalizeDecisionOsStateFields(
    operationalBootstrap?.continuity_state_fields,
  );
  return {
    suggestedMood: source.suggestedMood,
    continuityPrimaryMode:
      decisionOsContinuityPrimaryMode(source.continuityPrimaryMode) ?? undefined,
    queueState,
    queueCompanionState,
    operationalBootstrap:
      operationalBootstrap
        ? {
            ...operationalBootstrap,
            continuity_state_fields:
              normalizedOperationalStateFields.length > 0
                ? normalizedOperationalStateFields
                : undefined,
          }
        : undefined,
  };
}

export function buildDecisionOsUpdateDetail(
  payload: DashboardBootstrapContinuity,
): DecisionOsNormalizedUpdateDetail {
  const orderedVisibleStateFields = normalizeDecisionOsStateFields(
    payload.continuity_state_fields,
  );
  const queueInput = {
    continuity_priority_card: payload.continuity_priority_card,
    continuity_action_items: payload.continuity_action_items,
    continuity_context_panel_items: payload.continuity_context_panel_items,
    continuity_response_items: payload.continuity_response_items,
    continuity_prepared_draft_items: payload.continuity_prepared_draft_items,
    continuity_context_pack_items: payload.continuity_context_pack_items,
    proactive_suggestions: payload.proactive_suggestions,
  };
  const queueState = decisionOsQueueBootstrapState(queueInput);
  const queueCompanionState = decisionOsQueueCompanionState(queueInput);

  return {
    suggestedMood: suggestedMoodFromContinuityHandoff(payload.continuity_handoff),
    continuityPrimaryMode:
      decisionOsContinuityPrimaryMode(payload.continuity_primary_mode) ?? undefined,
    queueState,
    queueCompanionState,
    operationalBootstrap: {
      messages: dashboardBootstrapMessages(payload),
      thread_retrieval_state: payload.thread_retrieval_state ?? undefined,
      action_log: dashboardBootstrapActionLog(payload),
      proactive_suggestions: dashboardBootstrapProactiveSuggestions(payload),
      continuity_brief: payload.continuity_brief ?? null,
      continuity_state_fields:
        orderedVisibleStateFields.length > 0 ? orderedVisibleStateFields : undefined,
      continuity_action_items: decisionOsQueueActionItems(queueInput),
      continuity_context_panel_items: decisionOsQueueContextPanelItems(queueInput),
      continuity_context_pack_items: decisionOsQueueContextPackItems(queueInput),
      continuity_priority_card: decisionOsQueuePriorityCard(queueInput),
      runtime_updates: dashboardBootstrapRuntimeUpdates(payload),
      workflow_runtime_summary: payload.workflow_runtime_summary ?? null,
      browser_runtime_summary: payload.browser_runtime_summary ?? null,
      task_runtime_summary: payload.task_runtime_summary ?? null,
      calendar_runtime_summary: dashboardBootstrapCalendarRuntimeSummary(payload),
      trust_runtime_summary: payload.trust_runtime_summary ?? null,
      file_runtime_summary: payload.file_runtime_summary ?? null,
      inbox_runtime_summary: payload.inbox_runtime_summary ?? null,
      device_sync_runtime_summary: dashboardBootstrapDeviceSyncRuntimeSummary(payload),
      runtime_deployment: dashboardBootstrapRuntimeDeployment(payload),
      support_access: dashboardBootstrapSupportAccess(payload),
      cost_status: dashboardBootstrapCostStatus(payload),
      cost_snapshot: dashboardBootstrapCostSnapshot(payload),
    },
  };
}

export function dispatchDecisionOsUpdateEvent(
  payload: DashboardBootstrapContinuity,
  target: Window = window,
): void {
  const detail = buildDecisionOsUpdateDetail(payload);
  latestDecisionOsUpdateDetailCache = detail;
  target.dispatchEvent(
    new CustomEvent(DECISION_OS_UPDATE_EVENT, {
      detail,
    }),
  );
}

export function latestDecisionOsUpdateDetail(): DecisionOsNormalizedUpdateDetail | null {
  return latestDecisionOsUpdateDetailCache;
}

export function readDecisionOsUpdateEventDetail<
  TDecision = unknown,
>(
  event: Event,
):
  | DecisionOsNormalizedUpdateDetail
  | (DecisionOsNormalizedUpdateDetail & { decisions: TDecision[] })
  | null {
  const rawDetail = customEventDetail(event);
  const decisions = decisionOsUpdateEventDecisions<TDecision>(rawDetail);
  const normalizedDetail = normalizeDecisionOsUpdateDetail(rawDetail);
  if (!normalizedDetail) return null;
  if (typeof decisions === "undefined") {
    return normalizedDetail;
  }
  return {
    ...normalizedDetail,
    decisions,
  };
}

export function subscribeDecisionOsUpdateEvent<
  TDecision = unknown,
>(
  callback: (
    detail:
      | DecisionOsNormalizedUpdateDetail
      | (DecisionOsNormalizedUpdateDetail & { decisions: TDecision[] })
  ) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readDecisionOsUpdateEventDetail<TDecision>(event);
    if (detail === null) return;
    callback(detail);
  };
  target.addEventListener(DECISION_OS_UPDATE_EVENT, handler);
  return () => target.removeEventListener(DECISION_OS_UPDATE_EVENT, handler);
}
