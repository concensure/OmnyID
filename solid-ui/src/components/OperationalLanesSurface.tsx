// @locs-version: 1.0
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { workflowApprovalGateLabel } from "@/lib/workflowGraphCopy";
import { ReversibleActionNotice } from "@/components/renderers/ReversibleActionNotice";
import {
  undoAction,
  type DashboardBootstrap,
} from "@/lib/api";
import {
  dashboardBootstrapActionLog,
  dashboardBootstrapConversationAttentionItems,
  dashboardBootstrapContinuityStateFields,
  dashboardBootstrapMessages,
  dashboardBootstrapOperationalRuntimeState,
} from "@/lib/dashboardBootstrapState";
import { dispatchDashboardRefreshEvent } from "@/lib/dashboardRefreshEvent";
import {
  latestFieldCalibrationNoteFromMessages,
} from "afp-ts/continuity";
import {
  type DecisionOsActionItem,
  type DecisionOsContextPanelItem,
  type DecisionOsPriorityCard,
  type DecisionOsStateFieldItem,
  decisionOsContinuityLaneSummaryFromStateFieldSummary,
  summarizeDecisionOsStateFields,
} from "@/lib/decisionosContinuity";
import {
  decisionOsPreferredProactiveLaneSuggestion,
  decisionOsSimulatorPreviewLaneSelections,
} from "@/lib/decisionosContinuityLaneState";
import { decisionOsPreparedWorkSimulatorLaneState } from "@/lib/decisionosPreparedWorkState";
import { decisionOsTrustLaneState } from "@/lib/decisionOsTrustLaneState";
import { resolveReversibleAuditReviewTarget } from "@/lib/operationalLaneTrustReviewState";
import { operationalRuntimeLaneState } from "@/lib/operationalRuntimeLaneState";
import { operationalApprovalPendingReason } from "@/lib/operationalApprovalCopy";
import {
  simulatorRuntimeHighestRolloutStageLabel,
} from "@/lib/simulatorRuntimeState";
import {
  navigateToView,
  openDecisionOsStateFieldTarget,
  type DecisionOsSettingsTab,
} from "@/lib/decisionosNavigation";
import { normalizeViewName, type ViewName } from "@/lib/viewNames";
import {
  type DecisionOsQueueBootstrapState,
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
type DecisionOsOperationalLaneKey =
  | "continuity"
  | "proactive"
  | "runtime"
  | "tasks"
  | "calendar"
  | "inbox"
  | "files"
  | "devices"
  | "workflows"
  | "approvals"
  | "browser"
  | "trust"
  | "support";

type OperationalBootstrap = Pick<
  DashboardBootstrap,
  | "messages"
  | "action_log"
  | "proactive_suggestions"
  | "conversation_attention_items"
  | "conversation_attention_summary"
  | "continuity_brief"
  | "continuity_handoff"
  | "continuity_state_fields"
  | "continuity_action_items"
  | "continuity_response_items"
  | "continuity_context_pack_items"
  | "continuity_priority_card"
  | "runtime_updates"
  | "operational_guidance"
  | "workflow_runtime_summary"
  | "browser_runtime_summary"
  | "task_runtime_summary"
  | "calendar_runtime_summary"
  | "trust_runtime_summary"
  | "file_runtime_summary"
  | "inbox_runtime_summary"
  | "device_sync_runtime_summary"
  | "simulator_runtime_summary"
  | "runtime_deployment"
  | "support_access"
>;

type ProactiveSuggestion = NonNullable<OperationalBootstrap["proactive_suggestions"]>[number];
type ConversationAttentionItem = NonNullable<
  OperationalBootstrap["conversation_attention_items"]
>[number];

function conversationAttentionFamilyLabel(
  family: string | null | undefined,
): string {
  const normalizedFamily = (family ?? "").trim();
  switch (normalizedFamily) {
    case "forms":
      return "form review";
    case "bills":
      return "bill review";
    case "renewals":
      return "renewal review";
    case "communications":
      return "communication";
    default:
      return normalizedFamily || "background";
  }
}

type LaneCard = {
  key: DecisionOsOperationalLaneKey;
  label: string;
  title: string;
  detail: string;
  badge: string;
  reason: string;
  tone: string;
};

type RuntimeDigestItem = {
  key: string;
  label: string;
  value: string;
  reason: string;
  tone: string;
};

type RuntimeDigestSlot = {
  key: string;
  label: string;
  tone: string;
  selectLane: (laneCards: LaneCard[]) => LaneCard | undefined;
};

type LaneViewItem = {
  lane: LaneCard;
  cardClass: string;
  onOpen: () => void;
  onOpenKeyDown: (event: KeyboardEvent) => void;
  reviewSourceAction?: {
    label: string;
    onClick: (event: MouseEvent) => void;
  };
  trustUndoSection?: {
    entryItems: TrustUndoEntryViewItem[];
    notice: TrustUndoNoticeViewState;
  };
};

type TrustUndoEntryViewItem = {
  checkpointId: string;
  capabilityLabel: string;
  undoLabel: string;
  undoing: boolean;
  reviewActionLabel: string;
  undoActionLabel: string;
  undoActionClass: string;
  onReview: (event: MouseEvent) => void;
  onUndo: (event: MouseEvent) => void;
};

type TrustUndoNoticeViewState = {
  showNotice: boolean;
  summary?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type TrustLaneViewState = {
  showUndoSection: boolean;
  undoEntryItems: TrustUndoEntryViewItem[];
  notice: TrustUndoNoticeViewState;
};

type UndoReadyActionEntry = NonNullable<OperationalBootstrap["action_log"]>[number];
type ConversationAttentionLaneState = {
  title: string | null;
  badge: string | null;
  detail: string | null;
  reason: string | null;
};

type WorkflowRuntimeMetrics = {
  waitingCount: number;
  failedCount: number;
  completedCount: number;
  activeCount: number;
  pausedWaitResumeCount: number;
  workflowCount: number;
  latestTitle: string | null | undefined;
  latestStatus: string;
};

type BrowserTaskMetrics = {
  taskCount: number;
  pendingCount: number;
  blockedCount: number;
  approvalCount: number;
  failedCount: number;
  completedCount: number;
  cancelledCount: number;
  latestGoal: string | null | undefined;
  latestStatus: string;
};

type ReviewSourceTarget = {
  threadId: string;
  messageId: string;
};

type LaneThreadTarget = {
  view: ViewName;
  extra?: {
    eventId?: string;
    date?: string;
    threadId?: string;
    messageId?: string;
    settingsTab?: DecisionOsSettingsTab | null;
  };
};

const OPERATIONAL_LANE_VOCAB = {
  sectionLabel: "PersonalOS Runtime Lanes",
  sectionTitle:
    "How OmnyID is steering continuity, prepared work, execution, and trust",
  telemetryLabel: "Existing runtime summaries",
  lanes: {
    continuity: "Continuity State",
    proactive: "Prepared Work",
    runtime: "Runtime Delivery",
    tasks: "Tasks / Drafts",
    calendar: "Calendar / Holds",
    inbox: "Inbox / Triage",
    files: "Files / Ingest",
    devices: "Devices / Sync",
    workflows: "Workflow Runtime",
    approvals: workflowApprovalGateLabel(2, true),
    browser: "Browser Runner",
    trust: "Trust / Audit",
    support: "Support Boundary",
  },
} as const;

const OPERATIONAL_LANES_SECTION_CLASS =
  "rounded-[24px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.9))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]";
const OPERATIONAL_LANES_SECTION_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500";
const OPERATIONAL_LANES_SECTION_TITLE_CLASS =
  "mt-1 text-sm font-semibold text-on-surface";
const OPERATIONAL_LANES_TELEMETRY_BADGE_CLASS =
  "rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-[10px] font-medium text-slate-600";
const DIGEST_CARD_CLASS = "rounded-2xl border px-3 py-2";
const LANE_CARD_CLASS =
  "rounded-2xl border p-3 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10";
const LANE_BADGE_CLASS =
  "rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[10px] font-medium opacity-90";
const LANE_REASON_BADGE_CLASS =
  "rounded-full border border-current/12 bg-white/55 px-2 py-1 text-[10px] font-medium opacity-80";
const LANE_REVIEW_ACTION_CLASS =
  "rounded-full border border-current/15 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition hover:bg-white/90";
const TRUST_ENTRY_CLASS = "rounded-xl border border-current/10 bg-white/60 px-3 py-2";
const TRUST_ACTION_CLASS =
  "rounded-full border border-current/15 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition hover:bg-white/90";
const TRUST_ACTION_DISABLED_CLASS = "disabled:cursor-wait disabled:opacity-60";
const TRUST_NOTICE_ACTION_CLASS =
  "border border-current/15 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-current hover:bg-white/90";
const RUNTIME_DIGEST_SLOTS: RuntimeDigestSlot[] = [
  {
    key: "preparing",
    label: "Preparing",
    tone: "border-sky-200/70 bg-sky-50/80 text-sky-950",
    selectLane: (laneCards) => laneCards.find((lane) => lane.key === "proactive"),
  },
  {
    key: "waiting",
    label: "Waiting",
    tone: "border-amber-200/70 bg-amber-50/80 text-amber-950",
    selectLane: (laneCards) =>
      laneCards.find((lane) => lane.badge === "waiting")
      ?? laneCards.find((lane) => lane.key === "approvals" && lane.badge === "gated"),
  },
  {
    key: "blocked",
    label: "Blocked",
    tone: "border-rose-200/70 bg-rose-50/80 text-rose-950",
    selectLane: (laneCards) =>
      laneCards.find((lane) => lane.badge === "blocked" || lane.badge === "issue")
      ?? laneCards.find((lane) => lane.key === "browser"),
  },
  {
    key: "acted",
    label: "Acted",
    tone: "border-teal-200/70 bg-teal-50/80 text-teal-950",
    selectLane: (laneCards) =>
      laneCards.find((lane) => lane.badge === "done" || lane.badge === "audited")
      ?? laneCards.find((lane) => lane.key === "trust"),
  },
];

function contentString(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const raw = value?.[key];
  return typeof raw === "string" ? raw : null;
}

function calendarLaneDetail(
  calendarSummary: OperationalBootstrap["calendar_runtime_summary"] | null | undefined,
): string {
  if (!calendarSummary) return "Calendar coordination is available but currently quiet.";
  if ((calendarSummary.tentative_hold_count ?? 0) > 0) {
    const title = calendarSummary.latest_tentative_title?.trim();
    const noteKind = calendarSummary.latest_tentative_note_kind?.replaceAll("_", " ");
    const prepLead = calendarSummary.latest_tentative_prep_lead_minutes;
    const location = calendarSummary.latest_tentative_location?.trim();
    const profile = afpOptionalRecord(calendarSummary.latest_tentative_profile);
    const anchorType =
      typeof profile?.schedule_anchor_type === "string"
        ? profile.schedule_anchor_type.replaceAll("_", " ")
        : null;
    return [
      title
        ? `${title} is still tentative and bounded until explicitly confirmed.`
        : "Tentative scheduling work is active and remains reversible before commitment.",
      anchorType ? `Derived as ${anchorType} coordination.` : null,
      noteKind ? `Current prep mode: ${noteKind}.` : null,
      typeof prepLead === "number" ? `Protected lead time: ${prepLead} minutes.` : null,
      location ? `Latest hold location: ${location}.` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }
  if ((calendarSummary.confirmed_event_count ?? 0) > 0) {
    return "Calendar activity is present, but no tentative reversible hold is currently active.";
  }
  return "Calendar coordination is available but currently quiet.";
}

function calendarLaneTitle(
  calendarSummary: OperationalBootstrap["calendar_runtime_summary"] | null | undefined,
): string {
  if (!calendarSummary) return "No recent calendar hold activity";
  if ((calendarSummary.tentative_hold_count ?? 0) > 0) {
    const profile = afpOptionalRecord(calendarSummary.latest_tentative_profile);
    const anchorType =
      typeof profile?.schedule_anchor_type === "string"
        ? profile.schedule_anchor_type.replaceAll("_", " ")
        : null;
    const noteKind = calendarSummary.latest_tentative_note_kind?.replaceAll("_", " ");
    const holdCount = calendarSummary.tentative_hold_count ?? 0;
    if (anchorType && noteKind) {
      return `${anchorType} prep hold active (${noteKind})`;
    }
    if (anchorType) {
      return `${anchorType} hold${holdCount === 1 ? "" : "s"} active`;
    }
    return `${holdCount} tentative hold${holdCount === 1 ? "" : "s"} active`;
  }
  if ((calendarSummary.confirmed_event_count ?? 0) > 0) {
    return `${calendarSummary.confirmed_event_count ?? 0} calendar event${(calendarSummary.confirmed_event_count ?? 0) === 1 ? "" : "s"} scheduled`;
  }
  return "No recent calendar hold activity";
}

function calendarLaneBadge(
  calendarSummary: OperationalBootstrap["calendar_runtime_summary"] | null | undefined,
): string {
  if (!calendarSummary) return "idle";
  if ((calendarSummary.tentative_hold_count ?? 0) > 0) {
    const noteKind = calendarSummary.latest_tentative_note_kind?.trim().toLowerCase();
    const profile = afpOptionalRecord(calendarSummary.latest_tentative_profile);
    const anchorType =
      typeof profile?.schedule_anchor_type === "string"
        ? profile.schedule_anchor_type.trim().toLowerCase()
        : null;
    if (noteKind === "high_stakes_prep") return "high-stakes";
    if (anchorType === "interview") return "interview";
    if (anchorType === "medical") return "medical";
    if (anchorType === "logistics") return "logistics";
    if (anchorType === "meeting") return "meeting";
    return "tentative";
  }
  if ((calendarSummary.confirmed_event_count ?? 0) > 0) return "scheduled";
  return "idle";
}

function calendarLaneReason(
  calendarSummary: OperationalBootstrap["calendar_runtime_summary"] | null | undefined,
): string {
  if (!calendarSummary) return "no recent calendar hold activity";
  if ((calendarSummary.tentative_hold_count ?? 0) > 0) {
    const profile = afpOptionalRecord(calendarSummary.latest_tentative_profile);
    const anchorType =
      typeof profile?.schedule_anchor_type === "string"
        ? profile.schedule_anchor_type.replaceAll("_", " ")
        : null;
    return calendarSummary.latest_tentative_note_kind
      ? `${anchorType ?? "tentative hold"} active: ${calendarSummary.latest_tentative_note_kind.replaceAll("_", " ")}`
      : anchorType
        ? `${anchorType} hold active`
        : "tentative hold active";
  }
  if ((calendarSummary.confirmed_event_count ?? 0) > 0) {
    return "calendar events present";
  }
  return "no recent calendar hold activity";
}

function calendarLaneCard(
  calendarSummary: OperationalBootstrap["calendar_runtime_summary"] | null | undefined,
): LaneCard {
  return {
    key: "calendar",
    label: OPERATIONAL_LANE_VOCAB.lanes.calendar,
    title: calendarLaneTitle(calendarSummary),
    detail: calendarLaneDetail(calendarSummary),
    badge: calendarLaneBadge(calendarSummary),
    reason: calendarLaneReason(calendarSummary),
    tone: "border-emerald-200/80 bg-emerald-50/75 text-emerald-950",
  };
}

function reviewSourceTarget(
  threadId: string | null | undefined,
  messageId: string | null | undefined,
): ReviewSourceTarget | null {
  if (!threadId || !messageId) return null;
  return { threadId, messageId };
}

function taskLaneCard(
  taskSummary: OperationalBootstrap["task_runtime_summary"] | null | undefined,
): LaneCard {
  const activeDraftTaskCount = taskSummary?.active_draft_task_count ?? 0;
  const cancelledDraftTaskCount = taskSummary?.cancelled_draft_task_count ?? 0;

  return {
    key: "tasks",
    label: OPERATIONAL_LANE_VOCAB.lanes.tasks,
    title: activeDraftTaskCount > 0
      ? `${activeDraftTaskCount} draft task${activeDraftTaskCount === 1 ? "" : "s"} active`
      : cancelledDraftTaskCount > 0
        ? `${cancelledDraftTaskCount} draft task${cancelledDraftTaskCount === 1 ? "" : "s"} cancelled`
        : "No recent draft task activity",
    detail: activeDraftTaskCount > 0
      ? taskSummary?.latest_draft_task_title
        ? `${taskSummary.latest_draft_task_title} remains as bounded draft work inside OmnyID.`
        : "Bounded draft task work is active and remains undoable through shared lineage."
      : cancelledDraftTaskCount > 0
        ? "Recent draft task work was cancelled cleanly and remains reviewable through audit lineage."
        : "Task drafting is available but currently quiet.",
    badge: activeDraftTaskCount > 0 ? "draft" : cancelledDraftTaskCount > 0 ? "cancelled" : "idle",
    reason: activeDraftTaskCount > 0
      ? "bounded draft task active"
      : cancelledDraftTaskCount > 0
        ? "draft task cancel lineage recorded"
        : "no recent draft task activity",
    tone: "border-orange-200/80 bg-orange-50/75 text-orange-950",
  };
}

function inboxLaneCard(
  inboxSummary: OperationalBootstrap["inbox_runtime_summary"] | null | undefined,
): LaneCard {
  const activeStagedOrganizationCount = inboxSummary?.active_staged_organization_count ?? 0;
  const revertedOrganizationCount = inboxSummary?.reverted_organization_count ?? 0;

  return {
    key: "inbox",
    label: OPERATIONAL_LANE_VOCAB.lanes.inbox,
    title: activeStagedOrganizationCount > 0
      ? `${activeStagedOrganizationCount} inbox organization step${activeStagedOrganizationCount === 1 ? "" : "s"} staged`
      : revertedOrganizationCount > 0
        ? `${revertedOrganizationCount} inbox organization revert${revertedOrganizationCount === 1 ? "" : "s"} recorded`
        : "No recent inbox organization activity",
    detail: activeStagedOrganizationCount > 0
      ? inboxSummary?.latest_conversation_ref
        ? `${inboxSummary.latest_conversation_ref} has bounded organization state ready for review before any outbound action.`
        : "Inbox triage state is staged as bounded internal organization work."
      : revertedOrganizationCount > 0
        ? inboxSummary?.latest_provider
          ? `Recent ${inboxSummary.latest_provider} inbox organization work has explicit compensating lineage.`
          : "Recent inbox organization work was reverted through append-only lineage."
        : "Inbox organization is available but currently quiet.",
    badge: activeStagedOrganizationCount > 0 ? "staged" : revertedOrganizationCount > 0 ? "reverted" : "idle",
    reason: activeStagedOrganizationCount > 0
      ? "bounded inbox triage staged"
      : revertedOrganizationCount > 0
        ? "compensating inbox lineage recorded"
        : "no recent inbox triage activity",
    tone: "border-lime-200/80 bg-lime-50/75 text-lime-950",
  };
}

function fileLaneCard(
  fileSummary: OperationalBootstrap["file_runtime_summary"] | null | undefined,
): LaneCard {
  const pendingAccessRequestCount = fileSummary?.pending_access_request_count ?? 0;
  const deniedAccessCount = fileSummary?.denied_access_count ?? 0;
  const activeGrantCount = fileSummary?.active_grant_count ?? 0;
  const activeStagedBundleCount = fileSummary?.active_staged_bundle_count ?? 0;
  const discardedBundleCount = fileSummary?.discarded_bundle_count ?? 0;
  const exportResultCount = fileSummary?.export_result_count ?? 0;
  const activeFileEntryCount = fileSummary?.active_file_entry_count ?? 0;
  const activeStagedBundleFileCount = fileSummary?.active_staged_bundle_file_count ?? 0;
  const latestLedgerName = fileSummary?.latest_ledger_name ?? "A file ledger";

  return {
    key: "files",
    label: OPERATIONAL_LANE_VOCAB.lanes.files,
    title: pendingAccessRequestCount > 0
      ? `${pendingAccessRequestCount} file access request${pendingAccessRequestCount === 1 ? "" : "s"} waiting`
      : deniedAccessCount > 0
        ? `${deniedAccessCount} file access request${deniedAccessCount === 1 ? "" : "s"} denied`
      : activeGrantCount > 0
        ? `${activeGrantCount} file grant${activeGrantCount === 1 ? "" : "s"} active`
      : activeStagedBundleCount > 0
        ? `${activeStagedBundleCount} staged file bundle${activeStagedBundleCount === 1 ? "" : "s"} ready`
      : discardedBundleCount > 0
        ? `${discardedBundleCount} staged file bundle discard${discardedBundleCount === 1 ? "" : "s"} recorded`
      : exportResultCount > 0
        ? `${exportResultCount} file export${exportResultCount === 1 ? "" : "s"} completed`
      : activeFileEntryCount > 0
        ? `${activeFileEntryCount} file ledger entr${activeFileEntryCount === 1 ? "y" : "ies"} active`
        : "No recent file or ingest activity",
    detail: pendingAccessRequestCount > 0
      ? "File/object work is waiting on explicit access before continuing."
      : deniedAccessCount > 0
        ? "Recent file/object work hit an access boundary that remains reviewable."
      : activeGrantCount > 0
        ? "A file access grant is active for bounded ingest or editing work."
      : activeStagedBundleCount > 0
        ? `${activeStagedBundleFileCount} file${activeStagedBundleFileCount === 1 ? "" : "s"} are staged for bounded review before any export boundary is crossed.`
      : discardedBundleCount > 0
        ? "Recent staged file bundle work was explicitly discarded and remains reviewable through compensating lineage."
      : exportResultCount > 0
        ? `${latestLedgerName} recently produced an exportable result.`
      : activeFileEntryCount > 0
        ? `${fileSummary?.latest_ledger_name ?? "File ledger"} activity is attached even when the feed is sparse.`
        : "File/object ingest is available but currently quiet.",
    badge: pendingAccessRequestCount > 0 ? "waiting" : deniedAccessCount > 0 ? "blocked" : activeGrantCount > 0 ? "active" : activeStagedBundleCount > 0 ? "staged" : discardedBundleCount > 0 ? "discarded" : exportResultCount > 0 ? "done" : activeFileEntryCount > 0 ? "indexed" : "idle",
    reason: pendingAccessRequestCount > 0
      ? operationalApprovalPendingReason("file access")
      : deniedAccessCount > 0
        ? "access boundary denied"
      : activeGrantCount > 0
        ? "bounded file grant active"
      : activeStagedBundleCount > 0
        ? "prepared bundle review staged"
      : discardedBundleCount > 0
        ? "bundle discard lineage recorded"
      : exportResultCount > 0
        ? "recent export result available"
      : activeFileEntryCount > 0
        ? "file ledger indexed"
        : "no recent ingest activity",
    tone: "border-cyan-200/80 bg-cyan-50/75 text-cyan-950",
  };
}

function deviceSyncLaneCard(
  deviceSyncSummary: OperationalBootstrap["device_sync_runtime_summary"] | null | undefined,
): LaneCard {
  const devicePolicyCount = deviceSyncSummary?.device_policy_count ?? 0;
  const usedDeviceCount = deviceSyncSummary?.used_device_count ?? 0;

  return {
    key: "devices",
    label: OPERATIONAL_LANE_VOCAB.lanes.devices,
    title: devicePolicyCount > 0
      ? `${devicePolicyCount} sync device polic${devicePolicyCount === 1 ? "y" : "ies"} tracked`
      : "No sync device policies attached",
    detail: devicePolicyCount > 0
      ? usedDeviceCount > 0
        ? `${usedDeviceCount} device${usedDeviceCount === 1 ? "" : "s"} have bootstrapped recently, most recently ${deviceSyncSummary?.latest_device_class ?? "device"} / ${deviceSyncSummary?.latest_policy_profile ?? "default"}.`
        : deviceSyncSummary?.latest_policy_note
          ? `${deviceSyncSummary.latest_policy_note}`
          : "Bootstrap bundles and stored sync profiles are present but no device has reported usage yet."
      : "Device-local sync policy is available but not yet provisioned.",
    badge: usedDeviceCount > 0
      ? "used"
      : devicePolicyCount > 0
        ? "provisioned"
        : "idle",
    reason: usedDeviceCount > 0
      ? "live bootstrap usage recorded"
      : devicePolicyCount > 0
        ? "device sync policies provisioned"
        : "no sync devices provisioned",
    tone: "border-indigo-200/80 bg-indigo-50/75 text-indigo-950",
  };
}

function runtimeLaneCard(
  runtimeFramework: string | null,
  runtimeStatus: string,
  runtimeDeploymentState: OperationalBootstrap["runtime_deployment"] | null | undefined,
  simulatorRuntimeSummary: OperationalBootstrap["simulator_runtime_summary"] | null | undefined,
  operationalGuidance: OperationalBootstrap["operational_guidance"] | null | undefined,
): LaneCard {
  const laneState = operationalRuntimeLaneState(
    runtimeFramework,
    runtimeStatus,
    runtimeDeploymentState,
    simulatorRuntimeSummary,
    operationalGuidance,
  );
  const observedRolloutStage = simulatorRuntimeSummary?.observed_rollout_stage?.trim() || null;
  const rolloutStage = observedRolloutStage || simulatorRuntimeHighestRolloutStageLabel(simulatorRuntimeSummary);
  return {
    key: "runtime",
    label: OPERATIONAL_LANE_VOCAB.lanes.runtime,
    title: laneState.title,
    detail: laneState.detail,
    badge: runtimeStatus,
    reason: laneState.reason,
    tone: "border-violet-200/80 bg-violet-50/75 text-violet-950",
  };
}

function workflowLaneCard(
  workflowMetrics: WorkflowRuntimeMetrics,
): LaneCard {
  return {
    key: "workflows",
    label: OPERATIONAL_LANE_VOCAB.lanes.workflows,
    title: workflowMetrics.waitingCount > 0
      ? `${workflowMetrics.waitingCount} workflow wait${workflowMetrics.waitingCount === 1 ? "" : "s"} need review`
      : workflowMetrics.failedCount > 0
        ? `${workflowMetrics.failedCount} workflow issue${workflowMetrics.failedCount === 1 ? "" : "s"} observed`
        : workflowMetrics.completedCount > 0
          ? `${workflowMetrics.completedCount} workflow result${workflowMetrics.completedCount === 1 ? "" : "s"} completed`
        : workflowMetrics.activeCount > 0
          ? `${workflowMetrics.activeCount} workflow run${workflowMetrics.activeCount === 1 ? "" : "s"} active`
        : workflowMetrics.workflowCount > 0
          ? `${workflowMetrics.workflowCount} workflow${workflowMetrics.workflowCount === 1 ? "" : "s"} configured`
          : "No recent workflow runtime activity",
    detail: workflowMetrics.waitingCount > 0
      ? workflowMetrics.pausedWaitResumeCount > 0
        ? `${workflowMetrics.pausedWaitResumeCount} paused wait${workflowMetrics.pausedWaitResumeCount === 1 ? "" : "s"} are holding workflow progress.`
        : "Workflow runtime is paused on explicit review or approval."
      : workflowMetrics.failedCount > 0
        ? workflowMetrics.latestTitle
          ? `${workflowMetrics.latestTitle} is reporting a failed or errored run state.`
          : "Recent workflow artifacts include failures or error states."
      : workflowMetrics.completedCount > 0
        ? workflowMetrics.latestTitle
          ? `${workflowMetrics.latestTitle} most recently completed with status ${workflowMetrics.latestStatus || "completed"}.`
          : "Recent workflow runs completed and left visible runtime artifacts."
      : workflowMetrics.activeCount > 0
        ? workflowMetrics.latestTitle
          ? `${workflowMetrics.latestTitle} currently has active runtime work in progress.`
          : "Workflow runtime currently has active runs in progress."
      : workflowMetrics.workflowCount > 0
        ? "Workflow runtime is configured even when recent feed artifacts are sparse."
        : "Workflow runtime is available but currently quiet.",
    badge: workflowMetrics.waitingCount > 0 ? "waiting" : workflowMetrics.failedCount > 0 ? "issue" : workflowMetrics.completedCount > 0 ? "done" : workflowMetrics.activeCount > 0 ? "active" : workflowMetrics.workflowCount > 0 ? "configured" : "idle",
    reason: workflowMetrics.waitingCount > 0
      ? "approval or wait-resume pause"
      : workflowMetrics.failedCount > 0
        ? "recent workflow failure"
      : workflowMetrics.completedCount > 0
        ? "recent run completed"
      : workflowMetrics.activeCount > 0
        ? "workflow run in progress"
      : workflowMetrics.workflowCount > 0
        ? "configured but currently quiet"
        : "no workflow activity",
    tone: "border-fuchsia-200/80 bg-fuchsia-50/75 text-fuchsia-950",
  };
}

function approvalsLaneCard(
  approvalCount: number,
  simulatorApprovalLane: ReturnType<typeof decisionOsPreparedWorkSimulatorLaneState>,
): LaneCard {
  return {
    key: "approvals",
    label: OPERATIONAL_LANE_VOCAB.lanes.approvals,
    title: approvalCount > 0
      ? `${approvalCount} approval-bound item${approvalCount === 1 ? "" : "s"}`
      : simulatorApprovalLane
        ? simulatorApprovalLane.title
        : "No approval queue pressure",
    detail: approvalCount > 0
      ? "High-consequence work is being kept explicitly reviewable."
      : simulatorApprovalLane
        ? simulatorApprovalLane.detail
        : "No current approval-bound actions are blocking flow.",
    badge: approvalCount > 0 ? "gated" : simulatorApprovalLane ? "preview" : "clear",
    reason: approvalCount > 0
      ? "human review required"
      : simulatorApprovalLane
        ? simulatorApprovalLane.reason
        : "no approval-bound items",
    tone: "border-amber-200/80 bg-amber-50/75 text-amber-950",
  };
}

function browserLaneCard(
  browserMetrics: BrowserTaskMetrics,
): LaneCard {
  return {
    key: "browser",
    label: OPERATIONAL_LANE_VOCAB.lanes.browser,
    title: browserMetrics.blockedCount > 0
      ? `${browserMetrics.blockedCount} browser task${browserMetrics.blockedCount === 1 ? "" : "s"} blocked`
      : browserMetrics.approvalCount > 0
        ? `${browserMetrics.approvalCount} browser task${browserMetrics.approvalCount === 1 ? "" : "s"} need step approval`
      : browserMetrics.failedCount > 0
        ? `${browserMetrics.failedCount} browser task${browserMetrics.failedCount === 1 ? "" : "s"} failed`
      : browserMetrics.pendingCount > 0
        ? `${browserMetrics.pendingCount} browser task${browserMetrics.pendingCount === 1 ? "" : "s"} pending`
      : browserMetrics.completedCount > 0
        ? `${browserMetrics.completedCount} browser task${browserMetrics.completedCount === 1 ? "" : "s"} completed`
      : browserMetrics.cancelledCount > 0
        ? `${browserMetrics.cancelledCount} browser task${browserMetrics.cancelledCount === 1 ? "" : "s"} cancelled`
      : browserMetrics.taskCount > 0
        ? `${browserMetrics.taskCount} browser task${browserMetrics.taskCount === 1 ? "" : "s"} observed`
        : "No recent browser task activity",
    detail: browserMetrics.blockedCount > 0
      ? browserMetrics.latestGoal
        ? `${browserMetrics.latestGoal} is blocked and needs explicit unblocking.`
        : "The browser runner has encountered a barrier that needs explicit unblocking."
      : browserMetrics.approvalCount > 0
        ? browserMetrics.latestGoal
          ? `${browserMetrics.latestGoal} is step-gated and waiting for explicit confirmation.`
          : "The browser runner has step-gated tasks waiting for explicit confirmation."
      : browserMetrics.failedCount > 0
        ? browserMetrics.latestGoal
          ? `${browserMetrics.latestGoal} most recently reported status ${browserMetrics.latestStatus || "failed"}.`
          : "Recent browser results include failures or unresolved runtime errors."
      : browserMetrics.pendingCount > 0
        ? browserMetrics.latestGoal
          ? `${browserMetrics.latestGoal} is currently active in the browser runner.`
          : "The browser runner has user-approved requests waiting to progress."
      : browserMetrics.completedCount > 0
        ? browserMetrics.latestGoal
          ? `${browserMetrics.latestGoal} completed and left auditable lineage in the feed.`
          : "Recent browser tasks completed and left auditable lineage in the feed."
      : browserMetrics.cancelledCount > 0
        ? "Recent browser work was cancelled and remains reviewable through lineage."
      : browserMetrics.taskCount > 0
        ? "Browser runner state is attached even when the current feed is sparse."
        : "The browser runner is available but not currently active.",
    badge: browserMetrics.blockedCount > 0 ? "blocked" : browserMetrics.approvalCount > 0 ? "approval" : browserMetrics.failedCount > 0 ? "issue" : browserMetrics.pendingCount > 0 ? "pending" : browserMetrics.completedCount > 0 ? "done" : browserMetrics.cancelledCount > 0 ? "cancelled" : browserMetrics.taskCount > 0 ? "active" : "idle",
    reason: browserMetrics.blockedCount > 0
      ? "manual unblock required"
      : browserMetrics.approvalCount > 0
        ? operationalApprovalPendingReason("this browser step")
      : browserMetrics.failedCount > 0
        ? "recent browser failure"
      : browserMetrics.pendingCount > 0
        ? "runner task in progress"
      : browserMetrics.completedCount > 0
        ? "recent task completed"
      : browserMetrics.cancelledCount > 0
        ? "recent task cancelled"
      : browserMetrics.taskCount > 0
        ? "runner history attached"
        : "no recent browser tasks",
    tone: "border-slate-200/80 bg-slate-50/85 text-slate-900",
  };
}

function supportLaneCard(
  supportStatus: string,
): LaneCard {
  return {
    key: "support",
    label: OPERATIONAL_LANE_VOCAB.lanes.support,
    title: supportStatus === "active"
      ? "Support access is temporarily active"
      : supportStatus === "revoked"
        ? "Support access has been revoked"
        : "Support access is disabled by default",
    detail: supportStatus === "active"
      ? "Privacy boundary has been opened explicitly for bounded support access."
      : "Default privacy boundary is intact unless the user opens it explicitly.",
    badge: supportStatus,
    reason: supportStatus === "active" ? "support boundary opened" : supportStatus === "revoked" ? "support boundary revoked" : "support access disabled by default",
    tone: "border-rose-200/80 bg-rose-50/75 text-rose-950",
  };
}

function continuityLaneCard(
  title: string,
  detail: string,
  badge: string,
  reason: string,
): LaneCard {
  return {
    key: "continuity",
    label: OPERATIONAL_LANE_VOCAB.lanes.continuity,
    title,
    detail,
    badge,
    reason,
    tone: "border-emerald-200/80 bg-emerald-50/75 text-emerald-950",
  };
}

function proactiveLaneCard(
  conversationAttentionCount: number,
  conversationAttentionLane: ConversationAttentionLaneState,
  proactiveCount: number,
  preferredProactiveDetail: string | null | undefined,
  preferredProactiveReason: string | null | undefined,
): LaneCard {
  return {
    key: "proactive",
    label: OPERATIONAL_LANE_VOCAB.lanes.proactive,
    title: conversationAttentionCount > 0
      ? conversationAttentionLane.title
        ?? `${conversationAttentionCount} background work item${conversationAttentionCount === 1 ? "" : "s"} queued`
      : proactiveCount > 0
        ? `${proactiveCount} suggestion${proactiveCount === 1 ? "" : "s"} pending`
        : "No queued proactive suggestions",
    detail: conversationAttentionCount > 0
      ? conversationAttentionLane.detail ?? "Background personalOS work is waiting for review."
      : proactiveCount > 0
        ? preferredProactiveDetail ?? "Prepared artifacts and continuity prompts are waiting for review."
        : "The proactive engine is currently quiet.",
    badge: conversationAttentionCount > 0
      ? conversationAttentionLane.badge ?? "queued"
      : proactiveCount > 0
        ? "queued"
        : "idle",
    reason: conversationAttentionCount > 0
      ? conversationAttentionLane.reason ?? "background work queued"
      : proactiveCount > 0
        ? preferredProactiveReason ?? "prepared work queued"
        : "no queued proactive suggestions",
    tone: "border-sky-200/80 bg-sky-50/75 text-sky-950",
  };
}

function trustLaneCard(
  simulatorPreviewLane: ReturnType<typeof decisionOsPreparedWorkSimulatorLaneState>,
  provenanceCount: number,
  actionAuditCount: number,
  failedAuditCount: number,
  pendingAuditCount: number,
  successfulAuditCount: number,
  reversibleActionCount: number,
  undoReadyActionCount: number,
  latestProvenanceActionType: string | null | undefined,
  latestAuditStatus: string,
  latestUndoLabel: string | null | undefined,
  fieldCalibrationNote: string | null,
): LaneCard {
  const trustLane = decisionOsTrustLaneState({
    simulatorPreviewLane,
    provenanceCount,
    actionAuditCount,
    failedAuditCount,
    pendingAuditCount,
    successfulAuditCount,
    reversibleActionCount,
    undoReadyActionCount,
    latestProvenanceActionType,
    latestAuditStatus,
    latestUndoLabel,
    fieldCalibrationNote,
  });
  return {
    key: "trust",
    label: OPERATIONAL_LANE_VOCAB.lanes.trust,
    title: trustLane.title,
    detail: trustLane.detail,
    badge: trustLane.badge,
    reason: trustLane.reason,
    tone: "border-teal-200/80 bg-teal-50/75 text-teal-950",
  };
}

function lower(value: string | null | undefined): string {
  return value?.toLowerCase() ?? "";
}

function conversationAttentionSummaryLine(
  summary: OperationalBootstrap["conversation_attention_summary"],
): string | null {
  if (!summary || summary.count <= 0) return null;
  if (summary.approval_request_count > 0) {
    return `${summary.approval_request_count} approval request${summary.approval_request_count === 1 ? "" : "s"} waiting.`;
  }
  if ((summary.form_count ?? 0) > 0
    && (summary.form_count ?? 0) >= (summary.bill_count ?? 0)
    && (summary.form_count ?? 0) >= (summary.renewal_count ?? 0)
    && (summary.form_count ?? 0) >= (summary.communication_count ?? 0)) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} form review${summary.prepared_draft_count === 1 ? "" : "s"} ready.`;
    }
    return `${summary.form_count} form review${summary.form_count === 1 ? "" : "s"} queued.`;
  }
  if ((summary.bill_count ?? 0) > 0
    && (summary.bill_count ?? 0) >= (summary.renewal_count ?? 0)
    && (summary.bill_count ?? 0) >= (summary.communication_count ?? 0)) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} bill review${summary.prepared_draft_count === 1 ? "" : "s"} ready.`;
    }
    return `${summary.bill_count} bill review${summary.bill_count === 1 ? "" : "s"} queued.`;
  }
  if ((summary.renewal_count ?? 0) > 0
    && (summary.renewal_count ?? 0) >= (summary.communication_count ?? 0)) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} renewal review${summary.prepared_draft_count === 1 ? "" : "s"} ready.`;
    }
    return `${summary.renewal_count} renewal review${summary.renewal_count === 1 ? "" : "s"} queued.`;
  }
    if (summary.prepared_draft_count > 0) {
      if ((summary.communication_count ?? 0) > 0) {
        return `${summary.prepared_draft_count} communication draft${summary.prepared_draft_count === 1 ? "" : "s"} ready.`;
      }
      return `${summary.prepared_draft_count} prepared background work item${summary.prepared_draft_count === 1 ? "" : "s"} ready.`;
    }
    if ((summary.communication_count ?? 0) > 0) {
      return `${summary.communication_count} communication follow-up${summary.communication_count === 1 ? "" : "s"} queued.`;
    }
    if (summary.background_follow_up_count > 0) {
      return `${summary.background_follow_up_count} background work item${summary.background_follow_up_count === 1 ? "" : "s"} queued.`;
    }
  return null;
}

function conversationAttentionFormOwnerHint(
  item: ConversationAttentionItem | undefined,
): string | null {
  const owner = item?.latest_form_owner?.trim();
  return owner ? `For ${owner}` : null;
}

function conversationAttentionSubmissionModeHint(
  item: ConversationAttentionItem | undefined,
): string | null {
  const mode = item?.latest_submission_mode?.trim();
  return mode ? `Submit via ${mode}` : null;
}

function conversationAttentionDetail(
  item: ConversationAttentionItem | undefined,
  count: number,
  summary: OperationalBootstrap["conversation_attention_summary"],
): string | null {
  if (count > 1) {
    return conversationAttentionSummaryLine(summary);
  }
  const valueHint = item?.latest_value_hint?.trim();
  if (item?.conversation_family === "forms") {
    const owner = conversationAttentionFormOwnerHint(item);
    const mode = conversationAttentionSubmissionModeHint(item);
    const sensitive =
      item.latest_sensitive_form === true ? "Sensitive form." : null;
    const details = [
      valueHint,
      owner ? `${owner}.` : null,
      mode ? `${mode}.` : null,
      sensitive,
    ].filter(
      (detail, index, all): detail is string =>
        typeof detail === "string" && all.indexOf(detail) === index,
    );
    if (details.length > 0) return details.join(" ");
  }
  return valueHint || item?.summary?.trim() || conversationAttentionSummaryLine(summary);
}

function conversationAttentionTitle(
  item: ConversationAttentionItem | undefined,
  count: number,
  summary: OperationalBootstrap["conversation_attention_summary"],
): string | null {
  if (count > 1 && summary) {
    if (summary.approval_request_count > 0) {
      return `${summary.approval_request_count} approval request${summary.approval_request_count === 1 ? "" : "s"} waiting`;
    }
    if ((summary.form_count ?? 0) > 0
      && (summary.form_count ?? 0) >= (summary.bill_count ?? 0)
      && (summary.form_count ?? 0) >= (summary.renewal_count ?? 0)
      && (summary.form_count ?? 0) >= (summary.communication_count ?? 0)) {
      return `${summary.form_count} form review${summary.form_count === 1 ? "" : "s"} queued`;
    }
    if ((summary.bill_count ?? 0) > 0
      && (summary.bill_count ?? 0) >= (summary.renewal_count ?? 0)
      && (summary.bill_count ?? 0) >= (summary.communication_count ?? 0)) {
      return `${summary.bill_count} bill review${summary.bill_count === 1 ? "" : "s"} queued`;
    }
    if ((summary.renewal_count ?? 0) > 0
      && (summary.renewal_count ?? 0) >= (summary.communication_count ?? 0)) {
      return `${summary.renewal_count} renewal review${summary.renewal_count === 1 ? "" : "s"} queued`;
    }
    if ((summary.communication_count ?? 0) > 0) {
      if (summary.prepared_draft_count > 0) {
        return `${summary.prepared_draft_count} communication draft${summary.prepared_draft_count === 1 ? "" : "s"} queued`;
      }
      return `${summary.communication_count} communication follow-up${summary.communication_count === 1 ? "" : "s"} queued`;
    }
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} prepared background work item${summary.prepared_draft_count === 1 ? "" : "s"} queued`;
    }
  }
  if (!item || count !== 1) return null;
  const family = item.conversation_family_label?.trim()
    || conversationAttentionFamilyLabel(item.conversation_family);
  const attention = item.latest_attention_label?.trim();
  if (!family || !attention) return null;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${attention}`;
}

function conversationAttentionBadge(
  item: ConversationAttentionItem | undefined,
  count: number,
  summary: OperationalBootstrap["conversation_attention_summary"],
): string | null {
  if (!item) return null;
  if (count === 1) {
    const attention = item.latest_attention_label?.trim();
    if (attention) return attention;
  }
  if (summary) {
    if (summary.approval_request_count > 0) return "gated";
    if (summary.prepared_draft_count > 0) return "ready";
  }
  switch (item.latest_attention_kind) {
    case "approval_request":
      return "gated";
    case "prepared_draft":
      return "ready";
    default:
      return "queued";
  }
}

function conversationAttentionReason(
  item: ConversationAttentionItem | undefined,
  count: number,
  summary: OperationalBootstrap["conversation_attention_summary"],
): string | null {
  if (count > 1 && summary) {
    if (summary.approval_request_count > 0) {
      return "approval requests waiting";
    }
    if ((summary.form_count ?? 0) > 0
      && (summary.form_count ?? 0) >= (summary.bill_count ?? 0)
      && (summary.form_count ?? 0) >= (summary.renewal_count ?? 0)
      && (summary.form_count ?? 0) >= (summary.communication_count ?? 0)) {
      return summary.prepared_draft_count > 0
        ? "prepared form reviews queued"
        : "form reviews queued";
    }
    if ((summary.bill_count ?? 0) > 0
      && (summary.bill_count ?? 0) >= (summary.renewal_count ?? 0)
      && (summary.bill_count ?? 0) >= (summary.communication_count ?? 0)) {
      return summary.prepared_draft_count > 0
        ? "prepared bill reviews queued"
        : "bill reviews queued";
    }
    if ((summary.renewal_count ?? 0) > 0
      && (summary.renewal_count ?? 0) >= (summary.communication_count ?? 0)) {
      return summary.prepared_draft_count > 0
        ? "prepared renewal reviews queued"
        : "renewal reviews queued";
    }
    if ((summary.communication_count ?? 0) > 0) {
      return summary.prepared_draft_count > 0
        ? "prepared communication drafts queued"
        : "communication follow-ups queued";
    }
    return "background work queued";
  }
  if (!item) return null;
  const family = item.conversation_family_label?.trim()
    || conversationAttentionFamilyLabel(item.conversation_family);
  const preparedReason = (() => {
    switch (item.conversation_family) {
      case "communications":
        return "prepared communication draft queued";
      case "renewals":
        return "prepared renewal review queued";
      case "bills":
        return "prepared bill review queued";
      case "forms":
        return "prepared form review queued";
      default:
        return family ? `prepared ${family} queued` : "prepared background work queued";
    }
  })();
  const backgroundReason =
    item.conversation_family === "communications"
      ? "communication follow-up queued"
      : family ? `background ${family} queued` : "background work queued";
  const valueHint = item.latest_value_hint?.trim();
  if (valueHint) {
    switch (item.latest_attention_kind) {
      case "approval_request":
        return `${valueHint.toLowerCase()}, approval-required ${family} queued`;
      case "prepared_draft":
        return `${valueHint.toLowerCase()}, ${preparedReason}`;
      default:
        return `${valueHint.toLowerCase()}, ${backgroundReason}`;
    }
  }
  switch (item.latest_attention_kind) {
    case "approval_request":
      return `approval-required ${family} queued`;
    case "prepared_draft":
      return preparedReason;
    default:
      return backgroundReason;
  }
}

function conversationAttentionLaneState(
  item: ConversationAttentionItem | undefined,
  count: number,
  summary: OperationalBootstrap["conversation_attention_summary"],
): ConversationAttentionLaneState {
  return {
    title: conversationAttentionTitle(item, count, summary),
    badge: conversationAttentionBadge(item, count, summary),
    detail: conversationAttentionDetail(item, count, summary),
    reason: conversationAttentionReason(item, count, summary),
  };
}

function preferredConversationAttentionItem(
  items: ConversationAttentionItem[],
): ConversationAttentionItem | undefined {
  let preferred: ConversationAttentionItem | undefined;
  for (const item of items) {
    if (!preferred) {
      preferred = item;
      continue;
    }
    const rankDiff = (item.attention_rank ?? 0) - (preferred.attention_rank ?? 0);
    if (rankDiff > 0) {
      preferred = item;
      continue;
    }
    if (rankDiff === 0 && item.last_observed_at.localeCompare(preferred.last_observed_at) > 0) {
      preferred = item;
    }
  }
  return preferred;
}

export function OperationalLanesSurface(props: {
  bootstrap?: OperationalBootstrap | null;
  queueState: DecisionOsQueueBootstrapState;
  queueCompanionState: DecisionOsQueueCompanionState;
}) {
  const bootstrap = createMemo(() => props.bootstrap ?? null);
  const [undoingCheckpointId, setUndoingCheckpointId] = createSignal<string | null>(null);
  const [undoneCheckpointIds, setUndoneCheckpointIds] = createSignal<Set<string>>(new Set());
  const [undoFeedback, setUndoFeedback] = createSignal<string | null>(null);
  const [undoReviewTarget, setUndoReviewTarget] = createSignal<{
    threadId: string;
    messageId: string;
  } | null>(null);

  createEffect(() => {
    void bootstrap();
    setUndoneCheckpointIds(new Set<string>());
    if (!bootstrap()) {
      setUndoFeedback(null);
      setUndoReviewTarget(null);
    }
  });

  const serverUndoneCheckpointIds = createMemo(() => {
    const checkpointIds = new Set<string>();
    for (const entry of dashboardBootstrapActionLog(bootstrap())) {
      if (!entry.capability_id.endsWith(":undo")) continue;
      const status = lower(entry.status);
      if (!status.includes("completed") && !status.includes("success") && !status.includes("succeeded")) {
        continue;
      }
      const checkpointId = typeof entry.output?.checkpoint_message_id === "string"
        ? entry.output.checkpoint_message_id
        : null;
      if (checkpointId) checkpointIds.add(checkpointId);
    }
    return checkpointIds;
  });

  const visibleActionLog = createMemo(() => {
    const hidden = undoneCheckpointIds();
    const serverHidden = serverUndoneCheckpointIds();
    return dashboardBootstrapActionLog(bootstrap()).filter((entry) => {
      const checkpointId = entry.reversible_summary?.rollback_checkpoint_id;
      return !checkpointId || (!hidden.has(checkpointId) && !serverHidden.has(checkpointId));
    });
  });

  const undoReadyEntries = createMemo<UndoReadyActionEntry[]>(() => {
    const seen = new Set<string>();
    return visibleActionLog()
      .filter((entry) => {
        const checkpointId = entry.reversible_summary?.rollback_checkpoint_id;
        if (!checkpointId || seen.has(checkpointId)) return false;
        seen.add(checkpointId);
        return true;
      })
      .slice(0, 3);
  });

  function targetIsTypingSurface(node: EventTarget | null): boolean {
    return node instanceof HTMLElement
      && Boolean(node.closest("input, textarea, select, [contenteditable='true'], .ProseMirror, .cm-editor"));
  }

  const continuityStateFieldSummary = createMemo(() =>
    summarizeDecisionOsStateFields<DecisionOsStateFieldItem>(
      dashboardBootstrapContinuityStateFields(bootstrap()),
    ),
  );
  const suggestedMood = createMemo(() => {
    const raw = bootstrap()?.continuity_handoff?.["suggested_mood"];
    return typeof raw === "string" ? raw : undefined;
  });

  const continuityLaneSummary = createMemo(() =>
    decisionOsContinuityLaneSummaryFromStateFieldSummary(
      continuityStateFieldSummary(),
      operationalQueueState().responseItems,
      operationalQueueState().contextPackItems,
      dashboardBootstrapMessages(bootstrap()),
      suggestedMood(),
      ),
  );
  const conversationAttentionItems = createMemo<ConversationAttentionItem[]>(
    () => dashboardBootstrapConversationAttentionItems(bootstrap()),
  );
  const queueState = createMemo<DecisionOsQueueBootstrapState>(() => props.queueState);
  const queueCompanionState = createMemo<DecisionOsQueueCompanionState>(
    () => props.queueCompanionState,
  );
  const operationalQueueState = createMemo(() => {
    const queueBootstrapState = queueState();
    const companionState = queueCompanionState();
    const queueActionItems = queueBootstrapState.queueActionItems;
    const queuePriorityCard = queueBootstrapState.queuePriorityCard;
    const responseItems = companionState.responseItems;
    const contextPackItems = companionState.contextPackItems;
    const proactiveSuggestions = companionState.proactiveSuggestions;
    const preferredConversationAttention = preferredConversationAttentionItem(
      conversationAttentionItems(),
    );

    return {
      queueActionItems,
      queuePriorityCard,
      responseItems,
      contextPackItems,
      proactiveSuggestions,
      preferredConversationAttention,
      proactiveSuggestionCount: proactiveSuggestions.length,
      topProactiveSuggestion: decisionOsPreferredProactiveLaneSuggestion(proactiveSuggestions),
      approvalCount:
        queueActionItems.filter((item) => item.requires_approval).length
        + (queuePriorityCard?.requires_approval ? 1 : 0),
    };
  });
  const primaryUndoReadyEntry = createMemo(() => undoReadyEntries()[0] ?? null);
  const operationalRuntimeState = createMemo(() =>
    dashboardBootstrapOperationalRuntimeState(bootstrap())
  );
  const operationalContinuityState = createMemo(() => {
    const lane = continuityLaneSummary();
    const conversationAttentionCount = conversationAttentionItems().length;
    const preferredAttention = operationalQueueState().preferredConversationAttention;

    return {
      currentContinuityLane: {
        title: lane.title,
        detail:
          lane.detail
          || operationalRuntimeState().continuityBriefTitle
          || "State synthesis is available for workspace steering.",
        badge: lane.badge,
        reason: lane.reason,
        count: lane.count,
      },
      conversationAttentionCount,
      conversationAttentionLane: conversationAttentionLaneState(
        preferredAttention,
        conversationAttentionCount,
        operationalRuntimeState().conversationAttentionSummary,
      ),
      fieldCalibrationNote: latestFieldCalibrationNoteFromMessages(
        operationalRuntimeState().messages,
      ),
    };
  });
  const operationalMetricsState = createMemo(() => {
    const runtimeState = operationalRuntimeState();
    const browserMessages = runtimeState.browserTaskMessages;
    const browserSummary = runtimeState.browserRuntimeSummary;
    const browserRequests = browserMessages.filter(
      (message) => message.subtype === "browser_task:request",
    );
    const browserResults = browserMessages.filter(
      (message) => message.subtype === "browser_task:result",
    );
    const derivedTaskCount = browserMessages.length;
    const derivedBlockedCount = browserMessages.filter(
      (message) => message.subtype === "browser_task:blocked",
    ).length;
    const derivedPendingCount = browserRequests.length;
    const displayContent = (message: { content: unknown; encryption?: unknown }) =>
      afpOptionalRecord(decryptedDisplayContent(message as Parameters<typeof decryptedDisplayContent>[0]));
    const derivedApprovalCount = browserRequests.filter((message) => {
      const content = displayContent(message);
      return content?.step_approval_required === true;
    }).length;
    const derivedFailedCount = browserResults.filter((message) => {
      const content = displayContent(message);
      const status = lower(contentString(content, "status"));
      return status.includes("failed") || status.includes("error") || status.includes("blocked");
    }).length;
    const derivedCompletedCount = browserResults.filter((message) => {
      const content = displayContent(message);
      const status = lower(contentString(content, "status"));
      return status.includes("completed") || status.includes("success") || status.includes("succeeded");
    }).length;

    const browserTaskMetrics = {
      taskCount: browserSummary?.task_count ?? derivedTaskCount,
      blockedCount: browserSummary?.blocked_task_count ?? derivedBlockedCount,
      pendingCount: browserSummary?.active_task_count ?? derivedPendingCount,
      approvalCount: browserSummary?.step_approval_task_count ?? derivedApprovalCount,
      failedCount: browserSummary?.failed_task_count ?? derivedFailedCount,
      completedCount: browserSummary?.completed_task_count ?? derivedCompletedCount,
      cancelledCount: browserSummary?.cancelled_task_count ?? 0,
      latestGoal: browserSummary?.latest_task_goal,
      latestStatus: lower(browserSummary?.latest_task_status),
    };

    const workflowMessages = runtimeState.workflowRuntimeMessages;
    const workflowSummary = runtimeState.workflowRuntimeSummary;
    const derivedWaitingCount = workflowMessages.filter((message) => {
      const content = displayContent(message);
      const rawStatus = lower(
        contentString(content, "status")
          ?? contentString(content, "run_status")
          ?? contentString(content, "state")
          ?? contentString(content, "wait_resume_status"),
      );
      return rawStatus.includes("approval") || rawStatus.includes("waiting");
    }).length;
    const derivedWorkflowFailedCount = workflowMessages.filter((message) => {
      const content = displayContent(message);
      const rawStatus = lower(
        contentString(content, "status")
          ?? contentString(content, "run_status")
          ?? contentString(content, "state")
          ?? contentString(content, "wait_resume_status"),
      );
      return rawStatus.includes("failed") || rawStatus.includes("error");
    }).length;
    const derivedWorkflowCompletedCount = workflowMessages.filter((message) => {
      const content = displayContent(message);
      const rawStatus = lower(
        contentString(content, "status")
          ?? contentString(content, "run_status")
          ?? contentString(content, "state")
          ?? contentString(content, "wait_resume_status"),
      );
      return rawStatus.includes("completed") || rawStatus.includes("succeeded") || rawStatus.includes("success");
    }).length;
    const waitingCount = workflowSummary?.waiting_run_count ?? derivedWaitingCount;
    const failedCount = workflowSummary?.failed_run_count ?? derivedWorkflowFailedCount;
    const completedCount = workflowSummary?.completed_run_count ?? derivedWorkflowCompletedCount;

    const workflowRuntimeMetrics = {
      waitingCount,
      failedCount,
      completedCount,
      activeCount:
        workflowSummary?.active_run_count
        ?? Math.max(
          workflowMessages.length
            - derivedWaitingCount
            - derivedWorkflowFailedCount
            - derivedWorkflowCompletedCount,
          0,
        ),
      pausedWaitResumeCount: workflowSummary?.paused_wait_resume_count ?? 0,
      workflowCount: workflowSummary?.workflow_count ?? workflowMessages.length,
      latestTitle: workflowSummary?.latest_workflow_title,
      latestStatus: lower(workflowSummary?.latest_run_status),
    };

    const trustSummary = runtimeState.trustRuntimeSummary;
    const actionLog = visibleActionLog();
    const messages = runtimeState.messages;
    const hiddenUndoCount = undoneCheckpointIds().size;
    const derivedFailedAuditCount = actionLog.filter((entry) => entry.status === "failed").length;
    const derivedPendingAuditCount = actionLog.filter((entry) => {
      const status = lower(entry.status);
      return status.includes("pending") || status.includes("waiting");
    }).length;
    const derivedReversibleActionCount = actionLog.filter(
      (entry) => entry.reversible_summary?.reversible === true,
    ).length;
    const derivedUndoReadyActionCount = actionLog.filter(
      (entry) => !!entry.reversible_summary?.rollback_checkpoint_id,
    ).length;
    const derivedLatestUndoLabel =
      actionLog.find((entry) => entry.reversible_summary?.undo_label)?.reversible_summary?.undo_label
      ?? null;

    const trustRuntimeMetrics = {
      provenanceCount:
        trustSummary?.provenance_record_count
        ?? messages.filter((message) => message.type === "provenance_record").length,
      actionAuditCount: trustSummary?.audited_action_count ?? actionLog.length,
      failedAuditCount: trustSummary?.failed_audit_count ?? derivedFailedAuditCount,
      pendingAuditCount: trustSummary?.pending_audit_count ?? derivedPendingAuditCount,
      successfulAuditCount: trustSummary?.successful_audit_count ?? 0,
      reversibleActionCount:
        hiddenUndoCount > 0
          ? derivedReversibleActionCount
          : trustSummary?.reversible_action_count ?? derivedReversibleActionCount,
      undoReadyActionCount:
        hiddenUndoCount > 0
          ? derivedUndoReadyActionCount
          : trustSummary?.undo_ready_action_count ?? derivedUndoReadyActionCount,
      latestProvenanceActionType: trustSummary?.latest_provenance_action_type,
      latestAuditStatus: lower(trustSummary?.latest_audit_status),
      latestUndoLabel:
        hiddenUndoCount > 0
          ? derivedLatestUndoLabel
          : trustSummary?.latest_undo_label ?? derivedLatestUndoLabel,
    };

    return {
      browserTaskMetrics,
      workflowRuntimeMetrics,
      trustRuntimeMetrics,
    };
  });
  const operationalContinuityNavigationState = createMemo(() => {
    const preferredAttention = operationalQueueState().preferredConversationAttention;
    const destinationView = normalizeViewName(preferredAttention?.latest_artifact_destination_view);

    return {
      leadingField: continuityStateFieldSummary().leadingField ?? null,
      proactiveLaneTarget: destinationView
        ? {
            view: destinationView,
            extra: undefined,
          }
        : preferredAttention?.latest_attention_kind === "approval_request"
          ? {
              view: "decision_queue" as const,
              extra: undefined,
            }
          : preferredAttention?.thread_id
            || preferredAttention?.latest_artifact_id
            || preferredAttention?.latest_message_ref
            ? {
                view: "threads" as const,
                extra: {
                  threadId: preferredAttention.thread_id ?? undefined,
                  messageId:
                    preferredAttention.latest_artifact_id
                    ?? preferredAttention.latest_message_ref
                    ?? undefined,
                },
              }
            : null,
    };
  });
  function openLaneThreadTarget(target: LaneThreadTarget | null | undefined) {
    if (!target) return false;
    openLaneNavigationTarget(target);
    return true;
  }

  function openLaneNavigationTarget(target: LaneThreadTarget) {
    switch (target.view) {
      case "calendar":
        navigateToView("calendar", {
          eventId: target.extra?.eventId,
          date: target.extra?.date,
        });
        return;
      case "threads":
        navigateToView("threads", {
          threadId: target.extra?.threadId,
          messageId: target.extra?.messageId,
        });
        return;
      case "agent_settings":
        navigateToView("agent_settings", {
          settingsTab: target.extra?.settingsTab,
        });
        return;
      default:
        navigateToView(target.view);
        return;
    }
  }

  function openRuntimeSettingsLane() {
    navigateToView("agent_settings", { settingsTab: "runtime" });
  }

  function openContinuityLaneHome() {
    const leadingField = operationalContinuityNavigationState().leadingField;
    if (leadingField) {
      openDecisionOsStateFieldTarget(leadingField);
      return;
    }
    navigateToView("home");
  }

  function openProactiveHomeLane() {
    const target = operationalContinuityNavigationState().proactiveLaneTarget;
    if (target) {
      openLaneNavigationTarget(target);
      return;
    }
    navigateToView("home");
  }

  async function handleUndoAction(entry: UndoReadyActionEntry) {
    const checkpointId = entry.reversible_summary?.rollback_checkpoint_id;
    if (!checkpointId) return;
    setUndoingCheckpointId(checkpointId);
    setUndoFeedback(null);
    setUndoReviewTarget(null);
    try {
      const result = await undoAction({
        thread_id: entry.thread_id,
        checkpoint_message_id: checkpointId,
        reason: "Undo requested from the PersonalOS trust lane.",
      });
      setUndoneCheckpointIds((prev) => {
        const next = new Set(prev);
        next.add(checkpointId);
        return next;
      });
      setUndoFeedback(result.summary || entry.reversible_summary?.undo_label || "Undo completed.");
      const messageId =
        result.revert_result_message_id || result.target_message_id || result.checkpoint_message_id;
      if (messageId) {
        setUndoReviewTarget({
          threadId: result.thread_id || entry.thread_id,
          messageId,
        });
      }
      dispatchDashboardRefreshEvent({ reason: "reversible-action-undo" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Undo failed.";
      setUndoFeedback(message);
    } finally {
      setUndoingCheckpointId(null);
    }
  }

  onMount(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (targetIsTypingSurface(event.target)) return;
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const entry = primaryUndoReadyEntry();
      if (!entry || undoingCheckpointId()) return;
      event.preventDefault();
      recordShortcutUse("agent_undo");
      void handleUndoAction(entry);
    }
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  function openReversibleAuditEntry(entry: UndoReadyActionEntry) {
    const target = resolveReversibleAuditReviewTarget(
      entry,
      dashboardBootstrapActionLog(bootstrap()),
      dashboardBootstrapMessages(bootstrap()),
    );
    if (target) {
      navigateToView("threads", {
        threadId: target.threadId,
        messageId: target.messageId,
      });
      return;
    }
    navigateToView("threads", {
      threadId: entry.thread_id,
    });
  }

  const operationalNavigationState = createMemo(() => {
    const runtimeState = operationalRuntimeState();
    const laneThreadTargets: Record<"calendar" | "inbox" | "files", LaneThreadTarget | null> = {
      calendar:
        runtimeState.calendarRuntimeSummary?.next_tentative_start_at
          ? {
              view: "calendar",
              extra: {
                eventId: runtimeState.calendarRuntimeSummary?.latest_tentative_event_id ?? undefined,
                date: runtimeState.calendarRuntimeSummary?.next_tentative_start_at ?? undefined,
              },
            }
          : null,
      inbox:
        runtimeState.inboxRuntimeSummary?.latest_action_message_id
          ? {
              view: "threads",
              extra: {
                threadId: runtimeState.inboxRuntimeSummary?.latest_action_thread_id ?? undefined,
                messageId: runtimeState.inboxRuntimeSummary?.latest_action_message_id ?? undefined,
              },
            }
          : null,
      files:
        (
          runtimeState.fileRuntimeSummary?.latest_action_message_id
          ?? runtimeState.fileRuntimeSummary?.latest_reversible_message_id
        )
          ? {
              view: "threads",
              extra: {
                threadId:
                  runtimeState.fileRuntimeSummary?.latest_action_thread_id
                  ?? runtimeState.fileRuntimeSummary?.latest_reversible_thread_id
                  ?? undefined,
                messageId:
                  runtimeState.fileRuntimeSummary?.latest_action_message_id
                  ?? runtimeState.fileRuntimeSummary?.latest_reversible_message_id
                  ?? undefined,
              },
            }
          : null,
    };
    const reviewSourceTargets = {
      tasks: reviewSourceTarget(
        runtimeState.taskRuntimeSummary?.latest_draft_task_thread_id,
        runtimeState.taskRuntimeSummary?.latest_draft_task_action_message_id,
      ),
      calendar: reviewSourceTarget(
        runtimeState.calendarRuntimeSummary?.latest_tentative_thread_id,
        runtimeState.calendarRuntimeSummary?.latest_tentative_action_message_id,
      ),
      inbox: reviewSourceTarget(
        runtimeState.inboxRuntimeSummary?.latest_action_thread_id,
        runtimeState.inboxRuntimeSummary?.latest_action_message_id,
      ),
      files: reviewSourceTarget(
        runtimeState.fileRuntimeSummary?.latest_action_thread_id
          ?? runtimeState.fileRuntimeSummary?.latest_reversible_thread_id,
        runtimeState.fileRuntimeSummary?.latest_action_message_id
          ?? runtimeState.fileRuntimeSummary?.latest_reversible_message_id,
      ),
    };
    const reviewSourceActions = {
      tasks: (event: MouseEvent) => openReviewSourceTarget(reviewSourceTargets.tasks, event),
      calendar: (event: MouseEvent) =>
        openReviewSourceTarget(reviewSourceTargets.calendar, event),
      inbox: (event: MouseEvent) => openReviewSourceTarget(reviewSourceTargets.inbox, event),
      files: (event: MouseEvent) => openReviewSourceTarget(reviewSourceTargets.files, event),
    };
    const undoReviewAction = () => {
      const target = undoReviewTarget();
      if (!target) return;
      navigateToView("threads", {
        threadId: target.threadId,
        messageId: target.messageId,
      });
    };
    const laneOpenActions: Record<DecisionOsOperationalLaneKey, () => void> = {
      tasks: () => navigateToView("tasks"),
      calendar: () => {
        if (openLaneThreadTarget(laneThreadTargets.calendar)) return;
        navigateToView("calendar");
      },
      inbox: () => {
        if (openLaneThreadTarget(laneThreadTargets.inbox)) return;
        navigateToView("threads");
      },
      files: () => {
        if (openLaneThreadTarget(laneThreadTargets.files)) return;
        navigateToView("threads");
      },
      runtime: openRuntimeSettingsLane,
      devices: openRuntimeSettingsLane,
      support: openRuntimeSettingsLane,
      browser: () => navigateToView("threads"),
      trust: () => navigateToView("threads"),
      workflows: () => navigateToView("workflows"),
      approvals: () => navigateToView("decision_queue"),
      continuity: openContinuityLaneHome,
      proactive: openProactiveHomeLane,
    };

    return {
      laneThreadTargets,
      reviewSourceTargets,
      reviewSourceActions,
      undoReviewAction,
      laneOpenActions,
    };
  });

  function openLane(laneKey: DecisionOsOperationalLaneKey) {
    const action = operationalNavigationState().laneOpenActions[laneKey];
    if (action) {
      action();
      return;
    }
    navigateToView("home");
  }

  const laneCards = createMemo<LaneCard[]>(() => {
    const currentBootstrap = bootstrap();
    if (!currentBootstrap) return [];

    const queueOperationalState = operationalQueueState();
    const runtimeState = operationalRuntimeState();
    const metricsState = operationalMetricsState();
    const continuityState = operationalContinuityState();
    const proactiveSuggestionItems = queueOperationalState.proactiveSuggestions;
    const proactiveCount = queueOperationalState.proactiveSuggestionCount;
    const preferredProactiveSuggestion = queueOperationalState.topProactiveSuggestion;
    const {
      approval: simulatorApprovalPreview,
      fusion: simulatorFusionPreview,
      reversible: simulatorReversiblePreview,
    } = decisionOsSimulatorPreviewLaneSelections(proactiveSuggestionItems);
    const simulatorApprovalLane = decisionOsPreparedWorkSimulatorLaneState(
      simulatorApprovalPreview?.item,
    );
    const simulatorFusionLane = decisionOsPreparedWorkSimulatorLaneState(
      simulatorFusionPreview?.item,
    );
    const simulatorReversibleLane = decisionOsPreparedWorkSimulatorLaneState(
      simulatorReversiblePreview?.item,
    );
    const simulatorTrustLane =
      simulatorFusionLane ?? simulatorReversibleLane ?? simulatorApprovalLane;
    const conversationAttentionCount = continuityState.conversationAttentionCount;
    const conversationAttentionLane = continuityState.conversationAttentionLane;
    const approvalCount = queueOperationalState.approvalCount;
    const browserMetrics = metricsState.browserTaskMetrics;
    const taskSummary = runtimeState.taskRuntimeSummary;
    const calendarSummary = runtimeState.calendarRuntimeSummary;
    const deviceSyncSummary = runtimeState.deviceSyncRuntimeSummary;
    const fileSummary = runtimeState.fileRuntimeSummary;
    const inboxSummary = runtimeState.inboxRuntimeSummary;
    const workflowMetrics = metricsState.workflowRuntimeMetrics;
    const fieldCalibrationNote = continuityState.fieldCalibrationNote;
    const trustMetrics = metricsState.trustRuntimeMetrics;
    const runtimeDeploymentState = runtimeState.runtimeDeployment;
    const supportAccessState = runtimeState.supportAccess;
    const runtimeStatus = runtimeState.runtimeStatus;
    const runtimeFramework = runtimeState.runtimeFramework;
    const supportStatus = supportAccessState?.status ?? "disabled";
    const currentContinuityLaneSummary = continuityState.currentContinuityLane;
    const {
      provenanceCount,
      actionAuditCount,
      failedAuditCount,
      pendingAuditCount,
      successfulAuditCount,
      reversibleActionCount,
      undoReadyActionCount,
      latestProvenanceActionType,
      latestAuditStatus,
      latestUndoLabel,
    } = trustMetrics;

    const cards: LaneCard[] = [
      continuityLaneCard(
        currentContinuityLaneSummary.title,
        currentContinuityLaneSummary.detail,
        currentContinuityLaneSummary.badge,
        currentContinuityLaneSummary.reason,
      ),
      proactiveLaneCard(
        conversationAttentionCount,
        conversationAttentionLane,
        proactiveCount,
        preferredProactiveSuggestion?.state.detail,
        preferredProactiveSuggestion?.state.reason,
      ),
      runtimeLaneCard(
        runtimeFramework,
        runtimeStatus,
        runtimeDeploymentState,
        runtimeState.simulatorRuntimeSummary,
        bootstrap()?.operational_guidance,
      ),
      taskLaneCard(taskSummary),
      calendarLaneCard(calendarSummary),
      inboxLaneCard(inboxSummary),
      fileLaneCard(fileSummary),
      deviceSyncLaneCard(deviceSyncSummary),
      workflowLaneCard(workflowMetrics),
      approvalsLaneCard(approvalCount, simulatorApprovalLane),
      browserLaneCard(browserMetrics),
      trustLaneCard(
        simulatorTrustLane,
        provenanceCount,
        actionAuditCount,
        failedAuditCount,
        pendingAuditCount,
        successfulAuditCount,
        reversibleActionCount,
        undoReadyActionCount,
        latestProvenanceActionType,
        latestAuditStatus,
        latestUndoLabel,
        fieldCalibrationNote,
      ),
      supportLaneCard(supportStatus),
    ];

    return cards;
  });

  const operationalLaneSurfaceState = createMemo(() => {
    const visibleLanes = laneCards();
    const navigationState = operationalNavigationState();
    const trustUndoEntryItems = undoReadyEntries().map((entry) => {
      const checkpointId = entry.reversible_summary?.rollback_checkpoint_id ?? "";
      const undoing = undoingCheckpointId() === checkpointId;
      return {
        checkpointId,
        capabilityLabel: entry.capability_id.replaceAll("_", " "),
        undoLabel: entry.reversible_summary?.undo_label ?? "Undo reversible action",
        undoing,
        reviewActionLabel: "Review",
        undoActionLabel: undoing ? "Undoing" : "Undo",
        undoActionClass: `${TRUST_ACTION_CLASS} ${TRUST_ACTION_DISABLED_CLASS}`,
        onReview: (event: MouseEvent) => openTrustReviewEntry(entry, event),
        onUndo: (event: MouseEvent) => triggerTrustUndo(entry, event),
      };
    });
    const undoSummary = undoFeedback();
    const undoReviewSummaryTarget = undoReviewTarget();
    const trustLaneState: TrustLaneViewState = {
      showUndoSection: trustUndoEntryItems.length > 0,
      undoEntryItems: trustUndoEntryItems,
      notice: {
        showNotice: Boolean(undoSummary),
        summary: undoSummary ?? undefined,
        actionLabel: undoReviewSummaryTarget ? "Review result" : undefined,
        onAction: undoReviewSummaryTarget ? navigationState.undoReviewAction : undefined,
      },
    };
    const visibleDigest =
      visibleLanes.length === 0
        ? []
        : RUNTIME_DIGEST_SLOTS.flatMap((slot) => {
            const lane = slot.selectLane(visibleLanes);
            return lane
              ? [{
                  key: slot.key,
                  label: slot.label,
                  value: lane.title,
                  reason: lane.reason,
                  tone: slot.tone,
                }]
              : [];
          });
    const laneViewItems = visibleLanes.map((lane) => {
      const showTaskReviewSource =
        lane.key === "tasks" && Boolean(navigationState.reviewSourceTargets.tasks);
      const showCalendarReviewSource =
        lane.key === "calendar" && Boolean(navigationState.reviewSourceTargets.calendar);
      const showInboxReviewSource =
        lane.key === "inbox" && Boolean(navigationState.reviewSourceTargets.inbox);
      const showFileReviewSource =
        lane.key === "files" && Boolean(navigationState.reviewSourceTargets.files);
      const reviewSourceAction = showTaskReviewSource
        ? {
            label: "Review source",
            onClick: navigationState.reviewSourceActions.tasks,
          }
        : showCalendarReviewSource
          ? {
              label: "Review source",
              onClick: navigationState.reviewSourceActions.calendar,
            }
          : showInboxReviewSource
            ? {
                label: "Review source",
                onClick: navigationState.reviewSourceActions.inbox,
              }
            : showFileReviewSource
              ? {
                  label: "Review source",
                  onClick: navigationState.reviewSourceActions.files,
                }
          : undefined;
      const trustUndoSection =
        lane.key === "trust" && trustLaneState.showUndoSection
          ? {
              entryItems: trustLaneState.undoEntryItems,
              notice: trustLaneState.notice,
            }
          : undefined;

      return {
        lane,
        cardClass: `${LANE_CARD_CLASS} ${lane.tone}`,
        onOpen: () => openLane(lane.key),
        onOpenKeyDown: (event: KeyboardEvent) => handleLaneKeyDown(event, lane.key),
        reviewSourceAction,
        trustUndoSection,
      };
    });

    return {
      visibleLanes,
      visibleDigest,
      laneViewItems,
      showLanesSurface: visibleLanes.length > 0,
      showDigest: visibleDigest.length > 0,
    };
  });

  function handleLaneKeyDown(event: KeyboardEvent, laneKey: DecisionOsOperationalLaneKey) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLane(laneKey);
    }
  }

  function openReviewSourceTarget(target: ReviewSourceTarget | null, event: MouseEvent) {
    if (!target) return;
    event.stopPropagation();
    navigateToView("threads", {
      threadId: target.threadId,
      messageId: target.messageId,
    });
  }

  function openTrustReviewEntry(entry: UndoReadyActionEntry, event: MouseEvent) {
    event.stopPropagation();
    openReversibleAuditEntry(entry);
  }

  function triggerTrustUndo(entry: UndoReadyActionEntry, event: MouseEvent) {
    event.stopPropagation();
    void handleUndoAction(entry);
  }

  return (
    <Show when={operationalLaneSurfaceState()?.showLanesSurface === true}>
      <section class={OPERATIONAL_LANES_SECTION_CLASS}>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class={OPERATIONAL_LANES_SECTION_LABEL_CLASS}>
              {OPERATIONAL_LANE_VOCAB.sectionLabel}
            </p>
            <h3 class={OPERATIONAL_LANES_SECTION_TITLE_CLASS}>
              {OPERATIONAL_LANE_VOCAB.sectionTitle}
            </h3>
          </div>
          <span class={OPERATIONAL_LANES_TELEMETRY_BADGE_CLASS}>
            {OPERATIONAL_LANE_VOCAB.telemetryLabel}
          </span>
        </div>

        <Show when={operationalLaneSurfaceState()?.showDigest === true}>
          <div class="mt-3 grid gap-2 lg:grid-cols-4">
            <For each={operationalLaneSurfaceState()?.visibleDigest ?? []}>
              {(item) => (
                <div class={`${DIGEST_CARD_CLASS} ${item.tone}`}>
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-[9px] uppercase tracking-[0.16em] opacity-70">
                      {item.label}
                    </span>
                    <span class="text-[10px] font-medium opacity-75">{item.reason}</span>
                  </div>
                  <p class="mt-1 text-xs font-semibold leading-5">{item.value}</p>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="mt-3 grid gap-3 lg:grid-cols-3">
          <For each={operationalLaneSurfaceState()?.laneViewItems ?? []}>
            {(laneView) => {
              const lane = laneView.lane;
              return (
                <div
                  role="button"
                  tabindex={0}
                  onClick={laneView.onOpen}
                  onKeyDown={laneView.onOpenKeyDown}
                  class={laneView.cardClass}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-mono text-[9px] uppercase tracking-[0.16em] opacity-70">{lane.label}</p>
                      <p class="mt-1 text-sm font-semibold">{lane.title}</p>
                    </div>
                    <span class={LANE_BADGE_CLASS}>
                      {lane.badge}
                    </span>
                  </div>
                  <p class="mt-2 text-[11px] leading-5 opacity-80">{lane.detail}</p>
                  <div class="mt-3 flex items-center gap-2">
                    <span class="font-mono text-[9px] uppercase tracking-[0.14em] opacity-55">Why</span>
                    <span class={LANE_REASON_BADGE_CLASS}>
                      {lane.reason}
                    </span>
                  </div>
                  <Show when={laneView.reviewSourceAction}>
                    <div class="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={laneView.reviewSourceAction!.onClick}
                        class={LANE_REVIEW_ACTION_CLASS}
                      >
                        {laneView.reviewSourceAction!.label}
                      </button>
                    </div>
                  </Show>
                  <Show when={laneView.trustUndoSection}>
                    <div class="mt-3 space-y-2 border-t border-current/10 pt-3">
                      <For each={laneView.trustUndoSection!.entryItems}>
                        {(trustEntry) => (
                          <div class={TRUST_ENTRY_CLASS}>
                            <div class="flex items-start justify-between gap-3">
                              <div>
                                <p class="text-[11px] font-semibold">{trustEntry.undoLabel}</p>
                                <p class="mt-1 text-[11px] opacity-75">
                                  {trustEntry.capabilityLabel}
                                </p>
                              </div>
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={trustEntry.onReview}
                                  class={TRUST_ACTION_CLASS}
                                >
                                  {trustEntry.reviewActionLabel}
                                </button>
                                <button
                                  type="button"
                                  disabled={trustEntry.undoing}
                                  onClick={trustEntry.onUndo}
                                  class={trustEntry.undoActionClass}
                                >
                                  {trustEntry.undoActionLabel}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={laneView.trustUndoSection!.notice.showNotice}>
                        <ReversibleActionNotice
                          status="applied"
                          summary={laneView.trustUndoSection!.notice.summary!}
                          class="text-[11px] text-current"
                          actionLabel={laneView.trustUndoSection!.notice.actionLabel}
                          onAction={laneView.trustUndoSection!.notice.onAction}
                          actionClass={TRUST_NOTICE_ACTION_CLASS}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
}
