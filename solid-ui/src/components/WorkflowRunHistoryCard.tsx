// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSXElement } from "solid-js";

import type { WorkflowRun } from "@/lib/api";
import {
  surfaceDateTimeLabel,
  surfaceRelativeTimestamp,
} from "@/lib/surfaceTimestampPresentation";
import { workflowApprovalPanelSummaryState } from "@/lib/workflowApprovalPanelState";
import {
  workflowHistoryPauseResumeLabel,
  workflowHistoryReplayDiffDetailText,
  workflowHistoryReplayDriftLabel,
  workflowHistoryStartedText,
} from "@/lib/workflowHistoryCopy";

type DriftSummary = {
  deploymentEdgeCount: number;
  deploymentNodeCount: number;
  edgeEntries: Array<unknown>;
  nodeEntries: Array<unknown>;
  replayEdgeCount: number;
  replayNodeCount: number;
};

type WaitChainSummary = {
  pauseCount: number;
  resumeCount: number;
};

type DeploymentEntry = {
  nodeId: string;
  summary: string;
};

type ReplayDiffChange = {
  current?: string | null;
  field: string;
  next?: string | null;
};

type ReplayDiffEntry = {
  changes: ReplayDiffChange[];
  nodeId: string;
};

type WorkflowRunHistoryCardProps = {
  activeReplayDeploymentId: string | null;
  approvalDecisionConsequence: string | null;
  approvalDecisionLabel: string | null;
  approvalDecisionNote: string | null;
  busy: boolean;
  deploymentNodeChangesCount: number;
  durationLabel: string | null;
  explanationChipClass?: string | null;
  explanationChipLabel?: string | null;
  firstDeploymentEntry: DeploymentEntry | null;
  firstDeploymentEntryLabel: string | null;
  onCancelReplay: () => void;
  onConfirmReplay: () => void;
  onFocusReplayDiff: (nodeId: string) => void;
  onSelectRun: () => void;
  onToggleReplayPreview: () => void;
  queuedNodeCount: number;
  replayDeploymentDiff: ReplayDiffEntry[];
  replayPreviewSelected: boolean;
  replayUsesSameDeployment: boolean;
  run: WorkflowRun;
  runDriftSummary: DriftSummary;
  runStatusChipClass: string;
  runStatusClass: string;
  statusSummary: string | null;
  summaryText: string;
  timelineCount: number;
  triggerChipClass: string;
  triggerKind: string;
  waitChain: WaitChainSummary;
  waitingNodeCount: number;
};

type HistoryBadgeItem = {
  className: string;
  label: string;
  title?: string;
};

type HistoryStatItem = {
  className: string;
  label: string;
  title?: string;
};

type ReplayDiffItem = {
  detailText: string;
  nodeId: string;
};

type WorkflowRunHistoryCardState = {
  approvalSummary: {
    detailLines: string[];
    showSection: boolean;
  };
  deploymentSummary: {
    detailText: string | null;
    showSection: boolean;
  };
  durationPillClass: string | null;
  hasWaitChain: boolean;
  headerBadgeItems: HistoryBadgeItem[];
  replayCostEstimate: string | null;
  replayState: {
    actionDeploymentId: string | null;
    canShowDiffSummary: boolean;
    diffItems: ReplayDiffItem[];
    driftSummaryText: string | null;
    emptyText: string;
    overflowText: string | null;
    sameDeployment: boolean;
    selected: boolean;
  };
  startedAtRelativeText: string | null;
  statsRowItems: HistoryStatItem[];
  statusSummary: string | null;
  summaryText: string;
  topBadgeItems: HistoryBadgeItem[];
  triggerText: string;
};

type WorkflowRunHistorySectionId = "header" | "summary" | "replay";

const WORKFLOW_HISTORY_CARD_HEADER_CLASS = "flex items-start justify-between gap-3";
const WORKFLOW_HISTORY_CARD_SELECTABLE_CLASS = "flex-1 text-left";
const WORKFLOW_HISTORY_RUN_ID_ROW_CLASS = "flex items-center gap-[0.5em]";
const WORKFLOW_HISTORY_RUN_ID_CLASS = "text-sm font-semibold text-on-surface cursor-pointer";
const WORKFLOW_HISTORY_TINY_ACTION_CLASS =
  "font-mono text-[0.6em] text-on-surface-variant/30 transition hover:text-on-surface-variant/70";
const WORKFLOW_HISTORY_TRIGGER_ROW_CLASS = "flex items-center gap-1.5 flex-wrap";
const WORKFLOW_HISTORY_STATUS_TEXT_CLASS = "text-[10px] uppercase tracking-[0.16em] text-on-surface-variant";
const WORKFLOW_HISTORY_TIME_TEXT_CLASS = "font-mono text-[0.55em] text-on-surface-variant/50";
const WORKFLOW_HISTORY_REPLAY_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60";
const WORKFLOW_HISTORY_TOP_BADGE_ROW_CLASS = "flex flex-wrap gap-2";
const WORKFLOW_HISTORY_STATUS_SUMMARY_CLASS = "mt-2 text-xs font-medium text-on-surface";
const WORKFLOW_HISTORY_APPROVAL_PANEL_CLASS = "mt-2 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3 py-2";
const WORKFLOW_HISTORY_DEPLOYMENT_PANEL_CLASS = "mt-2 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-2";
const WORKFLOW_HISTORY_DEPLOYMENT_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const WORKFLOW_HISTORY_SUMMARY_TEXT_CLASS = "mt-2 text-xs text-on-surface-variant";
const WORKFLOW_HISTORY_DRIFT_TEXT_CLASS = "mt-1 text-[11px] text-sky-900";
const WORKFLOW_HISTORY_STATS_ROW_CLASS = "mt-1 flex flex-wrap items-center gap-[0.4em]";
const WORKFLOW_HISTORY_STARTED_ROW_CLASS = "inline-flex items-center gap-[0.25em]";
const WORKFLOW_HISTORY_STARTED_TEXT_CLASS = "text-[0.7em] text-on-surface-variant/40";
const WORKFLOW_HISTORY_STARTED_ACTION_CLASS =
  "font-mono text-[0.55em] text-on-surface-variant/20 transition hover:text-on-surface-variant/60";
const WORKFLOW_HISTORY_REPLAY_PANEL_CLASS = "mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3";
const WORKFLOW_HISTORY_REPLAY_TITLE_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-amber-700";
const WORKFLOW_HISTORY_REPLAY_TEXT_CLASS = "mt-1 text-sm text-amber-900";
const WORKFLOW_HISTORY_REPLAY_DRIFT_TEXT_CLASS = "mt-2 text-xs text-amber-800";
const WORKFLOW_HISTORY_REPLAY_DIFF_LIST_CLASS = "mt-3 space-y-2";
const WORKFLOW_HISTORY_REPLAY_DIFF_BUTTON_CLASS =
  "w-full rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2 text-left transition hover:bg-white";
const WORKFLOW_HISTORY_REPLAY_DIFF_TITLE_CLASS = "text-sm font-semibold text-amber-900";
const WORKFLOW_HISTORY_REPLAY_DIFF_TEXT_CLASS = "mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700";
const WORKFLOW_HISTORY_REPLAY_ACTION_ROW_CLASS = "mt-3 flex flex-wrap items-center gap-2";
const WORKFLOW_HISTORY_CONFIRM_REPLAY_CLASS =
  "rounded-full border border-violet-300/70 bg-violet-500 px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const WORKFLOW_HISTORY_REPLAY_COST_CLASS = "font-mono text-[10px] text-amber-700/60";
const WORKFLOW_HISTORY_REPLAY_COST_FALLBACK_CLASS = "font-mono text-[10px] text-on-surface-variant/30";
const WORKFLOW_HISTORY_CANCEL_REPLAY_CLASS =
  "rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60";

function triggerIcon(kind: string): string {
  const lowerKind = kind.toLowerCase();
  if (lowerKind === "cron" || lowerKind.includes("schedule")) return "SCH";
  if (lowerKind === "webhook" || lowerKind === "api" || lowerKind.includes("http")) return "API";
  return ">";
}

function parseDurationSecs(label: string | null): number | null {
  if (!label) return null;
  let total = 0;
  const hourMatch = label.match(/(\d+)h/);
  const minuteMatch = label.match(/(\d+)m/);
  const secondMatch = label.match(/(\d+)s/);
  if (hourMatch) total += Number.parseInt(hourMatch[1], 10) * 3600;
  if (minuteMatch) total += Number.parseInt(minuteMatch[1], 10) * 60;
  if (secondMatch) total += Number.parseInt(secondMatch[1], 10);
  return hourMatch || minuteMatch || secondMatch ? total : null;
}

function durationPillClass(durationLabel: string | null): string | null {
  const durationSeconds = parseDurationSecs(durationLabel);
  if (durationSeconds === null) return null;
  if (durationSeconds < 30) return "bg-green-100 text-green-700";
  if (durationSeconds < 120) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function replayCostEstimate(durationLabel: string | null): string | null {
  const durationSeconds = parseDurationSecs(durationLabel);
  if (durationSeconds === null) return null;
  const replayCostPerSecond = 0.0001;
  return `$${(durationSeconds * replayCostPerSecond).toFixed(4)}`;
}

function workflowRunHistoryCardState(props: WorkflowRunHistoryCardProps): WorkflowRunHistoryCardState {
  const hasWaitChain = props.waitChain.pauseCount > 0 || props.waitChain.resumeCount > 0;
  const isMultiPause =
    props.waitChain.pauseCount > 1 ||
    (props.waitChain.pauseCount >= 1 && props.waitChain.resumeCount >= 1);
  const topBadgeItems: HistoryBadgeItem[] = [
    {
      className: `rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${props.triggerChipClass}`,
      label: `${triggerIcon(props.triggerKind)} ${props.triggerKind}`,
    },
  ];
  if (props.run.started_at) {
    topBadgeItems.push({
      className: WORKFLOW_HISTORY_TIME_TEXT_CLASS,
      label: surfaceRelativeTimestamp(props.run.started_at),
    });
  }

  const headerBadgeItems: HistoryBadgeItem[] = [
    {
      className: `rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${props.runStatusChipClass}`,
      label: props.run.status.replaceAll("_", " "),
    },
  ];
  if (props.explanationChipLabel && props.explanationChipClass) {
    headerBadgeItems.push({
      className: `rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${props.explanationChipClass}`,
      label: props.explanationChipLabel,
    });
  }
  if (props.run.replay_of_run_id) {
    headerBadgeItems.push({
      className:
        "rounded-full border border-amber-200/70 bg-amber-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700",
      label: "replay source",
      title: `Replay of ${props.run.replay_of_run_id}`,
    });
  }
  if (props.runDriftSummary.nodeEntries.length > 0 || props.runDriftSummary.edgeEntries.length > 0) {
    headerBadgeItems.push({
      className:
        "rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700",
      label: `${props.runDriftSummary.nodeEntries.length} node delta${props.runDriftSummary.nodeEntries.length === 1 ? "" : "s"}`,
    });
    headerBadgeItems.push({
      className:
        "rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700",
      label: `${props.runDriftSummary.edgeEntries.length} edge delta${props.runDriftSummary.edgeEntries.length === 1 ? "" : "s"}`,
    });
  }
  if (props.waitingNodeCount > 0) {
    headerBadgeItems.push({
      className: "rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700",
      label: `${props.waitingNodeCount} waiting`,
    });
  }
  if (props.queuedNodeCount > 0) {
    headerBadgeItems.push({
      className: "rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700",
      label: `${props.queuedNodeCount} queued`,
    });
  }
  if (hasWaitChain) {
    headerBadgeItems.push({
      className: `rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
        isMultiPause
          ? "border-violet-200/70 bg-violet-50/85 text-violet-700"
          : "border-sky-200/70 bg-sky-50/85 text-sky-700"
      }`,
      label: workflowHistoryPauseResumeLabel(
        props.waitChain.pauseCount,
        props.waitChain.resumeCount,
      ),
    });
  }

  const stepStats = Array.isArray(props.run.timeline) && props.run.timeline.length >= 2
    ? {
        ok: props.run.timeline.filter((step) => typeof step.status !== "string" || step.status !== "failed").length,
        total: props.run.timeline.length,
      }
    : null;

  const statsRowItems: HistoryStatItem[] = [
    {
      className:
        "rounded-full bg-on-surface/8 px-[0.6em] py-[0.2em] font-mono text-[0.7em] text-on-surface-variant",
      label: `${props.timelineCount} steps`,
    },
  ];
  if (stepStats) {
    statsRowItems.push({
      className: `font-mono text-[0.65em] ${
        stepStats.ok < stepStats.total ? "text-rose-600/70" : "text-emerald-600/60"
      }`,
      label: `${stepStats.ok}/${stepStats.total} ok`,
      title: `${stepStats.ok} of ${stepStats.total} steps completed without failure`,
    });
  }
  if (props.durationLabel) {
    statsRowItems.push({
      className: `rounded-full px-[0.6em] py-[0.15em] font-mono text-[0.65em] font-semibold ${
        durationPillClass(props.durationLabel) ?? "bg-on-surface/8 text-on-surface-variant/60"
      }`,
      label: props.durationLabel,
    });
  }
  if (hasWaitChain) {
    statsRowItems.push({
      className: "text-[0.7em] text-on-surface-variant/60",
      label: workflowHistoryPauseResumeLabel(
        props.waitChain.pauseCount,
        props.waitChain.resumeCount,
      ),
    });
  }

  return {
    approvalSummary: {
      ...workflowApprovalPanelSummaryState({
        approvalDecisionLabel: props.approvalDecisionLabel,
        approvalDecisionConsequence: props.approvalDecisionConsequence,
        approvalDecisionNote: props.approvalDecisionNote,
      }),
    },
    deploymentSummary: {
      detailText: props.firstDeploymentEntry
        ? `${props.firstDeploymentEntryLabel ?? props.firstDeploymentEntry.nodeId}: ${props.firstDeploymentEntry.summary}`
        : null,
      showSection: props.deploymentNodeChangesCount > 0,
    },
    durationPillClass: durationPillClass(props.durationLabel),
    hasWaitChain,
    headerBadgeItems,
    replayCostEstimate: replayCostEstimate(props.durationLabel),
    replayState: {
      actionDeploymentId: props.activeReplayDeploymentId,
      canShowDiffSummary: !props.replayUsesSameDeployment,
      diffItems: props.replayDeploymentDiff.slice(0, 3).map((diffEntry) => ({
        detailText: workflowHistoryReplayDiffDetailText(diffEntry.changes),
        nodeId: diffEntry.nodeId,
      })),
      driftSummaryText:
        props.runDriftSummary.replayNodeCount > 0 || props.runDriftSummary.replayEdgeCount > 0
          ? `Current run carried ${props.runDriftSummary.nodeEntries.length} node-level and ${props.runDriftSummary.edgeEntries.length} branch-level drift marker${
              props.runDriftSummary.nodeEntries.length + props.runDriftSummary.edgeEntries.length === 1 ? "" : "s"
            }.`
          : null,
      emptyText:
        "Deployment context is unavailable for this run, so replay will use the latest active snapshot.",
      overflowText:
        props.replayDeploymentDiff.length > 3
          ? `${props.replayDeploymentDiff.length - 3} more deployment differences would affect this replay.`
          : null,
      sameDeployment: props.replayUsesSameDeployment,
      selected: props.replayPreviewSelected,
    },
    startedAtRelativeText: props.run.started_at ? surfaceRelativeTimestamp(props.run.started_at) : null,
    statsRowItems,
    statusSummary: props.statusSummary,
    summaryText: props.summaryText,
    topBadgeItems,
    triggerText: props.run.started_at
      ? workflowHistoryStartedText(
          surfaceRelativeTimestamp(props.run.started_at),
          surfaceDateTimeLabel(props.run.started_at),
        )
      : "",
  };
}

type ActionKeyHandler = (event: KeyboardEvent, action: () => void) => void;

type WorkflowRunHistoryHeaderSectionProps = {
  activateOnEnterOrSpace: ActionKeyHandler;
  busy: boolean;
  copyLink: (event: MouseEvent) => void;
  copyRunId: (event: MouseEvent) => void;
  linkCopied: boolean;
  onSelectRun: () => void;
  onToggleReplayPreview: () => void;
  replayPreviewSelected: boolean;
  run: WorkflowRun;
  runIdCopied: boolean;
  runIdExpanded: boolean;
  setRunIdExpanded: (value: boolean | ((value: boolean) => boolean)) => void;
  state: WorkflowRunHistoryCardState;
};

function WorkflowRunHistoryHeaderSection(props: WorkflowRunHistoryHeaderSectionProps): JSXElement {
  return (
    <div class={WORKFLOW_HISTORY_CARD_HEADER_CLASS}>
      <div
        role="button"
        tabindex={0}
        class={WORKFLOW_HISTORY_CARD_SELECTABLE_CLASS}
        onClick={props.onSelectRun}
        onKeyDown={(event) => props.activateOnEnterOrSpace(event, props.onSelectRun)}
      >
        <div class="space-y-1">
          <div class={WORKFLOW_HISTORY_RUN_ID_ROW_CLASS}>
            <p
              class={WORKFLOW_HISTORY_RUN_ID_CLASS}
              title={props.runIdExpanded ? "Click to collapse" : `${props.run.run_id} - click to expand`}
              onClick={(event) => {
                event.stopPropagation();
                props.setRunIdExpanded((value) => !value);
              }}
            >
              {props.runIdExpanded
                ? props.run.run_id
                : props.run.run_id.length > 16
                  ? `${props.run.run_id.slice(0, 8)}...${props.run.run_id.slice(-4)}`
                  : props.run.run_id}
            </p>
            <button type="button" title="Copy full run ID" onClick={props.copyRunId} class={WORKFLOW_HISTORY_TINY_ACTION_CLASS}>
              {props.runIdCopied ? "OK" : "Copy"}
            </button>
            <button type="button" title="Copy link to this run" onClick={props.copyLink} class={WORKFLOW_HISTORY_TINY_ACTION_CLASS}>
              {props.linkCopied ? "Link copied" : "Copy link"}
            </button>
          </div>
          <div class={WORKFLOW_HISTORY_TRIGGER_ROW_CLASS}>
            <For each={props.state.topBadgeItems}>
              {(badge) => <span class={badge.className}>{badge.label}</span>}
            </For>
            <span class={WORKFLOW_HISTORY_STATUS_TEXT_CLASS}>{props.run.status}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        class={WORKFLOW_HISTORY_REPLAY_BUTTON_CLASS}
        disabled={props.busy}
        onClick={props.onToggleReplayPreview}
      >
        {props.replayPreviewSelected ? "Hide replay preview" : "Preview replay"}
      </button>
    </div>
  );
}

type WorkflowRunHistorySummarySectionProps = {
  activateOnEnterOrSpace: ActionKeyHandler;
  copyStartedAt: (event: MouseEvent) => void;
  deploymentNodeChangesCount: number;
  onSelectRun: () => void;
  runDriftSummary: DriftSummary;
  startedCopied: boolean;
  state: WorkflowRunHistoryCardState;
};

function WorkflowRunHistorySummarySection(props: WorkflowRunHistorySummarySectionProps): JSXElement {
  return (
    <div
      role="button"
      tabindex={0}
      class="mt-2 w-full text-left"
      onClick={props.onSelectRun}
      onKeyDown={(event) => props.activateOnEnterOrSpace(event, props.onSelectRun)}
    >
      <div class={WORKFLOW_HISTORY_TOP_BADGE_ROW_CLASS}>
        <For each={props.state.headerBadgeItems}>
          {(badge) => (
            <span class={badge.className} title={badge.title}>
              {badge.label}
            </span>
          )}
        </For>
      </div>
      <Show when={props.state.statusSummary}>
        {(summary) => <p class={WORKFLOW_HISTORY_STATUS_SUMMARY_CLASS}>{summary()}</p>}
      </Show>
      <Show when={props.state.approvalSummary.showSection}>
        <div class={WORKFLOW_HISTORY_APPROVAL_PANEL_CLASS}>
          <For each={props.state.approvalSummary.detailLines}>
            {(line, index) => (
              <p class={index() === 0
                ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700"
                : "mt-1 text-[11px] text-amber-900"}>
                {line}
              </p>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.deploymentSummary.showSection}>
        <div class={WORKFLOW_HISTORY_DEPLOYMENT_PANEL_CLASS}>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Deploy context</span>
            <span class={WORKFLOW_HISTORY_DEPLOYMENT_BADGE_CLASS}>
              {props.deploymentNodeChangesCount} node changes
            </span>
          </div>
          <Show when={props.state.deploymentSummary.detailText}>
            {(text) => <p class="mt-1 text-[11px] text-sky-900">{text()}</p>}
          </Show>
        </div>
      </Show>
      <p class={WORKFLOW_HISTORY_SUMMARY_TEXT_CLASS}>{props.state.summaryText}</p>
      <Show when={props.runDriftSummary.nodeEntries.length > 0 || props.runDriftSummary.edgeEntries.length > 0}>
        <p class={WORKFLOW_HISTORY_DRIFT_TEXT_CLASS}>
          Drift impact: {props.runDriftSummary.deploymentNodeCount + props.runDriftSummary.deploymentEdgeCount} deployment-linked and {props.runDriftSummary.replayNodeCount + props.runDriftSummary.replayEdgeCount} replay-linked markers.
        </p>
      </Show>
      <div class={WORKFLOW_HISTORY_STATS_ROW_CLASS}>
        <For each={props.state.statsRowItems}>
          {(item) => (
            <span class={item.className} title={item.title}>
              {item.label}
            </span>
          )}
        </For>
        <span class={WORKFLOW_HISTORY_STARTED_ROW_CLASS}>
          <span class={WORKFLOW_HISTORY_STARTED_TEXT_CLASS}>{props.state.triggerText}</span>
          <button type="button" title="Copy ISO timestamp" onClick={props.copyStartedAt} class={WORKFLOW_HISTORY_STARTED_ACTION_CLASS}>
            {props.startedCopied ? "OK" : "Copy"}
          </button>
        </span>
      </div>
    </div>
  );
}

type WorkflowRunHistoryReplaySectionProps = {
  busy: boolean;
  deploymentId: string | null;
  onCancelReplay: () => void;
  onConfirmReplay: () => void;
  onFocusReplayDiff: (nodeId: string) => void;
  replayDeploymentDiff: ReplayDiffEntry[];
  run: WorkflowRun;
  runDriftSummary: DriftSummary;
  state: WorkflowRunHistoryCardState;
};

function WorkflowRunHistoryReplaySection(props: WorkflowRunHistoryReplaySectionProps): JSXElement {
  return (
    <div class={WORKFLOW_HISTORY_REPLAY_PANEL_CLASS}>
      <div class="flex flex-wrap items-center gap-2">
        <p class={WORKFLOW_HISTORY_REPLAY_TITLE_CLASS}>Replay preview</p>
        <Show
          when={!props.state.replayState.sameDeployment}
          fallback={
            <span class="rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Same deployment
            </span>
          }
        >
          <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
            {props.replayDeploymentDiff.length} node policy differences
          </span>
        </Show>
        <Show when={props.runDriftSummary.replayNodeCount > 0 || props.runDriftSummary.replayEdgeCount > 0}>
          <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
            {workflowHistoryReplayDriftLabel(
              props.runDriftSummary.replayNodeCount,
              props.runDriftSummary.replayEdgeCount,
            )}
          </span>
        </Show>
      </div>
      <Show when={props.deploymentId} fallback={<p class={WORKFLOW_HISTORY_REPLAY_TEXT_CLASS}>{props.state.replayState.emptyText}</p>}>
        {(deploymentId) => (
          <>
            <p class={WORKFLOW_HISTORY_REPLAY_TEXT_CLASS}>
              Replay will run now on {deploymentId()}. Original run used {props.run.deployment_id}.
            </p>
            <Show when={props.state.replayState.driftSummaryText}>
              {(text) => <p class={WORKFLOW_HISTORY_REPLAY_DRIFT_TEXT_CLASS}>{text()}</p>}
            </Show>
            <Show when={props.state.replayState.canShowDiffSummary}>
              <div class={WORKFLOW_HISTORY_REPLAY_DIFF_LIST_CLASS}>
                <For each={props.state.replayState.diffItems}>
                  {(diffEntry) => (
                    <button
                      type="button"
                      class={WORKFLOW_HISTORY_REPLAY_DIFF_BUTTON_CLASS}
                      onClick={() => props.onFocusReplayDiff(diffEntry.nodeId)}
                    >
                      <p class={WORKFLOW_HISTORY_REPLAY_DIFF_TITLE_CLASS}>{diffEntry.nodeId}</p>
                      <p class={WORKFLOW_HISTORY_REPLAY_DIFF_TEXT_CLASS}>{diffEntry.detailText}</p>
                    </button>
                  )}
                </For>
                <Show when={props.state.replayState.overflowText}>
                  {(text) => <p class="text-xs text-amber-700/80">{text()}</p>}
                </Show>
              </div>
            </Show>
            <div class={WORKFLOW_HISTORY_REPLAY_ACTION_ROW_CLASS}>
              <button
                type="button"
                class={WORKFLOW_HISTORY_CONFIRM_REPLAY_CLASS}
                disabled={props.busy}
                onClick={props.onConfirmReplay}
              >
                Confirm replay
              </button>
              <Show
                when={props.state.replayCostEstimate}
                fallback={
                  <span
                    class={WORKFLOW_HISTORY_REPLAY_COST_FALLBACK_CLASS}
                    title="Run has no duration data - cost cannot be estimated"
                  >
                    cost unknown - no duration data
                  </span>
                }
              >
                {(cost) => (
                  <span class={WORKFLOW_HISTORY_REPLAY_COST_CLASS} title="Estimated cost based on last run duration">
                    ~{cost()} est.
                  </span>
                )}
              </Show>
              <button
                type="button"
                class={WORKFLOW_HISTORY_CANCEL_REPLAY_CLASS}
                disabled={props.busy}
                onClick={props.onCancelReplay}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}

export function WorkflowRunHistoryCard(props: WorkflowRunHistoryCardProps) {
  function activateOnEnterOrSpace(event: KeyboardEvent, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  const cardState = createMemo(() => workflowRunHistoryCardState(props));
  const [runIdExpanded, setRunIdExpanded] = createSignal(false);
  const [runIdCopied, setRunIdCopied] = createSignal(false);
  const [linkCopied, setLinkCopied] = createSignal(false);
  const [startedCopied, setStartedCopied] = createSignal(false);

  function copyRunId(event: MouseEvent) {
    event.stopPropagation();
    navigator.clipboard.writeText(props.run.run_id).then(() => {
      setRunIdCopied(true);
      setTimeout(() => setRunIdCopied(false), 1500);
    });
  }

  function copyLink(event: MouseEvent) {
    event.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}?run=${props.run.run_id}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  }

  function copyStartedAt(event: MouseEvent) {
    event.stopPropagation();
    navigator.clipboard.writeText(props.run.started_at).then(() => {
      setStartedCopied(true);
      setTimeout(() => setStartedCopied(false), 1500);
    });
  }

  const visibleSections = createMemo<WorkflowRunHistorySectionId[]>(() => {
    const sections: WorkflowRunHistorySectionId[] = ["header", "summary"];
    if (cardState().replayState.selected) {
      sections.push("replay");
    }
    return sections;
  });

  return (
    <div class={`w-full rounded-2xl border p-3 text-left ${props.runStatusClass}`}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = cardState();
          if (sectionId === "header") {
            return (
              <WorkflowRunHistoryHeaderSection
                activateOnEnterOrSpace={activateOnEnterOrSpace}
                busy={props.busy}
                copyLink={copyLink}
                copyRunId={copyRunId}
                linkCopied={linkCopied()}
                onSelectRun={props.onSelectRun}
                onToggleReplayPreview={props.onToggleReplayPreview}
                replayPreviewSelected={state.replayState.selected}
                run={props.run}
                runIdCopied={runIdCopied()}
                runIdExpanded={runIdExpanded()}
                setRunIdExpanded={setRunIdExpanded}
                state={state}
              />
            );
          }
          if (sectionId === "summary") {
            return (
              <WorkflowRunHistorySummarySection
                activateOnEnterOrSpace={activateOnEnterOrSpace}
                copyStartedAt={copyStartedAt}
                deploymentNodeChangesCount={props.deploymentNodeChangesCount}
                onSelectRun={props.onSelectRun}
                runDriftSummary={props.runDriftSummary}
                startedCopied={startedCopied()}
                state={state}
              />
            );
          }
          return (
            <WorkflowRunHistoryReplaySection
              busy={props.busy}
              deploymentId={state.replayState.actionDeploymentId}
              onCancelReplay={props.onCancelReplay}
              onConfirmReplay={props.onConfirmReplay}
              onFocusReplayDiff={props.onFocusReplayDiff}
              replayDeploymentDiff={props.replayDeploymentDiff}
              run={props.run}
              runDriftSummary={props.runDriftSummary}
              state={state}
            />
          );
        }}
      </For>
    </div>
  );
}


