import test from "node:test";
import assert from "node:assert/strict";

import type { SavedWorkflow, WorkflowRun } from "../src/lib/api.ts";
import {
  WORKFLOWS_INSPECTOR_HEADER_CLASS,
  WORKFLOWS_INSPECTOR_CLASSES,
  WORKFLOWS_INSPECTOR_METRIC_CARD_CLASS,
  WORKFLOWS_INSPECTOR_METRICS_GRID_CLASS,
  WORKFLOWS_INSPECTOR_SHELL_CLASS,
  WORKFLOWS_INSPECTOR_STATUS_CARD_CLASS,
  WORKFLOWS_INSPECTOR_SUMMARY_PANEL_CLASS,
  WORKFLOWS_INSPECTOR_SUMMARY_ROW_VALUE_CLASS,
  isSavedWorkflow,
  isWorkflowRun,
  workflowsInspectorVisibleSections,
  workflowsInspectorState,
  workflowsInspectorViewState,
} from "../src/lib/workflowInspectorState.ts";

function savedWorkflow(overrides: Partial<SavedWorkflow> = {}): SavedWorkflow {
  return {
    workflow_id: "wf-1",
    owner_user_id: "user-1",
    title: "Stored title",
    description: "Stored description",
    favorite: false,
    preset_kinds: [],
    graph: {
      workflow_id: "wf-1",
      title: "Graph title",
      description: "Graph description",
      nodes: [
        { id: "node-1", kind: "trigger", label: "Start", position: { x: 0, y: 0 } },
        { id: "node-2", kind: "agent", label: "Agent", position: { x: 100, y: 0 } },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
    },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    run_id: "run-1",
    workflow_id: "wf-1",
    deployment_id: "dep-1",
    owner_user_id: "user-1",
    status: "succeeded",
    trigger_kind: "manual",
    timeline: [{ node_id: "node-1" }, { node_id: "node-2" }],
    result: { duration_ms: 1250 },
    started_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("workflow inspector state summarizes workflow and selected run", () => {
  const state = workflowsInspectorState(savedWorkflow(), workflowRun());

  assert.equal(state.workflowName, "Graph title");
  assert.equal(state.workflowDescription, "Graph description");
  assert.deepEqual(state.metricCards, [
    { label: "Nodes", value: "2" },
    { label: "Edges", value: "1" },
    { label: "Active workflow", value: "Loaded" },
  ]);
  assert.equal(state.runStatus, "succeeded");
  assert.equal(state.showRunSummary, true);
  assert.deepEqual(state.runSummaryRows, [
    { label: "Run ID", value: "run-1" },
    { label: "Started", value: "2026-01-01T00:00:00.000Z" },
    { label: "Duration", value: "1.3 s" },
    { label: "Timeline steps", value: "2" },
  ]);
});

test("workflow inspector state falls back defensively for malformed inputs", () => {
  const state = workflowsInspectorState({ workflow_id: "partial" }, { run_id: "partial" });

  assert.equal(state.workflowName, "Workflow");
  assert.equal(state.workflowDescription, "Inspect the selected workflow and latest run context.");
  assert.deepEqual(state.metricCards, [
    { label: "Nodes", value: "0" },
    { label: "Edges", value: "0" },
    { label: "Active workflow", value: "Unavailable" },
  ]);
  assert.equal(state.runStatus, "No run selected");
  assert.equal(state.showRunSummary, false);
  assert.deepEqual(state.runSummaryRows, []);
});

test("workflow inspector guards require minimum workflow and run shape", () => {
  assert.equal(isSavedWorkflow(savedWorkflow()), true);
  assert.equal(isSavedWorkflow({ workflow_id: "wf-1", title: "Missing graph" }), false);
  assert.equal(isWorkflowRun(workflowRun()), true);
  assert.equal(isWorkflowRun({ run_id: "run-1", workflow_id: "wf-1" }), false);
});

test("workflow inspector visible sections include run summary only when needed", () => {
  assert.deepEqual(workflowsInspectorVisibleSections({ showRunSummary: false }), ["header", "metrics"]);
  assert.deepEqual(workflowsInspectorVisibleSections({ showRunSummary: true }), [
    "header",
    "metrics",
    "run-summary",
  ]);
});

test("workflow inspector view state bundles classes and section order", () => {
  const withoutRun = workflowsInspectorViewState(savedWorkflow(), null);
  assert.equal(withoutRun.classes, WORKFLOWS_INSPECTOR_CLASSES);
  assert.equal(withoutRun.classes.shell, WORKFLOWS_INSPECTOR_SHELL_CLASS);
  assert.deepEqual(withoutRun.sections, ["header", "metrics"]);
  assert.equal(withoutRun.state.workflowName, "Graph title");

  const withRun = workflowsInspectorViewState(savedWorkflow(), workflowRun());
  assert.deepEqual(withRun.sections, ["header", "metrics", "run-summary"]);
  assert.equal(withRun.state.showRunSummary, true);
});

test("workflow inspector presentation classes stay stable", () => {
  assert.match(WORKFLOWS_INSPECTOR_SHELL_CLASS, /glass-surface/);
  assert.match(WORKFLOWS_INSPECTOR_HEADER_CLASS, /justify-between/);
  assert.match(WORKFLOWS_INSPECTOR_STATUS_CARD_CLASS, /text-right/);
  assert.match(WORKFLOWS_INSPECTOR_METRICS_GRID_CLASS, /md:grid-cols-3/);
  assert.match(WORKFLOWS_INSPECTOR_METRIC_CARD_CLASS, /rounded-2xl/);
  assert.match(WORKFLOWS_INSPECTOR_SUMMARY_PANEL_CLASS, /mt-4/);
  assert.match(WORKFLOWS_INSPECTOR_SUMMARY_ROW_VALUE_CLASS, /text-on-surface/);
});
