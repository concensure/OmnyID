// @locs-version: 1.0
import { createMemo, For, Show, type JSXElement } from "solid-js";

import { formatTimelineStamp } from "@/lib/workflowRunAnalysis";
import type { LiveRunStreamEvent } from "@/lib/workflowReviewTypes";

type LiveRunStreamEventEntry = Pick<
  LiveRunStreamEvent,
  | "event"
  | "graph_node_kind"
  | "index"
  | "label"
  | "node_id"
  | "outcome_checkpoint"
  | "phase"
  | "reason"
  | "runtime_kind"
  | "ts"
>;

type WorkflowRunLiveExecutionPanelProps = {
  connected: boolean;
  preview: LiveRunStreamEventEntry[];
};

type WorkflowLiveExecutionBadge = {
  className: string;
  label: string;
};

type WorkflowLiveExecutionEntryState = {
  detailBadges: WorkflowLiveExecutionBadge[];
  eventBadges: WorkflowLiveExecutionBadge[];
  labelText: string;
  reasonText: string | null;
};

type WorkflowRunLiveExecutionPanelState = {
  entries: WorkflowLiveExecutionEntryState[];
  showEntries: boolean;
  statusBadge: WorkflowLiveExecutionBadge;
};

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

function workflowLiveExecutionEntryState(
  entry: LiveRunStreamEventEntry,
): WorkflowLiveExecutionEntryState {
  return {
    detailBadges: [
      ...(entry.runtime_kind ? [{ className: WORKFLOW_LIVE_EXECUTION_DETAIL_BADGE_CLASS, label: String(entry.runtime_kind) }] : []),
      ...(entry.graph_node_kind ? [{ className: WORKFLOW_LIVE_EXECUTION_DETAIL_BADGE_CLASS, label: String(entry.graph_node_kind) }] : []),
      ...(entry.ts ? [{ className: WORKFLOW_LIVE_EXECUTION_DETAIL_BADGE_CLASS, label: formatTimelineStamp(entry.ts) ?? entry.ts }] : []),
    ],
    eventBadges: [
      { className: WORKFLOW_LIVE_EXECUTION_EVENT_BADGE_CLASS, label: entry.event.replaceAll("_", " ") },
      ...(entry.phase
        ? [{ className: WORKFLOW_LIVE_EXECUTION_PHASE_BADGE_CLASS, label: entry.phase.replaceAll("_", " ") }]
        : []),
      ...(entry.outcome_checkpoint
        ? [{ className: WORKFLOW_LIVE_EXECUTION_OUTCOME_BADGE_CLASS, label: entry.outcome_checkpoint.replaceAll("_", " ") }]
        : []),
      ...(typeof entry.index === "number"
        ? [{ className: WORKFLOW_LIVE_EXECUTION_STEP_BADGE_CLASS, label: `step ${(entry.index ?? 0) + 1}` }]
        : []),
    ],
    labelText: entry.label ?? entry.node_id ?? entry.event.replaceAll("_", " "),
    reasonText: entry.reason ?? null,
  };
}

function workflowRunLiveExecutionPanelState(
  props: WorkflowRunLiveExecutionPanelProps,
): WorkflowRunLiveExecutionPanelState {
  return {
    entries: props.preview.map(workflowLiveExecutionEntryState),
    showEntries: props.preview.length > 0,
    statusBadge: props.connected
      ? { className: WORKFLOW_LIVE_EXECUTION_CONNECTED_BADGE_CLASS, label: "connected" }
      : { className: WORKFLOW_LIVE_EXECUTION_REPLAYING_BADGE_CLASS, label: "replaying" },
  };
}

function WorkflowLiveExecutionHeaderSection(props: {
  panelState: WorkflowRunLiveExecutionPanelState;
}) {
  return (
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Live execution</p>
        <p class="mt-1 text-sm text-sky-900">
          Streaming run events from the workflow runtime. Persisted timeline detail remains below.
        </p>
      </div>
      <span class={props.panelState.statusBadge.className}>
        {props.panelState.statusBadge.label}
      </span>
    </div>
  );
}

function WorkflowLiveExecutionEntriesSection(props: {
  panelState: WorkflowRunLiveExecutionPanelState;
}) {
  return (
    <div class="mt-4 space-y-2">
      <For each={props.panelState.entries}>
        {(entry) => (
          <div class="rounded-2xl border border-white/70 bg-white/85 px-3 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <For each={entry.eventBadges}>
                {(badge) => <span class={badge.className}>{badge.label}</span>}
              </For>
            </div>
            <p class="mt-2 text-sm font-semibold text-sky-950">{entry.labelText}</p>
            <Show when={entry.reasonText}>
              <p class="mt-1 text-sm text-sky-900">{entry.reasonText}</p>
            </Show>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={entry.detailBadges}>
                {(badge) => <span class={badge.className}>{badge.label}</span>}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export function WorkflowRunLiveExecutionPanel(props: WorkflowRunLiveExecutionPanelProps) {
  const panelState = createMemo(() => workflowRunLiveExecutionPanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [<WorkflowLiveExecutionHeaderSection panelState={state} />];

    if (state.showEntries) {
      sections.push(<WorkflowLiveExecutionEntriesSection panelState={state} />);
    }

    return sections;
  });

  return (
    <div class="mt-4 rounded-[20px] border border-sky-200/70 bg-sky-50/70 p-4">
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
