// @locs-version: 1.0
import { createMemo, For, Show, type JSXElement } from "solid-js";
import {
  workflowWaitResumeChainSummary,
  workflowWaitResumePendingSummary,
} from "@/lib/workflowGraphCopy";
import { workflowWaitResumeDecisionSummaryState } from "@/lib/workflowApprovalPanelState";
import {
  buildWorkflowWaitResumeFailureReceipt,
  type WorkflowWaitResumeFailureReceipt,
} from "@/lib/workflowWaitResumeFailureState";

export type WorkflowRunWaitResumePanelRecord = {
  createdAtLabel: string | null;
  decisionConsequence: string | null;
  decisionLabel: string | null;
  decisionNote: string | null;
  familyId: string | null;
  familyLabel: string;
  focusNodeId: string | null;
  resumedAtLabel: string | null;
  scheduledForLabel: string | null;
  semanticRole: string | null;
  sourceLabel: string | null;
  statusClass: string;
  statusLabel: string;
  waitReason: string | null;
  waitResumeId: string;
};

type WorkflowRunWaitResumePanelProps = {
  approvalDecisionConsequence: string | null;
  approvalDecisionLabel: string | null;
  approvalDecisionNote: string | null;
  error: string | null;
  loading: boolean;
  onFocusNode: (nodeId: string) => void;
  onRetry?: (() => void) | null;
  records: WorkflowRunWaitResumePanelRecord[];
  summary: {
    activeFollowup: number;
    pending: number;
    resolved: number;
    total: number;
  };
};

type WorkflowWaitResumeSummaryBadge = {
  className: string;
  label: string;
};

type WorkflowWaitResumeDecisionState = {
  detailLines: string[];
};

type WorkflowWaitResumePanelRecordBadge = {
  className: string;
  label: string;
};

type WorkflowWaitResumePanelRecordState = {
  familyBadges: WorkflowWaitResumePanelRecordBadge[];
  focusNodeId: string | null;
  metadataBadges: WorkflowWaitResumePanelRecordBadge[];
  primaryBadges: WorkflowWaitResumePanelRecordBadge[];
  record: WorkflowRunWaitResumePanelRecord;
  showDecisionConsequence: boolean;
  showDecisionLabel: boolean;
  showDecisionNote: boolean;
  showFocusNodeAction: boolean;
  showFamilyBadges: boolean;
  showMetadataBadges: boolean;
  showWaitReason: boolean;
  sourceText: string;
};

type WorkflowRunWaitResumePanelState = {
  decisionState: WorkflowWaitResumeDecisionState | null;
  errorReceipt: WorkflowWaitResumeFailureReceipt | null;
  recordItems: WorkflowWaitResumePanelRecordState[];
  showEmptyState: boolean;
  showErrorState: boolean;
  showLoadingState: boolean;
  showRecordItems: boolean;
  showRetryAction: boolean;
  showSummaryBadges: boolean;
  summaryBadges: WorkflowWaitResumeSummaryBadge[];
};

const WORKFLOW_WAIT_RESUME_SUMMARY_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const WORKFLOW_WAIT_RESUME_PENDING_BADGE_CLASS =
  "rounded-full border border-amber-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700";
const WORKFLOW_WAIT_RESUME_FOLLOWUP_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_WAIT_RESUME_RESOLVED_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700";
const WORKFLOW_WAIT_RESUME_ERROR_DANGER_CLASS =
  "border border-rose-200/70 bg-rose-50/85";
const WORKFLOW_WAIT_RESUME_ERROR_WARNING_CLASS =
  "border border-amber-200/70 bg-amber-50/85";
const WORKFLOW_WAIT_RESUME_ERROR_DANGER_TITLE_CLASS = "text-sm font-medium text-rose-700";
const WORKFLOW_WAIT_RESUME_ERROR_WARNING_TITLE_CLASS = "text-sm font-medium text-amber-800";
const WORKFLOW_WAIT_RESUME_ERROR_DANGER_SUMMARY_CLASS = "mt-1 text-sm text-rose-700/90";
const WORKFLOW_WAIT_RESUME_ERROR_WARNING_SUMMARY_CLASS = "mt-1 text-sm text-amber-900/90";
const WORKFLOW_WAIT_RESUME_ERROR_DANGER_NEXT_STEP_CLASS = "mt-2 text-xs text-rose-700/80";
const WORKFLOW_WAIT_RESUME_ERROR_WARNING_NEXT_STEP_CLASS = "mt-2 text-xs text-amber-900/80";
const WORKFLOW_WAIT_RESUME_RETRY_DANGER_CLASS =
  "mt-3 rounded-full border border-rose-200/70 bg-white/90 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-white";
const WORKFLOW_WAIT_RESUME_RETRY_WARNING_CLASS =
  "mt-3 rounded-full border border-amber-200/70 bg-white/90 px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-white";
const WORKFLOW_WAIT_RESUME_FAMILY_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const WORKFLOW_WAIT_RESUME_CONTEXT_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_WAIT_RESUME_RECORDED_BADGE_CLASS =
  "rounded-full border border-slate-200/70 bg-slate-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700";
const WORKFLOW_WAIT_RESUME_SCHEDULED_BADGE_CLASS =
  "rounded-full border border-cyan-200/70 bg-cyan-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700";
const WORKFLOW_WAIT_RESUME_RESUMED_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700";
const WORKFLOW_WAIT_RESUME_ID_BADGE_CLASS =
  "rounded-full border border-slate-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700";
const WORKFLOW_WAIT_RESUME_FOCUS_BUTTON_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100";

function workflowWaitResumePanelRecordState(
  record: WorkflowRunWaitResumePanelRecord,
): WorkflowWaitResumePanelRecordState {
  const familyBadges: WorkflowWaitResumePanelRecordBadge[] = [
    ...(record.familyId ? [{ className: WORKFLOW_WAIT_RESUME_CONTEXT_BADGE_CLASS, label: record.familyId }] : []),
    ...(record.semanticRole
      ? [{
        className: WORKFLOW_WAIT_RESUME_CONTEXT_BADGE_CLASS,
        label: record.semanticRole.replaceAll("_", " "),
      }]
      : []),
  ];

  const metadataBadges: WorkflowWaitResumePanelRecordBadge[] = [
    ...(record.createdAtLabel
      ? [{
        className: WORKFLOW_WAIT_RESUME_RECORDED_BADGE_CLASS,
        label: `Recorded ${record.createdAtLabel}`,
      }]
      : []),
    ...(record.scheduledForLabel
      ? [{
        className: WORKFLOW_WAIT_RESUME_SCHEDULED_BADGE_CLASS,
        label: `Scheduled ${record.scheduledForLabel}`,
      }]
      : []),
    ...(record.resumedAtLabel
      ? [{
        className: WORKFLOW_WAIT_RESUME_RESUMED_BADGE_CLASS,
        label: `Resolved ${record.resumedAtLabel}`,
      }]
      : []),
    {
      className: WORKFLOW_WAIT_RESUME_ID_BADGE_CLASS,
      label: record.waitResumeId,
    },
  ];

  return {
    familyBadges,
    focusNodeId: record.focusNodeId,
    metadataBadges,
    primaryBadges: [
      {
        className: `rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${record.statusClass}`,
        label: record.statusLabel,
      },
      {
        className: WORKFLOW_WAIT_RESUME_FAMILY_BADGE_CLASS,
        label: record.familyLabel,
      },
    ],
    record,
    showDecisionConsequence: Boolean(record.decisionConsequence),
    showDecisionLabel: Boolean(record.decisionLabel),
    showDecisionNote: Boolean(record.decisionNote),
    showFocusNodeAction: Boolean(record.focusNodeId),
    showFamilyBadges: familyBadges.length > 0,
    showMetadataBadges: metadataBadges.length > 0,
    showWaitReason: Boolean(record.waitReason),
    sourceText: record.sourceLabel || record.waitResumeId,
  };
}

function workflowRunWaitResumePanelState(
  props: WorkflowRunWaitResumePanelProps,
): WorkflowRunWaitResumePanelState {
  const errorReceipt = props.error
    ? buildWorkflowWaitResumeFailureReceipt(props.error)
    : null;

  const summaryBadges: WorkflowWaitResumeSummaryBadge[] = [
    {
      className: WORKFLOW_WAIT_RESUME_SUMMARY_BADGE_CLASS,
      label: `${props.summary.total} recorded waits`,
    },
    ...(props.summary.pending > 0
      ? [{
        className: WORKFLOW_WAIT_RESUME_PENDING_BADGE_CLASS,
        label: workflowWaitResumePendingSummary(props.summary.pending),
      }]
      : []),
    ...(props.summary.activeFollowup > 0
      ? [{
        className: WORKFLOW_WAIT_RESUME_FOLLOWUP_BADGE_CLASS,
        label: `${props.summary.activeFollowup} continued to new wait`,
      }]
      : []),
    ...(props.summary.resolved > 0
      ? [{
        className: WORKFLOW_WAIT_RESUME_RESOLVED_BADGE_CLASS,
        label: `${props.summary.resolved} resolved`,
      }]
      : []),
  ];
  return {
    decisionState: workflowWaitResumeDecisionSummaryState({
      approvalDecisionLabel: props.approvalDecisionLabel,
      approvalDecisionConsequence: props.approvalDecisionConsequence,
      approvalDecisionNote: props.approvalDecisionNote,
    }),
    errorReceipt,
    recordItems: props.records.map(workflowWaitResumePanelRecordState),
    showEmptyState: !props.loading && !props.error && props.records.length === 0,
    showErrorState: Boolean(props.error),
    showLoadingState: props.loading,
    showRecordItems: props.records.length > 0,
    showRetryAction: Boolean(props.onRetry),
    showSummaryBadges: props.summary.total > 0,
    summaryBadges,
  };
}

function WorkflowWaitResumeHeaderSection(props: { panelState: WorkflowRunWaitResumePanelState }) {
  return (
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Wait / resume chain
        </p>
        <p class="mt-1 text-sm text-sky-900">{workflowWaitResumeChainSummary()}</p>
      </div>
      <Show when={props.panelState.showSummaryBadges}>
        <div class="flex flex-wrap gap-2">
          <For each={props.panelState.summaryBadges}>
            {(badge) => <span class={badge.className}>{badge.label}</span>}
          </For>
        </div>
      </Show>
    </div>
  );
}

function WorkflowWaitResumeDecisionSection(props: {
  decisionState: WorkflowWaitResumeDecisionState;
}) {
  return (
    <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
        Recorded approval decision
      </p>
      <For each={props.decisionState.detailLines}>
        {(line) => <p class="mt-1 text-sm text-amber-900">{line}</p>}
      </For>
    </div>
  );
}

function WorkflowWaitResumeLoadingSection() {
  return <p class="mt-3 text-sm text-sky-800">Loading persisted wait records for this run.</p>;
}

function WorkflowWaitResumeErrorSection(props: {
  onRetry?: (() => void) | null;
  panelState: WorkflowRunWaitResumePanelState;
}) {
  return (
    <div
      class={`mt-3 rounded-2xl px-4 py-3 ${props.panelState.errorReceipt?.tone === "danger"
        ? WORKFLOW_WAIT_RESUME_ERROR_DANGER_CLASS
        : WORKFLOW_WAIT_RESUME_ERROR_WARNING_CLASS}`}
    >
      <p
        class={props.panelState.errorReceipt?.tone === "danger"
          ? WORKFLOW_WAIT_RESUME_ERROR_DANGER_TITLE_CLASS
          : WORKFLOW_WAIT_RESUME_ERROR_WARNING_TITLE_CLASS}
      >
        {props.panelState.errorReceipt?.title}
      </p>
      <p
        class={props.panelState.errorReceipt?.tone === "danger"
          ? WORKFLOW_WAIT_RESUME_ERROR_DANGER_SUMMARY_CLASS
          : WORKFLOW_WAIT_RESUME_ERROR_WARNING_SUMMARY_CLASS}
      >
        {props.panelState.errorReceipt?.summary}
      </p>
      <p
        class={props.panelState.errorReceipt?.tone === "danger"
          ? WORKFLOW_WAIT_RESUME_ERROR_DANGER_NEXT_STEP_CLASS
          : WORKFLOW_WAIT_RESUME_ERROR_WARNING_NEXT_STEP_CLASS}
      >
        {props.panelState.errorReceipt?.nextStep}
      </p>
      <Show when={props.panelState.showRetryAction}>
        <button
          type="button"
          class={props.panelState.errorReceipt?.tone === "danger"
            ? WORKFLOW_WAIT_RESUME_RETRY_DANGER_CLASS
            : WORKFLOW_WAIT_RESUME_RETRY_WARNING_CLASS}
          onClick={() => props.onRetry?.()}
        >
          Retry wait chain
        </button>
      </Show>
    </div>
  );
}

function WorkflowWaitResumeEmptySection() {
  return (
    <p class="mt-3 text-sm text-sky-800">
      This run has not recorded any durable wait / resume checkpoints yet.
    </p>
  );
}

function WorkflowWaitResumeRecordsSection(props: {
  onFocusNode: (nodeId: string) => void;
  panelState: WorkflowRunWaitResumePanelState;
}) {
  return (
    <div class="mt-4 space-y-3">
      <For each={props.panelState.recordItems}>
        {(item) => (
          <div class="rounded-[18px] border border-sky-200/70 bg-white/85 p-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <For each={item.primaryBadges}>
                    {(badge) => <span class={badge.className}>{badge.label}</span>}
                  </For>
                </div>
                <p class="mt-2 text-sm font-semibold text-sky-950">{item.sourceText}</p>
                <Show when={item.showWaitReason}>
                  <p class="mt-1 text-sm text-sky-900">{item.record.waitReason}</p>
                </Show>
                <Show when={item.showDecisionLabel}>
                  <p class="mt-1 text-sm text-sky-900">{item.record.decisionLabel}</p>
                </Show>
                <Show when={item.showDecisionConsequence}>
                  <p class="mt-1 text-sm text-sky-900">{item.record.decisionConsequence}</p>
                </Show>
                <Show when={item.showDecisionNote}>
                  <p class="mt-1 text-sm text-sky-900">Note: {item.record.decisionNote}</p>
                </Show>
                <Show when={item.showFamilyBadges}>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <For each={item.familyBadges}>
                      {(badge) => <span class={badge.className}>{badge.label}</span>}
                    </For>
                  </div>
                </Show>
              </div>
              <Show when={item.showFocusNodeAction}>
                <button
                  type="button"
                  class={WORKFLOW_WAIT_RESUME_FOCUS_BUTTON_CLASS}
                  onClick={() => item.focusNodeId && props.onFocusNode(item.focusNodeId)}
                >
                  Focus node
                </button>
              </Show>
            </div>
            <Show when={item.showMetadataBadges}>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={item.metadataBadges}>
                  {(badge) => <span class={badge.className}>{badge.label}</span>}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

export function WorkflowRunWaitResumePanel(props: WorkflowRunWaitResumePanelProps) {
  const panelState = createMemo(() => workflowRunWaitResumePanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [<WorkflowWaitResumeHeaderSection panelState={state} />];

    if (state.decisionState) {
      sections.push(<WorkflowWaitResumeDecisionSection decisionState={state.decisionState} />);
    }

    if (state.showLoadingState) {
      sections.push(<WorkflowWaitResumeLoadingSection />);
    }

    if (state.showErrorState) {
      sections.push(<WorkflowWaitResumeErrorSection onRetry={props.onRetry} panelState={state} />);
    }

    if (state.showEmptyState) {
      sections.push(<WorkflowWaitResumeEmptySection />);
    }

    if (state.showRecordItems) {
      sections.push(
        <WorkflowWaitResumeRecordsSection
          onFocusNode={props.onFocusNode}
          panelState={state}
        />,
      );
    }

    return sections;
  });

  return (
    <div class="mt-4 rounded-[20px] border border-sky-200/70 bg-sky-50/70 p-4">
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
