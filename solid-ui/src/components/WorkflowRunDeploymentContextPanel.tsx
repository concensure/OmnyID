import { createMemo, For, Show, type JSXElement } from "solid-js";

export type WorkflowRunDeploymentContextEntry = {
  highlighted: boolean;
  nodeId: string;
  nodeLabel: string;
  summary: string;
};

type WorkflowRunDeploymentContextPanelProps = {
  comparedDeploymentId: string | null;
  currentDeploymentId: string;
  deploymentEntries: WorkflowRunDeploymentContextEntry[];
  deploymentNodeChangesCount: number | null;
  onFocusDeploymentEntry: (nodeId: string) => void;
  onFocusReplayEntry: (nodeId: string) => void;
  onReviewDeploymentSteps: () => void;
  onReviewReplaySteps: () => void;
  replayChangedNodeCount: number | null;
  replayDeploymentId: string | null;
  replayEntries: WorkflowRunDeploymentContextEntry[];
  replayOfRunId: string | null;
  replayUsesSameDeployment: boolean;
  reviewDeploymentStepCount: number;
  reviewReplayStepCount: number;
  reviewingDeploymentSteps: boolean;
  reviewingReplaySteps: boolean;
};

type WorkflowDeploymentBadge = {
  className: string;
  label: string;
};

type WorkflowDeploymentAction = {
  className: string;
  label: string;
  onClick: () => void;
};

type WorkflowDeploymentEntryState = {
  className: string;
  nodeId: string;
  nodeLabel: string;
  onClick: () => void;
  summary: string;
};

type WorkflowReplayBadge = {
  className: string;
  label: string;
};

type WorkflowRunDeploymentContextPanelState = {
  deploymentActions: WorkflowDeploymentAction[];
  deploymentBadges: WorkflowDeploymentBadge[];
  deploymentEntries: WorkflowDeploymentEntryState[];
  replayActions: WorkflowDeploymentAction[];
  replayBadge: WorkflowReplayBadge;
  replayEntries: WorkflowDeploymentEntryState[];
  replaySummaryText: string;
  showDeploymentEntries: boolean;
  showReplayComparison: boolean;
  showReplayEntries: boolean;
};

const WORKFLOW_DEPLOYMENT_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const WORKFLOW_DEPLOYMENT_COMPARISON_BADGE_CLASS =
  "rounded-full border border-white/50 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant";
const WORKFLOW_DEPLOYMENT_ACTION_CLASS =
  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition";
const WORKFLOW_DEPLOYMENT_ACTION_ACTIVE_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-sky-300 bg-sky-100 text-sky-800`;
const WORKFLOW_DEPLOYMENT_ACTION_IDLE_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-sky-200/70 bg-white/85 text-sky-700 hover:bg-white`;
const WORKFLOW_REPLAY_ACTION_ACTIVE_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-amber-300 bg-amber-100 text-amber-800`;
const WORKFLOW_REPLAY_ACTION_IDLE_CLASS =
  `${WORKFLOW_DEPLOYMENT_ACTION_CLASS} border-amber-200/70 bg-white/80 text-amber-700 hover:bg-white`;
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

function deploymentEntryState(
  entry: WorkflowRunDeploymentContextEntry,
  tone: "deployment" | "replay",
  onClick: (nodeId: string) => void,
): WorkflowDeploymentEntryState {
  return {
    className:
      tone === "deployment"
        ? `${WORKFLOW_DEPLOYMENT_ENTRY_CLASS} ${entry.highlighted ? WORKFLOW_DEPLOYMENT_ENTRY_SELECTED_CLASS : ""}`
        : `${WORKFLOW_REPLAY_ENTRY_CLASS} ${entry.highlighted ? WORKFLOW_REPLAY_ENTRY_SELECTED_CLASS : ""}`,
    nodeId: entry.nodeId,
    nodeLabel: entry.nodeLabel,
    onClick: () => onClick(entry.nodeId),
    summary: entry.summary,
  };
}

function workflowRunDeploymentContextPanelState(
  props: WorkflowRunDeploymentContextPanelProps,
): WorkflowRunDeploymentContextPanelState {
  return {
    deploymentActions: props.reviewDeploymentStepCount > 0
      ? [{
        className: props.reviewingDeploymentSteps
          ? WORKFLOW_DEPLOYMENT_ACTION_ACTIVE_CLASS
          : WORKFLOW_DEPLOYMENT_ACTION_IDLE_CLASS,
        label: `review ${props.reviewDeploymentStepCount} deployment step${props.reviewDeploymentStepCount === 1 ? "" : "s"}`,
        onClick: props.onReviewDeploymentSteps,
      }]
      : [],
    deploymentBadges: [
      {
        className: WORKFLOW_DEPLOYMENT_BADGE_CLASS,
        label: props.currentDeploymentId,
      },
      ...(props.deploymentNodeChangesCount !== null
        ? [{
          className: WORKFLOW_DEPLOYMENT_BADGE_CLASS,
          label: `${props.deploymentNodeChangesCount ?? 0} node changes`,
        }]
        : []),
      ...(props.comparedDeploymentId
        ? [{
          className: WORKFLOW_DEPLOYMENT_COMPARISON_BADGE_CLASS,
          label: `vs ${props.comparedDeploymentId}`,
        }]
        : []),
    ],
    deploymentEntries: props.deploymentEntries.map((entry) =>
      deploymentEntryState(entry, "deployment", props.onFocusDeploymentEntry)),
    replayActions: props.reviewReplayStepCount > 0
      ? [{
        className: props.reviewingReplaySteps
          ? WORKFLOW_REPLAY_ACTION_ACTIVE_CLASS
          : WORKFLOW_REPLAY_ACTION_IDLE_CLASS,
        label: `review ${props.reviewReplayStepCount} drifted step${props.reviewReplayStepCount === 1 ? "" : "s"}`,
        onClick: props.onReviewReplaySteps,
      }]
      : [],
    replayBadge:
      props.replayChangedNodeCount !== null || !props.replayUsesSameDeployment
        ? {
          className: WORKFLOW_REPLAY_DIFF_BADGE_CLASS,
          label: `${props.replayChangedNodeCount ?? props.replayEntries.length} policy differences`,
        }
        : {
          className: WORKFLOW_REPLAY_SAME_DEPLOYMENT_BADGE_CLASS,
          label: "Same deployment",
        },
    replayEntries: props.replayEntries.map((entry) =>
      deploymentEntryState(entry, "replay", props.onFocusReplayEntry)),
    replaySummaryText: `This replay references run ${props.replayOfRunId} and executed on ${props.replayDeploymentId ?? props.currentDeploymentId}.`,
    showDeploymentEntries: props.deploymentEntries.length > 0,
    showReplayComparison: Boolean(props.replayOfRunId),
    showReplayEntries:
      (props.replayChangedNodeCount !== null || !props.replayUsesSameDeployment)
      && props.replayEntries.length > 0,
  };
}

function WorkflowDeploymentSummarySection(props: {
  panelState: WorkflowRunDeploymentContextPanelState;
}) {
  return (
    <>
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
          Deployment context
        </p>
        <For each={props.panelState.deploymentBadges}>
          {(badge) => <span class={badge.className}>{badge.label}</span>}
        </For>
        <For each={props.panelState.deploymentActions}>
          {(action) => (
            <button type="button" class={action.className} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </For>
      </div>
      <Show when={props.panelState.showDeploymentEntries}>
        <div class="mt-3 space-y-2">
          <For each={props.panelState.deploymentEntries}>
            {(entry) => (
              <button type="button" class={entry.className} onClick={entry.onClick}>
                <p class="text-sm font-semibold text-sky-900">{entry.nodeLabel}</p>
                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-700">
                  {entry.summary}
                </p>
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

function WorkflowReplayDeploymentSection(props: {
  panelState: WorkflowRunDeploymentContextPanelState;
}) {
  return (
    <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          Replay deployment comparison
        </p>
        <span class={props.panelState.replayBadge.className}>
          {props.panelState.replayBadge.label}
        </span>
        <For each={props.panelState.replayActions}>
          {(action) => (
            <button type="button" class={action.className} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </For>
      </div>
      <p class="mt-1 text-sm text-amber-900">{props.panelState.replaySummaryText}</p>
      <Show when={props.panelState.showReplayEntries}>
        <div class="mt-3 space-y-2">
          <For each={props.panelState.replayEntries}>
            {(entry) => (
              <button type="button" class={entry.className} onClick={entry.onClick}>
                <p class="text-sm font-semibold text-amber-900">{entry.nodeLabel}</p>
                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700">
                  {entry.summary}
                </p>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function WorkflowRunDeploymentContextPanel(
  props: WorkflowRunDeploymentContextPanelProps,
) {
  const panelState = createMemo(() => workflowRunDeploymentContextPanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [<WorkflowDeploymentSummarySection panelState={state} />];

    if (state.showReplayComparison) {
      sections.push(<WorkflowReplayDeploymentSection panelState={state} />);
    }

    return sections;
  });

  return (
    <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 p-4">
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
