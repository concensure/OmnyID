// @locs-version: 1.0
import { createMemo, For, Show, type JSXElement } from "solid-js";

type ExecutionLogEntry = {
  detailLines: string[];
  index: number;
  phase: string;
  text: string;
  title: string;
  toneClass: string;
};

type WorkflowRunExecutionLogPanelProps = {
  phaseCounts: Array<[string, number]>;
  preview: ExecutionLogEntry[];
  totalCount: number;
};

type WorkflowExecutionPhaseBadge = {
  label: string;
};

type WorkflowExecutionLogItem = {
  detailLines: string[];
  indexLabel: string;
  phaseLabel: string;
  text: string;
  titleText: string;
  toneClassName: string;
};

type WorkflowRunExecutionLogPanelState = {
  executionLogItems: WorkflowExecutionLogItem[];
  phaseBadges: WorkflowExecutionPhaseBadge[];
  showOverflowNotice: boolean;
};

const WORKFLOW_EXECUTION_PHASE_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_EXECUTION_LOG_INDEX_BADGE_CLASS =
  "rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_EXECUTION_LOG_PHASE_BADGE_CLASS =
  "rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";

function workflowRunExecutionLogPanelState(
  props: WorkflowRunExecutionLogPanelProps,
): WorkflowRunExecutionLogPanelState {
  return {
    executionLogItems: props.preview.map((entry) => ({
      detailLines: entry.detailLines,
      indexLabel: String(entry.index),
      phaseLabel: entry.phase.replaceAll("_", " "),
      text: entry.text,
      titleText: entry.title,
      toneClassName: entry.toneClass,
    })),
    phaseBadges: props.phaseCounts.map((entry) => ({
      label: `${entry[0].replaceAll("_", " ")} ${entry[1]}`,
    })),
    showOverflowNotice: props.totalCount > props.preview.length,
  };
}

function WorkflowExecutionLogHeaderSection(props: {
  panelState: WorkflowRunExecutionLogPanelState;
}) {
  return (
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Execution log</p>
        <p class="mt-1 text-sm text-violet-900">
          Compact phase-oriented trace for this run. Use the full timeline below for detailed events.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <For each={props.panelState.phaseBadges}>
          {(entry) => <span class={WORKFLOW_EXECUTION_PHASE_BADGE_CLASS}>{entry.label}</span>}
        </For>
      </div>
    </div>
  );
}

function WorkflowExecutionLogEntriesSection(props: {
  panelState: WorkflowRunExecutionLogPanelState;
}) {
  return (
    <div class="mt-4 grid gap-3 lg:grid-cols-2">
      <For each={props.panelState.executionLogItems}>
        {(entry) => (
          <div class={`rounded-2xl border px-3 py-3 ${entry.toneClassName}`}>
            <div class="flex flex-wrap items-center gap-2">
              <span class={WORKFLOW_EXECUTION_LOG_INDEX_BADGE_CLASS}>{entry.indexLabel}</span>
              <span class={WORKFLOW_EXECUTION_LOG_PHASE_BADGE_CLASS}>{entry.phaseLabel}</span>
            </div>
            <p class="mt-2 text-sm font-semibold">{entry.titleText}</p>
            <p class="mt-1 text-sm">{entry.text}</p>
            <Show when={entry.detailLines.length > 0}>
              <div class="mt-2 space-y-1">
                <For each={entry.detailLines}>
                  {(line) => <p class="text-xs font-medium text-violet-900/80">{line}</p>}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

export function WorkflowRunExecutionLogPanel(props: WorkflowRunExecutionLogPanelProps) {
  const panelState = createMemo(() => workflowRunExecutionLogPanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [
      <WorkflowExecutionLogHeaderSection panelState={state} />,
      <WorkflowExecutionLogEntriesSection panelState={state} />,
    ];

    if (state.showOverflowNotice) {
      sections.push(
        <p class="mt-3 text-xs text-violet-700/80">
          Showing {props.preview.length} of {props.totalCount} execution log entries.
        </p>,
      );
    }

    return sections;
  });

  return (
    <div class="mt-4 rounded-[20px] border border-violet-200/70 bg-white/80 p-4">
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
