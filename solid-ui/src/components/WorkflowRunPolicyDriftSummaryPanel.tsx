// @locs-version: 1.0
import { createMemo, For } from "solid-js";
import type { JSXElement } from "solid-js";

type WorkflowRunPolicyDriftSummaryPanelProps = {
  deploymentEdgeDeltaCount: number;
  deploymentNodeDeltaCount: number;
  onReviewDeployment: () => void;
  onReviewReplay: () => void;
  replayEdgeDeltaCount: number;
  replayNodeDeltaCount: number;
  totalEdgeDeltaCount: number;
  totalNodeDeltaCount: number;
};

type WorkflowPolicyDriftAction = {
  className: string;
  label: string;
  onClick: () => void;
};

type WorkflowRunPolicyDriftSummaryPanelState = {
  actionItems: WorkflowPolicyDriftAction[];
  summaryText: string;
};

type WorkflowRunPolicyDriftSectionId = "header" | "summary";

const WORKFLOW_POLICY_DRIFT_DEPLOYMENT_ACTION_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white";
const WORKFLOW_POLICY_DRIFT_REPLAY_ACTION_CLASS =
  "rounded-full border border-amber-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 transition hover:bg-white";
const WORKFLOW_POLICY_DRIFT_PANEL_CLASS = "mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 p-3";
const WORKFLOW_POLICY_DRIFT_HEADER_CLASS = "flex flex-wrap items-center gap-2";
const WORKFLOW_POLICY_DRIFT_TITLE_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-sky-700";
const WORKFLOW_POLICY_DRIFT_SUMMARY_CLASS = "mt-2 text-sm text-sky-900";

function workflowRunPolicyDriftSummaryPanelState(
  props: WorkflowRunPolicyDriftSummaryPanelProps,
): WorkflowRunPolicyDriftSummaryPanelState {
  const totalMarkers = props.totalNodeDeltaCount + props.totalEdgeDeltaCount;
  return {
    actionItems: [
      ...(props.deploymentNodeDeltaCount > 0 || props.deploymentEdgeDeltaCount > 0
        ? [{
          className: WORKFLOW_POLICY_DRIFT_DEPLOYMENT_ACTION_CLASS,
          label: `deployment ${props.deploymentNodeDeltaCount} node${props.deploymentNodeDeltaCount === 1 ? "" : "s"} | ${props.deploymentEdgeDeltaCount} edge${props.deploymentEdgeDeltaCount === 1 ? "" : "s"}`,
          onClick: props.onReviewDeployment,
        }]
        : []),
      ...(props.replayNodeDeltaCount > 0 || props.replayEdgeDeltaCount > 0
        ? [{
          className: WORKFLOW_POLICY_DRIFT_REPLAY_ACTION_CLASS,
          label: `replay ${props.replayNodeDeltaCount} node${props.replayNodeDeltaCount === 1 ? "" : "s"} | ${props.replayEdgeDeltaCount} edge${props.replayEdgeDeltaCount === 1 ? "" : "s"}`,
          onClick: props.onReviewReplay,
        }]
        : []),
    ],
    summaryText: `This run shows ${props.totalNodeDeltaCount} node-level and ${props.totalEdgeDeltaCount} branch-level policy drift marker${totalMarkers === 1 ? "" : "s"} on the canvas.`,
  };
}

type WorkflowPolicyDriftHeaderSectionProps = {
  state: WorkflowRunPolicyDriftSummaryPanelState;
};

function WorkflowPolicyDriftHeaderSection(
  props: WorkflowPolicyDriftHeaderSectionProps,
): JSXElement {
  return (
    <div class={WORKFLOW_POLICY_DRIFT_HEADER_CLASS}>
      <p class={WORKFLOW_POLICY_DRIFT_TITLE_CLASS}>Policy drift summary</p>
      <For each={props.state.actionItems}>
        {(item) => (
          <button type="button" class={item.className} onClick={item.onClick}>
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}

type WorkflowPolicyDriftSummarySectionProps = {
  state: WorkflowRunPolicyDriftSummaryPanelState;
};

function WorkflowPolicyDriftSummarySection(
  props: WorkflowPolicyDriftSummarySectionProps,
): JSXElement {
  return <p class={WORKFLOW_POLICY_DRIFT_SUMMARY_CLASS}>{props.state.summaryText}</p>;
}

export function WorkflowRunPolicyDriftSummaryPanel(
  props: WorkflowRunPolicyDriftSummaryPanelProps,
) {
  const panelState = createMemo(() => workflowRunPolicyDriftSummaryPanelState(props));

  const visibleSections = createMemo<WorkflowRunPolicyDriftSectionId[]>(() => [
    "header",
    "summary",
  ]);

  return (
    <div class={WORKFLOW_POLICY_DRIFT_PANEL_CLASS}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = panelState();
          if (sectionId === "header") {
            return <WorkflowPolicyDriftHeaderSection state={state} />;
          }
          return <WorkflowPolicyDriftSummarySection state={state} />;
        }}
      </For>
    </div>
  );
}
