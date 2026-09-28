// @locs-version: 1.0
import { createMemo, For, Show, type JSXElement } from "solid-js";
import { ApprovalReviewSummary } from "@/components/ApprovalReviewSummary";
import {
  workflowApprovalDecisionActionTitle,
  workflowWaitResumeChainSummary,
  workflowWaitResumePendingSummary,
} from "@/lib/workflowGraphCopy";
import { workflowRunApprovalReviewPanelState } from "@/lib/workflowRunAnalysis";
import {
  buildWorkflowWaitResumeFailureReceipt,
  type WorkflowWaitResumeFailureReceipt,
} from "@/lib/workflowWaitResumeFailureState";
import { isRecord } from "@/lib/eventDetail";

type WorkflowWaitResumeSummaryBadge = {
  className: string;
  label: string;
};

type WorkflowApprovalOptionItem = {
  actionTitle: string;
  buttonClassName: string;
  decision: "approved" | "rejected";
  label: string;
  option: any;
};

type WorkflowRuntimeKindCountItem = {
  label: string;
  value: string;
};

type WorkflowRunHeaderBadge = {
  className: string;
  label: string;
  title?: string;
};

type WorkflowTimelineBadgeItem = {
  className: string;
  label: string;
};

type WorkflowRecordBadgeItem = {
  className: string;
  label: string;
};

function workflowTimelineBadgeFromUnknown(value: unknown): WorkflowTimelineBadgeItem | null {
  if (!isRecord(value)) return null;
  const record = value;
  return typeof record.className === "string" && typeof record.label === "string"
    ? {
      className: `rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${record.className}`,
      label: record.label,
    }
    : null;
}

type WorkflowDeploymentEntryItem = {
  nodeId: string;
  summary: string;
  titleText: string;
  selected: boolean;
  onClick: () => void;
};

type WorkflowReplayEntryItem = {
  nodeId: string;
  summary: string;
  titleText: string;
  selected: boolean;
  onClick: () => void;
};

type WorkflowReplayDiffBadgeState = {
  className: string;
  label: string;
};

type WorkflowFamilyContextBadge = {
  label: string;
};

type WorkflowFamilyContextValueItem = {
  label: string;
};

type WorkflowWaitResumeRecordFamilyBadge = {
  label: string;
};

type WorkflowWaitResumeRecordItem = {
  familyBadges: WorkflowWaitResumeRecordFamilyBadge[];
  focusNodeId: string | null;
  record: any;
};

type WorkflowLiveExecutionBadge = {
  label: string;
};

type WorkflowLiveExecutionItem = {
  detailBadges: WorkflowLiveExecutionBadge[];
  eventBadges: WorkflowLiveExecutionBadge[];
  labelText: string;
  noteText: string | null;
  optionConsequenceText: string | null;
  reasonText: string | null;
  resultSummaryText: string | null;
};

type WorkflowStatusLineItem = {
  className: string;
  label: string;
};

type WorkflowPolicyDriftActionItem = {
  label: string;
  onClick: () => void;
  className: string;
};

type WorkflowExecutionPhaseBadge = {
  label: string;
};

type WorkflowExecutionLogItem = {
  indexLabel: string;
  phaseLabel: string;
  text: string;
  titleText: string;
  toneClassName: string;
};

type WorkflowActionItem = {
  className: string;
  label: string;
  onClick: () => void;
};

type WorkflowActionLinkItem = WorkflowActionItem & {
  title?: string;
};

type WorkflowDeploymentBadgeItem = {
  className: string;
  label: string;
};

type WorkflowFilterActionItem = {
  className: string;
  label: string;
  onClick: () => void;
};

type WorkflowRunOverviewPanelState = {
  headerActionItems: WorkflowActionLinkItem[];
  headerBadges: WorkflowRunHeaderBadge[];
  timelineBadgeItems: WorkflowTimelineBadgeItem[];
  timelineFilterActionItems: WorkflowFilterActionItem[];
  approvalReviewPanel: ReturnType<typeof workflowRunApprovalReviewPanelState>;
  deploymentBadgeItems: WorkflowDeploymentBadgeItem[];
  deploymentActionItems: WorkflowActionItem[];
  deploymentEntryItems: WorkflowDeploymentEntryItem[];
  replayActionItems: WorkflowActionItem[];
  replayEntryItems: WorkflowReplayEntryItem[];
  showDeploymentEntries: boolean;
  showDeploymentOverflowNotice: boolean;
  deploymentOverflowCount: number;
  replayDiffBadge: WorkflowReplayDiffBadgeState;
  showReplayEntries: boolean;
  waitResumeErrorReceipt: WorkflowWaitResumeFailureReceipt | null;
  waitResumeSummaryBadges: WorkflowWaitResumeSummaryBadge[];
  showWaitResumeEmptyState: boolean;
  showWaitResumeRecords: boolean;
  approvalOptionItems: WorkflowApprovalOptionItem[];
  runtimeKindCountItems: WorkflowRuntimeKindCountItem[];
  familyContextBadges: WorkflowFamilyContextBadge[];
  familyContextValueItems: WorkflowFamilyContextValueItem[];
  showFamilyContextValues: boolean;
  waitResumeRecordItems: WorkflowWaitResumeRecordItem[];
  liveExecutionItems: WorkflowLiveExecutionItem[];
  showLiveExecutionItems: boolean;
  liveExecutionStatusBadge: WorkflowLiveExecutionBadge;
  statusLineItems: WorkflowStatusLineItem[];
  policyDriftActionItems: WorkflowPolicyDriftActionItem[];
  executionPhaseBadges: WorkflowExecutionPhaseBadge[];
  executionLogItems: WorkflowExecutionLogItem[];
  showExecutionLogOverflowNotice: boolean;
};

const WORKFLOW_WAIT_RESUME_DANGER_RECEIPT_CLASS =
  "border border-rose-200/70 bg-rose-50/85";
const WORKFLOW_WAIT_RESUME_WARNING_RECEIPT_CLASS =
  "border border-amber-200/70 bg-amber-50/85";
const WORKFLOW_WAIT_RESUME_DANGER_TITLE_CLASS = "text-sm font-medium text-rose-700";
const WORKFLOW_WAIT_RESUME_WARNING_TITLE_CLASS = "text-sm font-medium text-amber-800";
const WORKFLOW_WAIT_RESUME_DANGER_SUMMARY_CLASS = "mt-1 text-sm text-rose-700/90";
const WORKFLOW_WAIT_RESUME_WARNING_SUMMARY_CLASS = "mt-1 text-sm text-amber-900/90";
const WORKFLOW_WAIT_RESUME_DANGER_NEXT_STEP_CLASS = "mt-2 text-xs text-rose-700/80";
const WORKFLOW_WAIT_RESUME_WARNING_NEXT_STEP_CLASS = "mt-2 text-xs text-amber-900/80";
const WORKFLOW_APPROVAL_OPTION_APPROVED_CLASS =
  "border-emerald-200/70 bg-emerald-50/85 text-emerald-700 hover:bg-emerald-100";
const WORKFLOW_APPROVAL_OPTION_REJECTED_CLASS =
  "border-rose-200/70 bg-rose-50/85 text-rose-700 hover:bg-rose-100";
const WORKFLOW_RUN_STATUS_BADGE_CLASS =
  "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]";
const WORKFLOW_REPLAY_SOURCE_BADGE_CLASS =
  "rounded-full border border-amber-200/70 bg-amber-50/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700";
const WORKFLOW_REMAINING_LABEL_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-2 py-0.5 text-[10px] font-medium text-sky-700";
const WORKFLOW_TIMELINE_COUNT_BADGE_CLASS =
  "rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700";
const WORKFLOW_TIMELINE_NODE_DELTA_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700";
const WORKFLOW_DEPLOYMENT_ENTRY_CLASS =
  "w-full rounded-2xl border border-sky-200/70 bg-white/80 px-3 py-2 text-left transition hover:bg-white";
const WORKFLOW_DEPLOYMENT_ENTRY_SELECTED_CLASS = "ring-2 ring-sky-300/70";
const WORKFLOW_REPLAY_ENTRY_CLASS =
  "w-full rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2 text-left transition hover:bg-white";
const WORKFLOW_REPLAY_ENTRY_SELECTED_CLASS = "ring-2 ring-amber-300/70";
const WORKFLOW_REPLAY_DIFF_BADGE_CLASS =
  "rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700";
const WORKFLOW_REPLAY_SAME_DEPLOYMENT_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700";
const WORKFLOW_DURATION_BADGE_CLASS =
  "rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700";
const WORKFLOW_FAMILY_CONTEXT_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_FAMILY_CONTEXT_VALUE_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium text-violet-800";
const WORKFLOW_WAIT_RESUME_FAMILY_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_LIVE_EXECUTION_CONNECTED_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-emerald-50/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700";
const WORKFLOW_LIVE_EXECUTION_REPLAYING_BADGE_CLASS =
  "rounded-full border border-slate-200/70 bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700";
const WORKFLOW_LIVE_EXECUTION_EVENT_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const WORKFLOW_LIVE_EXECUTION_PHASE_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_LIVE_EXECUTION_OUTCOME_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700";
const WORKFLOW_LIVE_EXECUTION_STEP_BADGE_CLASS =
  "rounded-full border border-slate-200/70 bg-slate-50/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700";
const WORKFLOW_LIVE_EXECUTION_DETAIL_BADGE_CLASS =
  "text-[11px] uppercase tracking-[0.12em] text-sky-700/80";
const WORKFLOW_STATUS_LINE_BLOCKED_CLASS =
  "mt-3 text-xs font-medium uppercase tracking-[0.14em] text-orange-700";
const WORKFLOW_STATUS_LINE_FAILED_CLASS =
  "mt-3 text-xs font-medium uppercase tracking-[0.14em] text-rose-700";
const WORKFLOW_STATUS_LINE_PAUSED_CLASS =
  "mt-3 text-xs font-medium uppercase tracking-[0.14em] text-amber-700";
const WORKFLOW_STATUS_LINE_WAIT_CLASS =
  "mt-2 text-sm text-sky-900";
const WORKFLOW_STATUS_LINE_APPROVAL_REASON_CLASS =
  "mt-2 text-sm text-amber-900";
const WORKFLOW_STATUS_LINE_DECISION_POINT_CLASS =
  "mt-2 text-xs uppercase tracking-[0.14em] text-amber-700";
const WORKFLOW_STATUS_LINE_WAIT_STATE_CLASS =
  "mt-2 text-xs uppercase tracking-[0.14em] text-sky-700";
const WORKFLOW_POLICY_DRIFT_ACTION_CLASS =
  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white";
const WORKFLOW_POLICY_DRIFT_DEPLOYMENT_ACTION_CLASS =
  "border-sky-200/70 bg-white/85 text-sky-700";
const WORKFLOW_POLICY_DRIFT_REPLAY_ACTION_CLASS =
  "border-amber-200/70 bg-white/85 text-amber-700";
const WORKFLOW_EXECUTION_PHASE_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_EXECUTION_LOG_INDEX_BADGE_CLASS =
  "rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_EXECUTION_LOG_PHASE_BADGE_CLASS =
  "rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_HEADER_ACTION_CLASS =
  "rounded-full border px-3 py-1 text-xs font-medium transition";
const WORKFLOW_HEADER_WORKFLOW_LINK_ACTION_CLASS =
  `${WORKFLOW_HEADER_ACTION_CLASS} border-slate-200/70 bg-white/85 text-slate-700 hover:bg-white`;
const WORKFLOW_HEADER_SHARE_LINK_ACTION_CLASS =
  `${WORKFLOW_HEADER_ACTION_CLASS} border-sky-200/70 bg-sky-50/80 text-sky-700 hover:bg-sky-100`;
const WORKFLOW_HEADER_CORE_REVIEW_LINK_ACTION_CLASS =
  `${WORKFLOW_HEADER_ACTION_CLASS} border-sky-200/70 bg-white/80 text-sky-700 hover:bg-white`;
const WORKFLOW_HEADER_CLEAR_ACTION_CLASS =
  `${WORKFLOW_HEADER_ACTION_CLASS} border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white`;
const WORKFLOW_DEPLOYMENT_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const WORKFLOW_DEPLOYMENT_COMPARISON_BADGE_CLASS =
  "rounded-full border border-white/50 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant";
const WORKFLOW_DEPLOYMENT_ACTION_CLASS =
  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition";
const WORKFLOW_DEPLOYMENT_CONTEXT_ACTION_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-sky-200/70 bg-white/85 text-sky-700 hover:bg-white`;
const WORKFLOW_DEPLOYMENT_CONTEXT_ACTION_ACTIVE_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-sky-300 bg-sky-100 text-sky-800`;
const WORKFLOW_REPLAY_DRIFT_ACTION_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-amber-200/70 bg-white/80 text-amber-700 hover:bg-white`;
const WORKFLOW_REPLAY_DRIFT_ACTION_ACTIVE_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-amber-300 bg-amber-100 text-amber-800`;
const WORKFLOW_TIMELINE_FILTER_ACTION_CLASS =
  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition";
const WORKFLOW_TIMELINE_FILTER_ALL_ACTION_CLASS =
  `${WORKFLOW_TIMELINE_FILTER_ACTION_CLASS} border-violet-200/70 bg-violet-100/80 text-violet-800 hover:bg-violet-100`;
const WORKFLOW_TIMELINE_FILTER_NODE_ACTION_CLASS =
  `${WORKFLOW_TIMELINE_FILTER_ACTION_CLASS} border-sky-200/70 bg-sky-50/85 text-sky-800 hover:bg-sky-100`;
const WORKFLOW_TIMELINE_REPLAY_ACTION_CLASS =
  "rounded-full border border-fuchsia-200/70 bg-fuchsia-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700 transition hover:bg-fuchsia-100 disabled:opacity-40";

function workflowRunOverviewPanelState(o: any): WorkflowRunOverviewPanelState {
  const approvalReviewPanel = workflowRunApprovalReviewPanelState(o.run);
  const headerActionItems: WorkflowActionLinkItem[] = [
    {
      className: WORKFLOW_HEADER_WORKFLOW_LINK_ACTION_CLASS,
      label: "Workflow link",
      onClick: () => void o.copyWorkflowLink(),
    },
    {
      className: WORKFLOW_HEADER_SHARE_LINK_ACTION_CLASS,
      label: "Share link",
      onClick: () => void o.copyReviewLink(true),
    },
    {
      className: WORKFLOW_HEADER_CORE_REVIEW_LINK_ACTION_CLASS,
      label: "Core review link",
      onClick: () => void o.copyReviewLink(false),
    },
    {
      className: WORKFLOW_HEADER_CLEAR_ACTION_CLASS,
      label: "Clear",
      onClick: o.clearSelection,
    },
  ];

  const headerBadges: WorkflowRunHeaderBadge[] = [
    {
      className: `${WORKFLOW_RUN_STATUS_BADGE_CLASS} ${o.runStatusClass}`,
      label: o.run.status.replaceAll("_", " "),
    },
    ...(o.run.replay_of_run_id
      ? [{
        className: WORKFLOW_REPLAY_SOURCE_BADGE_CLASS,
        label: `replay of ${String(o.run.replay_of_run_id).slice(0, 8)}`,
        title: `Replay of ${String(o.run.replay_of_run_id)}`,
      }]
      : []),
    ...(o.remainingLabel
      ? [{
        className: WORKFLOW_REMAINING_LABEL_BADGE_CLASS,
        label: o.remainingLabel,
      }]
      : []),
  ];

  const deploymentEntryItems: WorkflowDeploymentEntryItem[] =
    (o.runDeploymentEntries ?? []).slice(0, 3).map((entry: any) => ({
      nodeId: entry.nodeId,
      summary: entry.summary,
      titleText: o.nodeLabelById.get(entry.nodeId) ?? entry.nodeId,
      selected: o.focusedTimelineNodeId === entry.nodeId,
      onClick: () => o.focusRunTimelineNode(entry.nodeId, "deployment_context"),
    }));

  const replayEntryItems: WorkflowReplayEntryItem[] = (o.replayChangedNodes ?? []).map(
    (entry: any) => ({
      nodeId: entry.nodeId,
      summary: entry.summary,
      titleText: o.nodeLabelById.get(entry.nodeId) ?? entry.nodeId,
      selected: o.focusedTimelineNodeId === entry.nodeId,
      onClick: () => o.focusRunTimelineNode(entry.nodeId, "replay_drift"),
    }),
  );

  const timelineBadgeItems: WorkflowTimelineBadgeItem[] = [
    {
      className: WORKFLOW_TIMELINE_COUNT_BADGE_CLASS,
      label: `${o.timelineLength} steps`,
    },
    ...(o.runNodePolicyDeltaCount > 0 || o.runEdgePolicyDeltaCount > 0
      ? [
        {
          className: WORKFLOW_TIMELINE_NODE_DELTA_BADGE_CLASS,
          label: `${o.runNodePolicyDeltaCount} node delta${o.runNodePolicyDeltaCount === 1 ? "" : "s"}`,
        },
        {
          className: WORKFLOW_TIMELINE_NODE_DELTA_BADGE_CLASS,
          label: `${o.runEdgePolicyDeltaCount} edge delta${o.runEdgePolicyDeltaCount === 1 ? "" : "s"}`,
        },
      ]
      : []),
    ...(o.durationLabel
      ? [{
        className: WORKFLOW_DURATION_BADGE_CLASS,
        label: o.durationLabel,
      }]
      : []),
    ...((o.outcomeBadges ?? []) as unknown[])
      .map(workflowTimelineBadgeFromUnknown)
      .filter((badge): badge is WorkflowTimelineBadgeItem => badge !== null),
  ];

  const timelineFilterActionItems: WorkflowFilterActionItem[] = [
    ...(o.timelineFilterMode !== "all"
      ? [{
        className: WORKFLOW_TIMELINE_FILTER_ALL_ACTION_CLASS,
        label: `viewing ${o.timelineFilterSummaryLabel}`,
        onClick: () => o.applyRunTimelineFilter("all"),
      }]
      : []),
    ...(o.focusedTimelineNodeLabel
      ? [{
        className: WORKFLOW_TIMELINE_FILTER_NODE_ACTION_CLASS,
        label: `node ${o.focusedTimelineNodeLabel}`,
        onClick: o.clearTimelineNodeFocus,
      }]
      : []),
  ];

  const deploymentBadgeItems: WorkflowDeploymentBadgeItem[] = [
    {
      className: WORKFLOW_DEPLOYMENT_BADGE_CLASS,
      label: o.run.deployment_id,
    },
    ...(o.runDeploymentSummaryChangedNodeCount !== null
      ? [{
        className: WORKFLOW_DEPLOYMENT_BADGE_CLASS,
        label: `${o.runDeploymentSummaryChangedNodeCount} node changes`,
      }]
      : []),
    ...(o.runDeploymentComparedToId
      ? [{
        className: WORKFLOW_DEPLOYMENT_COMPARISON_BADGE_CLASS,
        label: `vs ${o.runDeploymentComparedToId}`,
      }]
      : []),
  ];

  const deploymentActionItems: WorkflowActionItem[] = [
    ...(o.timelineDeploymentContextCount > 0
      ? [{
        className: o.timelineFilterMode === "deployment_context"
          ? WORKFLOW_DEPLOYMENT_CONTEXT_ACTION_ACTIVE_CLASS
          : WORKFLOW_DEPLOYMENT_CONTEXT_ACTION_CLASS,
        label: `review ${o.timelineDeploymentContextCount} deployment step${o.timelineDeploymentContextCount === 1 ? "" : "s"}`,
        onClick: () => o.applyRunTimelineFilter("deployment_context"),
      }]
      : []),
  ];

  const replayActionItems: WorkflowActionItem[] = [
    ...(o.timelineReplayDriftCount > 0
      ? [{
        className: o.timelineFilterMode === "replay_drift"
          ? WORKFLOW_REPLAY_DRIFT_ACTION_ACTIVE_CLASS
          : WORKFLOW_REPLAY_DRIFT_ACTION_CLASS,
        label: `review ${o.timelineReplayDriftCount} drifted step${o.timelineReplayDriftCount === 1 ? "" : "s"}`,
        onClick: () => o.applyRunTimelineFilter("replay_drift"),
      }]
      : []),
  ];

  const waitResumeErrorReceipt = o.waitResumeError
    ? buildWorkflowWaitResumeFailureReceipt(o.waitResumeError)
    : null;

  const waitResumeSummaryBadges: WorkflowWaitResumeSummaryBadge[] = [
    {
      className:
        "rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700",
      label: `${o.waitResumeSummary.total} recorded waits`,
    },
    ...(o.waitResumeSummary.pending > 0
      ? [{
        className:
          "rounded-full border border-amber-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700",
        label: workflowWaitResumePendingSummary(o.waitResumeSummary.pending),
      }]
      : []),
    ...(o.waitResumeSummary.activeFollowup > 0
      ? [{
        className:
          "rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700",
        label: `${o.waitResumeSummary.activeFollowup} continued to new wait`,
      }]
      : []),
    ...(o.waitResumeSummary.resolved > 0
      ? [{
        className:
          "rounded-full border border-emerald-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700",
        label: `${o.waitResumeSummary.resolved} resolved`,
      }]
      : []),
  ];

  const approvalOptionItems: WorkflowApprovalOptionItem[] = (o.approvalOptions ?? []).map(
    (option: any) => {
      const label = typeof option.label === "string"
        ? option.label
        : typeof option.option_id === "string"
          ? option.option_id
          : "Option";
      const decision = o.workflowApprovalDecisionForOption(option);
      return {
        option,
        label,
        decision,
        actionTitle: workflowApprovalDecisionActionTitle(decision, label),
        buttonClassName: decision === "approved"
          ? WORKFLOW_APPROVAL_OPTION_APPROVED_CLASS
          : WORKFLOW_APPROVAL_OPTION_REJECTED_CLASS,
      };
    },
  );

  const runtimeKindCountItems: WorkflowRuntimeKindCountItem[] = (o.runtimeKindCounts ?? []).map(
    (entry: any) => ({
      label: String(entry[0]),
      value: String(entry[1]),
    }),
  );

  const familyContextBadges: WorkflowFamilyContextBadge[] = [
    ...(o.activeFamilyContext?.familyId
      ? [{ label: `family ${o.activeFamilyContext.familyId}` }]
      : []),
    ...(o.activeFamilyContext?.semanticRole
      ? [{ label: `role ${o.activeFamilyContext.semanticRole.replaceAll("_", " ")}` }]
      : []),
    ...(o.activeFamilyContext?.familyWorkflowId
      ? [{ label: `source ${o.activeFamilyContext.familyWorkflowId}` }]
      : []),
  ];

  const familyContextValueItems: WorkflowFamilyContextValueItem[] =
    (o.activeFamilyContext?.values ?? []).map((entry: any) => ({
      label: `${entry.key}=${entry.value}`,
    }));

  const waitResumeRecordItems: WorkflowWaitResumeRecordItem[] = (o.waitResumeRecords ?? []).map(
    (record: any) => {
      const familyContext = o.waitResumeRecordFamilyContext(record);
      return {
        record,
        focusNodeId: o.waitResumeFocusNodeId(record) ?? null,
        familyBadges: [
          ...(familyContext?.familyId ? [{ label: familyContext.familyId }] : []),
          ...(familyContext?.semanticRole
            ? [{ label: familyContext.semanticRole.replaceAll("_", " ") }]
            : []),
        ],
      };
    },
  );

  const liveExecutionItems: WorkflowLiveExecutionItem[] = (o.liveExecutionPreview ?? []).map(
    (entry: any) => ({
      labelText: entry.label ?? entry.node_id ?? entry.event.replaceAll("_", " "),
      reasonText: entry.reason ?? null,
      optionConsequenceText: entry.option_consequence ? String(entry.option_consequence) : null,
      resultSummaryText: entry.result_summary ? String(entry.result_summary) : null,
      noteText: entry.note ? `Note: ${String(entry.note)}` : null,
      eventBadges: [
        { label: entry.event.replaceAll("_", " ") },
        ...(entry.phase ? [{ label: entry.phase.replaceAll("_", " ") }] : []),
        ...(entry.outcome_checkpoint
          ? [{ label: entry.outcome_checkpoint.replaceAll("_", " ") }]
          : []),
        ...(typeof entry.index === "number" ? [{ label: `step ${(entry.index ?? 0) + 1}` }] : []),
      ],
      detailBadges: [
        ...(entry.runtime_kind ? [{ label: String(entry.runtime_kind) }] : []),
        ...(entry.graph_node_kind ? [{ label: String(entry.graph_node_kind) }] : []),
        ...(entry.ts ? [{ label: o.formatTimelineStamp(entry.ts) ?? entry.ts }] : []),
      ],
    }),
  );

  const statusLineItems: WorkflowStatusLineItem[] = [
    ...(o.pausedAtLabel
      ? [{
        className: WORKFLOW_STATUS_LINE_PAUSED_CLASS,
        label: `Paused at ${o.pausedAtLabel}`,
      }]
      : []),
    ...(o.approvalReason
      && !approvalReviewPanel.showPanel
      ? [{
        className: WORKFLOW_STATUS_LINE_APPROVAL_REASON_CLASS,
        label: o.approvalReason,
      }]
      : []),
    ...(o.waitReason
      ? [{
        className: WORKFLOW_STATUS_LINE_WAIT_CLASS,
        label: o.waitReason,
      }]
      : []),
    ...(o.approvalDecisionPointId
      ? [{
        className: WORKFLOW_STATUS_LINE_DECISION_POINT_CLASS,
        label: `Decision point ${o.approvalDecisionPointId}`,
      }]
      : []),
    ...(o.waitResumeStateLabel
      ? [{
        className: WORKFLOW_STATUS_LINE_WAIT_STATE_CLASS,
        label: o.waitResumeStateLabel,
      }]
      : []),
    ...(o.blockedLabel
      ? [{
        className: WORKFLOW_STATUS_LINE_BLOCKED_CLASS,
        label: o.blockedLabel,
      }]
      : []),
    ...(o.failedLabel
      ? [{
        className: WORKFLOW_STATUS_LINE_FAILED_CLASS,
        label: o.failedLabel,
      }]
      : []),
  ];

  const policyDriftActionItems: WorkflowPolicyDriftActionItem[] = [
    ...(o.deploymentDeltaLabel
      ? [{
        label: o.deploymentDeltaLabel,
        className: `${WORKFLOW_POLICY_DRIFT_ACTION_CLASS} ${WORKFLOW_POLICY_DRIFT_DEPLOYMENT_ACTION_CLASS}`,
        onClick: () => o.setRunTimelineFilterMode("deployment_context"),
      }]
      : []),
    ...(o.replayDeltaLabel
      ? [{
        label: o.replayDeltaLabel,
        className: `${WORKFLOW_POLICY_DRIFT_ACTION_CLASS} ${WORKFLOW_POLICY_DRIFT_REPLAY_ACTION_CLASS}`,
        onClick: () => o.setRunTimelineFilterMode("replay_drift"),
      }]
      : []),
  ];

  const executionPhaseBadges: WorkflowExecutionPhaseBadge[] =
    (o.executionPhaseCounts ?? []).map((entry: any) => ({
      label: `${entry[0].replaceAll("_", " ")} ${entry[1]}`,
    }));

  const executionLogItems: WorkflowExecutionLogItem[] =
    (o.executionLogPreview ?? []).map((entry: any) => ({
      indexLabel: String(entry.index),
      phaseLabel: entry.phase.replaceAll("_", " "),
      text: entry.text,
      titleText: entry.title,
      toneClassName: entry.toneClass,
    }));

  return {
    headerActionItems,
    headerBadges,
    timelineBadgeItems,
    timelineFilterActionItems,
    approvalReviewPanel,
    deploymentBadgeItems,
    deploymentActionItems,
    deploymentEntryItems,
    replayActionItems,
    replayEntryItems,
    showDeploymentEntries: o.runDeploymentEntries.length > 0,
    showDeploymentOverflowNotice: o.runDeploymentEntries.length > 3,
    deploymentOverflowCount: Math.max(0, o.runDeploymentEntries.length - 3),
    replayDiffBadge: o.replayDiffBadgeLabel
      ? {
        className: WORKFLOW_REPLAY_DIFF_BADGE_CLASS,
        label: o.replayDiffBadgeLabel,
      }
      : {
        className: WORKFLOW_REPLAY_SAME_DEPLOYMENT_BADGE_CLASS,
        label: "Same deployment",
      },
    showReplayEntries: o.replayChangedNodes.length > 0,
    waitResumeErrorReceipt,
    waitResumeSummaryBadges,
    showWaitResumeEmptyState:
      !o.waitResumeLoading && !waitResumeErrorReceipt && o.waitResumeRecords.length === 0,
    showWaitResumeRecords: o.waitResumeRecords.length > 0,
    approvalOptionItems,
    runtimeKindCountItems,
    familyContextBadges,
    familyContextValueItems,
    showFamilyContextValues: familyContextValueItems.length > 0,
    waitResumeRecordItems,
    liveExecutionItems,
    showLiveExecutionItems: liveExecutionItems.length > 0,
    liveExecutionStatusBadge: o.liveRunStreamConnected
      ? { label: "connected" }
      : { label: "replaying" },
    statusLineItems,
    policyDriftActionItems,
    executionPhaseBadges,
    executionLogItems,
    showExecutionLogOverflowNotice:
      (o.executionLogEntries?.length ?? 0) > (o.executionLogPreview?.length ?? 0),
  };
}

function WorkflowApprovalReviewSection(props: { panelState: WorkflowRunOverviewPanelState }) {
  return (
    <Show when={props.panelState.approvalReviewPanel.showPanel}>
      <ApprovalReviewSummary
        approvalReview={props.panelState.approvalReviewPanel.reviewValue}
        fallbackReason={props.panelState.approvalReviewPanel.fallbackReasonText}
        autonomyDecision={props.panelState.approvalReviewPanel.autonomyDecision}
        class="mt-3 space-y-2 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3"
        titleClass="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-amber-700"
        chipClass="rounded-full border border-amber-200/70 bg-white/80 px-2 py-0.5 normal-case tracking-normal text-amber-800"
        confidenceClass="rounded-full border border-amber-300/70 bg-white/80 px-2 py-0.5 normal-case tracking-normal text-amber-800"
        summaryClass="text-xs text-amber-900/85"
        listClass="space-y-1 text-xs text-amber-900/80"
        previewClass="rounded-lg border border-amber-200/70 bg-white/70"
      />
    </Show>
  );
}

function WorkflowWaitResumeSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-4 rounded-[20px] border border-sky-200/70 bg-sky-50/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Wait / resume chain</p>
          <p class="mt-1 text-sm text-sky-900">{workflowWaitResumeChainSummary()}</p>
        </div>
        <Show when={o.waitResumeSummary.total > 0}>
          <div class="flex flex-wrap gap-2">
            <For each={state.waitResumeSummaryBadges}>
              {(badge) => <span class={badge.className}>{badge.label}</span>}
            </For>
          </div>
        </Show>
      </div>
      <Show when={o.waitResumeLoading}>
        <p class="mt-3 text-sm text-sky-800">Loading persisted wait records for this run.</p>
      </Show>
      <Show when={o.waitResumeError}>
        <div
          class={`mt-3 rounded-2xl px-4 py-3 ${state.waitResumeErrorReceipt?.tone === "danger"
            ? WORKFLOW_WAIT_RESUME_DANGER_RECEIPT_CLASS
            : WORKFLOW_WAIT_RESUME_WARNING_RECEIPT_CLASS}`}
        >
          <p
            class={state.waitResumeErrorReceipt?.tone === "danger"
              ? WORKFLOW_WAIT_RESUME_DANGER_TITLE_CLASS
              : WORKFLOW_WAIT_RESUME_WARNING_TITLE_CLASS}
          >
            {state.waitResumeErrorReceipt?.title}
          </p>
          <p
            class={state.waitResumeErrorReceipt?.tone === "danger"
              ? WORKFLOW_WAIT_RESUME_DANGER_SUMMARY_CLASS
              : WORKFLOW_WAIT_RESUME_WARNING_SUMMARY_CLASS}
          >
            {state.waitResumeErrorReceipt?.summary}
          </p>
          <p
            class={state.waitResumeErrorReceipt?.tone === "danger"
              ? WORKFLOW_WAIT_RESUME_DANGER_NEXT_STEP_CLASS
              : WORKFLOW_WAIT_RESUME_WARNING_NEXT_STEP_CLASS}
          >
            {state.waitResumeErrorReceipt?.nextStep}
          </p>
        </div>
      </Show>
      <Show when={state.showWaitResumeEmptyState}>
        <p class="mt-3 text-sm text-sky-800">This run has not recorded any durable wait / resume checkpoints yet.</p>
      </Show>
      <Show when={state.showWaitResumeRecords}>
        <div class="mt-4 space-y-3">
          <For each={state.waitResumeRecordItems}>
            {(item) => (
              <div class="rounded-[18px] border border-sky-200/70 bg-white/85 p-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${o.waitResumeStatusChipClass(item.record.status)}`}>{o.waitResumeStatusLabel(item.record.status)}</span>
                      <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">{o.waitResumeFamilyLabel(item.record)}</span>
                    </div>
                    <p class="mt-2 text-sm font-semibold text-sky-950">{o.waitResumeSourceLabel(item.record) || item.record.wait_resume_id}</p>
                    <Show when={item.record.wait_reason}><p class="mt-1 text-sm text-sky-900">{item.record.wait_reason}</p></Show>
                    <Show when={item.familyBadges.length > 0}>
                      <div class="mt-2 flex flex-wrap gap-2">
                        <For each={item.familyBadges}>
                          {(badge) => (
                            <span class={WORKFLOW_WAIT_RESUME_FAMILY_BADGE_CLASS}>{badge.label}</span>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                  <Show when={item.focusNodeId}>
                    <button type="button" class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100" onClick={() => o.focusRunTimelineNode(item.focusNodeId, "all")}>Focus node</button>
                  </Show>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <For each={o.waitResumeRecordBadges(item.record)}>
                    {(badge: WorkflowRecordBadgeItem) => <span class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${badge.className}`}>{badge.label}</span>}
                  </For>
                  <span class="rounded-full border border-slate-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">{item.record.wait_resume_id}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function WorkflowLiveExecutionSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-4 rounded-[20px] border border-sky-200/70 bg-sky-50/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Live execution</p>
          <p class="mt-1 text-sm text-sky-900">Streaming run events from the workflow runtime. Persisted timeline detail remains below.</p>
        </div>
        <span class={o.liveRunStreamConnected ? WORKFLOW_LIVE_EXECUTION_CONNECTED_BADGE_CLASS : WORKFLOW_LIVE_EXECUTION_REPLAYING_BADGE_CLASS}>
          {state.liveExecutionStatusBadge.label}
        </span>
      </div>
      <Show when={state.showLiveExecutionItems}>
        <div class="mt-4 space-y-2">
          <For each={state.liveExecutionItems}>
            {(entry) => (
              <div class="rounded-2xl border border-white/70 bg-white/85 px-3 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <For each={entry.eventBadges}>
                    {(badge, index) => (
                      <span class={index() === 0
                        ? WORKFLOW_LIVE_EXECUTION_EVENT_BADGE_CLASS
                        : index() === 1
                          ? WORKFLOW_LIVE_EXECUTION_PHASE_BADGE_CLASS
                          : index() === 2 && entry.eventBadges.length > 2
                            ? WORKFLOW_LIVE_EXECUTION_OUTCOME_BADGE_CLASS
                            : WORKFLOW_LIVE_EXECUTION_STEP_BADGE_CLASS}>
                        {badge.label}
                      </span>
                    )}
                  </For>
                </div>
                <p class="mt-2 text-sm font-semibold text-sky-950">{entry.labelText}</p>
                <Show when={entry.reasonText}><p class="mt-1 text-sm text-sky-900">{entry.reasonText}</p></Show>
                <Show when={entry.optionConsequenceText}>
                  <p class="mt-1 text-sm text-sky-900">{entry.optionConsequenceText}</p>
                </Show>
                <Show when={entry.resultSummaryText}>
                  <p class="mt-1 text-sm text-sky-900">{entry.resultSummaryText}</p>
                </Show>
                <Show when={entry.noteText}>
                  <p class="mt-1 text-sm text-sky-900">{entry.noteText}</p>
                </Show>
                <div class={WORKFLOW_LIVE_EXECUTION_DETAIL_BADGE_CLASS}>
                  <For each={entry.detailBadges}>
                    {(badge) => <span>{badge.label}</span>}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function WorkflowExecutionLogSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-4 rounded-[20px] border border-violet-200/70 bg-white/80 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Execution log</p>
          <p class="mt-1 text-sm text-violet-900">Compact phase-oriented trace for this run. Use the full timeline below for detailed events.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <For each={state.executionPhaseBadges}>
            {(entry) => (
              <span class={WORKFLOW_EXECUTION_PHASE_BADGE_CLASS}>
                {entry.label}
              </span>
            )}
          </For>
        </div>
      </div>
      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <For each={state.executionLogItems}>
          {(entry) => (
            <div class={`rounded-2xl border px-3 py-3 ${entry.toneClassName}`}>
              <div class="flex flex-wrap items-center gap-2">
                <span class={WORKFLOW_EXECUTION_LOG_INDEX_BADGE_CLASS}>{entry.indexLabel}</span>
                <span class={WORKFLOW_EXECUTION_LOG_PHASE_BADGE_CLASS}>{entry.phaseLabel}</span>
              </div>
              <p class="mt-2 text-sm font-semibold">{entry.titleText}</p>
              <p class="mt-1 text-sm">{entry.text}</p>
            </div>
          )}
        </For>
      </div>
      <Show when={state.showExecutionLogOverflowNotice}>
        <p class="mt-3 text-xs text-violet-700/80">Showing {o.executionLogPreview.length} of {o.executionLogEntries.length} execution log entries.</p>
      </Show>
    </div>
  );
}

function WorkflowRunHeaderSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-violet-900">Run detail</p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-[0.18em] text-violet-700">{o.run.run_id} - {o.executionMode}</p>
            <For each={state.headerBadges}>
              {(badge) => (
                <span class={badge.className} title={badge.title}>
                  {badge.label}
                </span>
              )}
            </For>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <For each={state.headerActionItems.slice(0, 1)}>
            {(item) => (
              <button type="button" class={item.className} onClick={item.onClick}>
                {item.label}
              </button>
            )}
          </For>
          <Show when={o.storedSharedReviewVisible}>
            {o.renderStoredSharedReviewControls("Resume review")}
          </Show>
          <For each={state.headerActionItems.slice(1, 3)}>
            {(item) => (
              <button type="button" class={item.className} onClick={item.onClick}>
                {item.label}
              </button>
            )}
          </For>
          <span class="text-[11px] text-violet-700/80">
            Workflow link is clean. Share link can preserve this full workspace or just this run review.
          </span>
          <For each={state.headerActionItems.slice(3)}>
            {(item) => (
              <button type="button" class={item.className} onClick={item.onClick}>
                {item.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={o.statusSummary}>
        <div class="mt-3 rounded-2xl border border-violet-200/70 bg-white/80 px-4 py-3 text-sm font-medium text-violet-900">
          {o.statusSummary}
        </div>
      </Show>
      <p class="mt-3 text-sm text-violet-900">{o.summaryText}</p>
    </>
  );
}

function WorkflowDeploymentContextSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Deployment context</p>
        <For each={state.deploymentBadgeItems}>
          {(item) => <span class={item.className}>{item.label}</span>}
        </For>
        <For each={state.deploymentActionItems}>
          {(item) => (
            <button type="button" class={item.className} onClick={item.onClick}>
              {item.label}
            </button>
          )}
        </For>
      </div>
      <Show when={state.showDeploymentEntries}>
        <div class="mt-3 space-y-2">
          <For each={state.deploymentEntryItems}>
            {(entry) => (
              <button
                type="button"
                class={`${WORKFLOW_DEPLOYMENT_ENTRY_CLASS} ${entry.selected ? WORKFLOW_DEPLOYMENT_ENTRY_SELECTED_CLASS : ""}`}
                onClick={entry.onClick}
              >
                <p class="text-sm font-semibold text-sky-900">{entry.titleText}</p>
                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-700">{entry.summary}</p>
              </button>
            )}
          </For>
          <Show when={state.showDeploymentOverflowNotice}>
            <p class="text-xs text-sky-700/80">{state.deploymentOverflowCount} more deployment policy changes are attached to this run.</p>
          </Show>
        </div>
      </Show>
      <Show when={o.run.replay_of_run_id}>
        <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Replay deployment comparison</p>
            <span class={state.replayDiffBadge.className}>
              {state.replayDiffBadge.label}
            </span>
            <For each={state.replayActionItems}>
              {(item) => (
                <button type="button" class={item.className} onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </For>
          </div>
          <p class="mt-1 text-sm text-amber-900">
            This replay references run {o.run.replay_of_run_id} and executed on {o.replayDeploymentLabel}.
          </p>
          <Show when={state.showReplayEntries}>
            <div class="mt-3 space-y-2">
              <For each={state.replayEntryItems}>
                {(entry) => (
                  <button
                    type="button"
                    class={`${WORKFLOW_REPLAY_ENTRY_CLASS} ${entry.selected ? WORKFLOW_REPLAY_ENTRY_SELECTED_CLASS : ""}`}
                    onClick={entry.onClick}
                  >
                    <p class="text-sm font-semibold text-amber-900">{entry.titleText}</p>
                    <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700">{entry.summary}</p>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function WorkflowTimelineSummarySection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-3 flex flex-wrap gap-2">
      <For each={state.timelineBadgeItems}>
        {(badge) => <span class={badge.className}>{badge.label}</span>}
      </For>
      <For each={state.timelineFilterActionItems}>
        {(item) => (
          <button type="button" class={item.className} onClick={item.onClick}>
            {item.label}
          </button>
        )}
      </For>
      <Show when={o.timelineLength > 0}>
        <button
          type="button"
          disabled={o.replayActive}
          onClick={o.startReplay}
          class={WORKFLOW_TIMELINE_REPLAY_ACTION_CLASS}
          title="Step through this run's execution trace on the canvas"
        >
          {o.traceReplayLabel}
        </button>
      </Show>
    </div>
  );
}

function WorkflowPolicyDriftSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 p-3">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Policy drift summary</p>
        <For each={state.policyDriftActionItems}>
          {(item) => (
            <button type="button" class={item.className} onClick={item.onClick}>
              {item.label}
            </button>
          )}
        </For>
      </div>
      <p class="mt-2 text-sm text-sky-900">{o.policyDriftSummaryText}</p>
    </div>
  );
}

function WorkflowStatusLinesSection(props: { panelState: WorkflowRunOverviewPanelState }) {
  return (
    <For each={props.panelState.statusLineItems}>
      {(item) => <p class={item.className}>{item.label}</p>}
    </For>
  );
}

function WorkflowFamilyContextSection(props: { panelState: WorkflowRunOverviewPanelState }) {
  const state = props.panelState;

  return (
    <div class="mt-3 rounded-2xl border border-violet-200/70 bg-violet-50/80 px-3 py-3">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Workflow family context</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <For each={state.familyContextBadges}>
          {(badge) => (
            <span class={WORKFLOW_FAMILY_CONTEXT_BADGE_CLASS}>
              {badge.label}
            </span>
          )}
        </For>
      </div>
      <Show when={state.showFamilyContextValues}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={state.familyContextValueItems}>
            {(entry) => (
              <span class={WORKFLOW_FAMILY_CONTEXT_VALUE_BADGE_CLASS}>
                {entry.label}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function WorkflowApprovalOptionsSection(props: { overview: any; panelState: WorkflowRunOverviewPanelState }) {
  const o = props.overview;
  const state = props.panelState;

  return (
    <div class="mt-3 flex flex-wrap gap-2">
      <For each={state.approvalOptionItems}>
        {(item) => (
          <button
            type="button"
            class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition ${item.buttonClassName} disabled:cursor-not-allowed disabled:opacity-60`}
            disabled={o.approvalButtonsBusy}
            title={item.actionTitle}
            aria-label={item.actionTitle}
            onClick={() => void o.handleWorkflowApprovalDecision(o.run, item.option)}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}

function WorkflowRuntimeKindCountsSection(props: { panelState: WorkflowRunOverviewPanelState }) {
  return (
    <div class="mt-3 flex flex-wrap gap-2">
      <For each={props.panelState.runtimeKindCountItems}>
        {(entry) => (
          <span class="rounded-full border border-violet-200/70 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700">
            {entry.label}: {entry.value}
          </span>
        )}
      </For>
    </div>
  );
}

export function WorkflowRunOverviewPanel(props: { overview: any }) {
  const o = props.overview;
  const panelState = createMemo(() => workflowRunOverviewPanelState(o));

  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [
      <WorkflowRunHeaderSection overview={o} panelState={state} />,
      <WorkflowTimelineSummarySection overview={o} panelState={state} />,
      <WorkflowApprovalReviewSection panelState={state} />,
      <WorkflowStatusLinesSection panelState={state} />,
    ];

    if (o.runDeployment) {
      sections.splice(1, 0, <WorkflowDeploymentContextSection overview={o} panelState={state} />);
    }

    if (o.showPolicyDriftSummary) {
      sections.push(<WorkflowPolicyDriftSection overview={o} panelState={state} />);
    }

    if (o.activeFamilyContext) {
      sections.push(<WorkflowFamilyContextSection panelState={state} />);
    }

    if (o.waitResumeVisible) {
      sections.push(<WorkflowWaitResumeSection overview={o} panelState={state} />);
    }

    if (o.showApprovalOptions) {
      sections.push(<WorkflowApprovalOptionsSection overview={o} panelState={state} />);
    }

    if (o.runtimeKindCounts.length > 0) {
      sections.push(<WorkflowRuntimeKindCountsSection panelState={state} />);
    }

    if (o.liveExecutionVisible) {
      sections.push(<WorkflowLiveExecutionSection overview={o} panelState={state} />);
    }

    if (o.executionLogEntries.length > 0) {
      sections.push(<WorkflowExecutionLogSection overview={o} panelState={state} />);
    }

    return sections;
  });

  return (
    <div class="rounded-[22px] border border-violet-200/70 bg-violet-50/70 p-4">
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
