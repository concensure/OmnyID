// @locs-version: 1.0
import { createMemo, For } from "solid-js";
import type { JSXElement } from "solid-js";

type WorkflowRunTimelineStatsPanelProps = {
  completedNodeCount: number;
  durationLabel: string | null;
  focusedTimelineNodeLabel: string | null;
  nodeDeltaCount: number;
  onClearFocusedNode: () => void;
  onClearTimelineFilter: () => void;
  onStartReplay: () => void;
  queuedNodeCount: number;
  replayActive: boolean;
  replayStepIndex: number;
  simulatedNodeCount: number;
  skippedNodeCount: number;
  timelineFilterSummaryLabel: string;
  timelineHasFilter: boolean;
  timelineLength: number;
  waitingNodeCount: number;
};

type WorkflowTimelineStatsBadge = {
  className: string;
  key: string;
  label: string;
};

type WorkflowTimelineStatsAction = {
  className: string;
  disabled?: boolean;
  key: string;
  label: string;
  onClick: () => void;
  title?: string;
};

type WorkflowRunTimelineStatsPanelState = {
  actionItems: WorkflowTimelineStatsAction[];
  badgeItems: WorkflowTimelineStatsBadge[];
  showActions: boolean;
  showBadges: boolean;
};

type WorkflowRunTimelineStatsSectionId = "badges" | "actions";

const WORKFLOW_TIMELINE_PANEL_CLASS = "mt-3 flex min-w-0 flex-wrap gap-2";
const WORKFLOW_TIMELINE_COUNT_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700";
const WORKFLOW_TIMELINE_NODE_DELTA_BADGE_CLASS =
  "max-w-full break-words rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700";
const WORKFLOW_TIMELINE_DURATION_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700";
const WORKFLOW_TIMELINE_COMPLETED_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700";
const WORKFLOW_TIMELINE_SIMULATED_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700";
const WORKFLOW_TIMELINE_WAITING_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700";
const WORKFLOW_TIMELINE_QUEUED_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700";
const WORKFLOW_TIMELINE_SKIPPED_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600";
const WORKFLOW_TIMELINE_FILTER_ACTION_CLASS =
  "max-w-full break-words rounded-full border border-violet-200/70 bg-violet-100/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800 transition hover:bg-violet-100 sm:py-1";
const WORKFLOW_TIMELINE_NODE_ACTION_CLASS =
  "max-w-full break-words rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800 transition hover:bg-sky-100 sm:py-1";
const WORKFLOW_TIMELINE_REPLAY_ACTION_CLASS =
  "max-w-full break-words rounded-full border border-fuchsia-200/70 bg-fuchsia-50/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700 transition hover:bg-fuchsia-100 disabled:opacity-40 sm:py-1";

function workflowRunTimelineStatsPanelState(
  props: WorkflowRunTimelineStatsPanelProps,
): WorkflowRunTimelineStatsPanelState {
  const actionItems: WorkflowTimelineStatsAction[] = [
    ...(props.timelineHasFilter
      ? [{
        className: WORKFLOW_TIMELINE_FILTER_ACTION_CLASS,
        key: "filter",
        label: `viewing ${props.timelineFilterSummaryLabel}`,
        onClick: props.onClearTimelineFilter,
      }]
      : []),
    ...(props.focusedTimelineNodeLabel
      ? [{
        className: WORKFLOW_TIMELINE_NODE_ACTION_CLASS,
        key: "focused_node",
        label: `node ${props.focusedTimelineNodeLabel}`,
        onClick: props.onClearFocusedNode,
      }]
      : []),
    ...(props.timelineLength > 0
      ? [{
        className: WORKFLOW_TIMELINE_REPLAY_ACTION_CLASS,
        disabled: props.replayActive,
        key: "replay",
        label: props.replayActive
          ? `step ${props.replayStepIndex + 1}/${props.timelineLength}`
          : "Trace replay",
        onClick: props.onStartReplay,
        title: "Step through this run's execution trace on the canvas",
      }]
      : []),
  ];

  const badgeItems: WorkflowTimelineStatsBadge[] = [
    {
      className: WORKFLOW_TIMELINE_COUNT_BADGE_CLASS,
      key: "step_count",
      label: `${props.timelineLength} steps`,
    },
    ...(props.nodeDeltaCount > 0
      ? [{
        className: WORKFLOW_TIMELINE_NODE_DELTA_BADGE_CLASS,
        key: "node_delta",
        label: `${props.nodeDeltaCount} node delta${props.nodeDeltaCount === 1 ? "" : "s"}`,
      }]
      : []),
    ...(props.durationLabel
      ? [{
        className: WORKFLOW_TIMELINE_DURATION_BADGE_CLASS,
        key: "duration",
        label: props.durationLabel,
      }]
      : []),
    ...(props.completedNodeCount > 0
      ? [{
        className: WORKFLOW_TIMELINE_COMPLETED_BADGE_CLASS,
        key: "completed",
        label: `${props.completedNodeCount} completed`,
      }]
      : []),
    ...(props.simulatedNodeCount > 0
      ? [{
        className: WORKFLOW_TIMELINE_SIMULATED_BADGE_CLASS,
        key: "simulated",
        label: `${props.simulatedNodeCount} simulated`,
      }]
      : []),
    ...(props.waitingNodeCount > 0
      ? [{
        className: WORKFLOW_TIMELINE_WAITING_BADGE_CLASS,
        key: "waiting",
        label: `${props.waitingNodeCount} waiting`,
      }]
      : []),
    ...(props.queuedNodeCount > 0
      ? [{
        className: WORKFLOW_TIMELINE_QUEUED_BADGE_CLASS,
        key: "queued",
        label: `${props.queuedNodeCount} queued`,
      }]
      : []),
    ...(props.skippedNodeCount > 0
      ? [{
        className: WORKFLOW_TIMELINE_SKIPPED_BADGE_CLASS,
        key: "skipped",
        label: `${props.skippedNodeCount} skipped`,
      }]
      : []),
  ];

  return {
    actionItems,
    badgeItems,
    showActions: actionItems.length > 0,
    showBadges: badgeItems.length > 0,
  };
}

function WorkflowTimelineStatsBadgeSection(props: {
  badgeItems: WorkflowTimelineStatsBadge[];
}): JSXElement {
  return (
    <>
      <For each={props.badgeItems}>
        {(badge) => <span class={badge.className}>{badge.label}</span>}
      </For>
    </>
  );
}

function WorkflowTimelineStatsActionSection(props: {
  actionItems: WorkflowTimelineStatsAction[];
}): JSXElement {
  return (
    <>
      <For each={props.actionItems}>
        {(item) => (
          <button
            type="button"
            class={item.className}
            disabled={item.disabled}
            onClick={item.onClick}
            title={item.title}
          >
            {item.label}
          </button>
        )}
      </For>
    </>
  );
}

export function WorkflowRunTimelineStatsPanel(props: WorkflowRunTimelineStatsPanelProps) {
  const panelState = createMemo(() => workflowRunTimelineStatsPanelState(props));

  const visibleSections = createMemo<WorkflowRunTimelineStatsSectionId[]>(() => {
    const state = panelState();
    const sections: WorkflowRunTimelineStatsSectionId[] = [];
    if (state.showBadges) {
      sections.push("badges");
    }
    if (state.showActions) {
      sections.push("actions");
    }
    return sections;
  });

  return (
    <div class={WORKFLOW_TIMELINE_PANEL_CLASS}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = panelState();
          if (sectionId === "badges") {
            return <WorkflowTimelineStatsBadgeSection badgeItems={state.badgeItems} />;
          }
          if (sectionId === "actions") {
            return <WorkflowTimelineStatsActionSection actionItems={state.actionItems} />;
          }
          return null;
        }}
      </For>
    </div>
  );
}
