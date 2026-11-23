// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import type { JSXElement } from "solid-js";

import { useWorkflowsCtx } from "@/components/graph";
import type { SavedWorkflow, WorkflowRun } from "@/lib/api";
import {
  workflowsInspectorViewState,
  type WorkflowsInspectorPresentationClasses,
  type WorkflowsInspectorSectionId,
  type WorkflowsInspectorState,
  type WorkflowsInspectorViewState,
} from "@/lib/workflowInspectorState";

type WorkflowsInspectorContext = {
  currentWorkflow: () => SavedWorkflow | null;
  selectedRun: () => WorkflowRun | null;
};

function WorkflowsInspectorHeaderSection(props: {
  classes: WorkflowsInspectorPresentationClasses;
  state: WorkflowsInspectorState;
}): JSXElement {
  return (
    <div class={props.classes.header}>
      <div>
        <p class={props.classes.eyebrow}>Workflow Inspector</p>
        <h2 class={props.classes.title}>{props.state.workflowName}</h2>
        <p class={props.classes.description}>{props.state.workflowDescription}</p>
      </div>

      <div class={props.classes.statusCard}>
        <p class={props.classes.statusLabel}>Selected run</p>
        <p class={props.classes.statusValue}>{props.state.runStatus}</p>
      </div>
    </div>
  );
}

function WorkflowsInspectorMetricsSection(props: {
  classes: WorkflowsInspectorPresentationClasses;
  state: WorkflowsInspectorState;
}): JSXElement {
  return (
    <div class={props.classes.metricsGrid}>
      <For each={props.state.metricCards}>
        {(card) => (
          <div class={props.classes.metricCard}>
            <p class={props.classes.metricLabel}>{card.label}</p>
            <p class={props.classes.metricValue}>{card.value}</p>
          </div>
        )}
      </For>
    </div>
  );
}

function WorkflowsInspectorRunSummarySection(props: {
  classes: WorkflowsInspectorPresentationClasses;
  state: WorkflowsInspectorState;
}): JSXElement {
  return (
    <div class={props.classes.summaryPanel}>
      <p class={props.classes.summaryLabel}>Run summary</p>
      <div class={props.classes.summaryGrid}>
        <For each={props.state.runSummaryRows}>
          {(row) => (
            <div class={props.classes.summaryCard}>
              <p class={props.classes.summaryRowLabel}>{row.label}</p>
              <p class={props.classes.summaryRowValue}>{row.value}</p>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export function WorkflowsInspector() {
  const ctx = useWorkflowsCtx<WorkflowsInspectorContext>();

  const inspectorViewState = createMemo<WorkflowsInspectorViewState>(() =>
    workflowsInspectorViewState(ctx.currentWorkflow(), ctx.selectedRun()),
  );

  const visibleSections = createMemo<WorkflowsInspectorSectionId[]>(() => {
    return inspectorViewState().sections;
  });

  return (
    <section class={inspectorViewState().classes.shell}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const { classes, state } = inspectorViewState();
          if (sectionId === "header") {
            return <WorkflowsInspectorHeaderSection classes={classes} state={state} />;
          }
          if (sectionId === "metrics") {
            return <WorkflowsInspectorMetricsSection classes={classes} state={state} />;
          }
          return <WorkflowsInspectorRunSummarySection classes={classes} state={state} />;
        }}
      </For>
    </section>
  );
}
