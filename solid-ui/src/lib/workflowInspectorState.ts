// @locs-version: 1.0
import type { SavedWorkflow, WorkflowRun } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import { normalizeGraph } from "@/lib/workflowGraphDraftState";
import { formatDurationMs } from "@/lib/workflowLiveRunState";

export type InspectorSummaryRow = {
  label: string;
  value: string;
};

export type InspectorMetricCard = {
  label: string;
  value: string;
};

export type WorkflowsInspectorState = {
  metricCards: InspectorMetricCard[];
  runStatus: string;
  runSummaryRows: InspectorSummaryRow[];
  showRunSummary: boolean;
  workflowDescription: string;
  workflowName: string;
};

export type WorkflowsInspectorSectionId = "header" | "metrics" | "run-summary";

export type WorkflowsInspectorPresentationClasses = {
  description: string;
  eyebrow: string;
  header: string;
  metricCard: string;
  metricLabel: string;
  metricValue: string;
  metricsGrid: string;
  shell: string;
  statusCard: string;
  statusLabel: string;
  statusValue: string;
  summaryCard: string;
  summaryGrid: string;
  summaryLabel: string;
  summaryPanel: string;
  summaryRowLabel: string;
  summaryRowValue: string;
  title: string;
};

export type WorkflowsInspectorViewState = {
  classes: WorkflowsInspectorPresentationClasses;
  sections: WorkflowsInspectorSectionId[];
  state: WorkflowsInspectorState;
};

export const WORKFLOWS_INSPECTOR_SHELL_CLASS =
  "glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel";

export const WORKFLOWS_INSPECTOR_HEADER_CLASS = "flex flex-wrap items-start justify-between gap-3";

export const WORKFLOWS_INSPECTOR_EYEBROW_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-outline";

export const WORKFLOWS_INSPECTOR_TITLE_CLASS = "mt-1 text-lg font-semibold text-on-surface";

export const WORKFLOWS_INSPECTOR_DESCRIPTION_CLASS = "mt-2 text-sm text-on-surface-variant";

export const WORKFLOWS_INSPECTOR_STATUS_CARD_CLASS =
  "rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-right";

export const WORKFLOWS_INSPECTOR_STATUS_LABEL_CLASS =
  "text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70";

export const WORKFLOWS_INSPECTOR_STATUS_VALUE_CLASS = "mt-1 text-sm font-medium text-on-surface";

export const WORKFLOWS_INSPECTOR_METRICS_GRID_CLASS = "mt-4 grid gap-3 md:grid-cols-3";

export const WORKFLOWS_INSPECTOR_METRIC_CARD_CLASS =
  "rounded-2xl border border-white/15 bg-white/8 px-4 py-3";

export const WORKFLOWS_INSPECTOR_METRIC_LABEL_CLASS =
  "text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70";

export const WORKFLOWS_INSPECTOR_METRIC_VALUE_CLASS = "mt-1 text-base font-semibold text-on-surface";

export const WORKFLOWS_INSPECTOR_SUMMARY_PANEL_CLASS =
  "mt-4 rounded-2xl border border-white/15 bg-white/8 px-4 py-3";

export const WORKFLOWS_INSPECTOR_SUMMARY_LABEL_CLASS =
  "text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70";

export const WORKFLOWS_INSPECTOR_SUMMARY_GRID_CLASS = "mt-3 grid gap-2 md:grid-cols-2";

export const WORKFLOWS_INSPECTOR_SUMMARY_CARD_CLASS =
  "rounded-xl border border-white/10 bg-white/6 px-3 py-2";

export const WORKFLOWS_INSPECTOR_SUMMARY_ROW_LABEL_CLASS =
  "text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/65";

export const WORKFLOWS_INSPECTOR_SUMMARY_ROW_VALUE_CLASS = "mt-1 text-sm text-on-surface";

export const WORKFLOWS_INSPECTOR_CLASSES: WorkflowsInspectorPresentationClasses = {
  description: WORKFLOWS_INSPECTOR_DESCRIPTION_CLASS,
  eyebrow: WORKFLOWS_INSPECTOR_EYEBROW_CLASS,
  header: WORKFLOWS_INSPECTOR_HEADER_CLASS,
  metricCard: WORKFLOWS_INSPECTOR_METRIC_CARD_CLASS,
  metricLabel: WORKFLOWS_INSPECTOR_METRIC_LABEL_CLASS,
  metricValue: WORKFLOWS_INSPECTOR_METRIC_VALUE_CLASS,
  metricsGrid: WORKFLOWS_INSPECTOR_METRICS_GRID_CLASS,
  shell: WORKFLOWS_INSPECTOR_SHELL_CLASS,
  statusCard: WORKFLOWS_INSPECTOR_STATUS_CARD_CLASS,
  statusLabel: WORKFLOWS_INSPECTOR_STATUS_LABEL_CLASS,
  statusValue: WORKFLOWS_INSPECTOR_STATUS_VALUE_CLASS,
  summaryCard: WORKFLOWS_INSPECTOR_SUMMARY_CARD_CLASS,
  summaryGrid: WORKFLOWS_INSPECTOR_SUMMARY_GRID_CLASS,
  summaryLabel: WORKFLOWS_INSPECTOR_SUMMARY_LABEL_CLASS,
  summaryPanel: WORKFLOWS_INSPECTOR_SUMMARY_PANEL_CLASS,
  summaryRowLabel: WORKFLOWS_INSPECTOR_SUMMARY_ROW_LABEL_CLASS,
  summaryRowValue: WORKFLOWS_INSPECTOR_SUMMARY_ROW_VALUE_CLASS,
  title: WORKFLOWS_INSPECTOR_TITLE_CLASS,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isSavedWorkflow(value: unknown): value is SavedWorkflow {
  const record = asRecord(value);
  return Boolean(
    record &&
    typeof record.workflow_id === "string" &&
    typeof record.title === "string" &&
    asRecord(record.graph),
  );
}

export function isWorkflowRun(value: unknown): value is WorkflowRun {
  const record = asRecord(value);
  return Boolean(
    record &&
    typeof record.run_id === "string" &&
    typeof record.workflow_id === "string" &&
    typeof record.status === "string",
  );
}

export function workflowsInspectorState(
  workflow: unknown,
  selectedRun: unknown,
): WorkflowsInspectorState {
  const savedWorkflow = isSavedWorkflow(workflow) ? workflow : null;
  const selectedWorkflowRun = isWorkflowRun(selectedRun) ? selectedRun : null;
  const graph = savedWorkflow ? normalizeGraph(savedWorkflow) : null;
  const selectedRunResult = asRecord(selectedWorkflowRun?.result);

  const workflowName =
    asString(graph?.title) ||
    asString(savedWorkflow?.title) ||
    asString(savedWorkflow?.workflow_id) ||
    "Workflow";

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const runStatus = selectedWorkflowRun?.status || "No run selected";
  const workflowLoaded = savedWorkflow ? "Loaded" : "Unavailable";
  const durationLabel =
    formatDurationMs(selectedRunResult?.duration_ms) ||
    formatDurationMs(selectedRunResult?.durationMs);

  const runSummaryRows: InspectorSummaryRow[] = selectedWorkflowRun
    ? [
        { label: "Run ID", value: selectedWorkflowRun.run_id },
        { label: "Started", value: selectedWorkflowRun.started_at || "Unknown" },
        { label: "Duration", value: durationLabel || "Unknown" },
        { label: "Timeline steps", value: String(asArray(selectedWorkflowRun.timeline).length) },
      ]
    : [];

  return {
    metricCards: [
      { label: "Nodes", value: String(nodeCount) },
      { label: "Edges", value: String(edgeCount) },
      { label: "Active workflow", value: workflowLoaded },
    ],
    runStatus,
    runSummaryRows,
    showRunSummary: runSummaryRows.length > 0,
    workflowDescription:
      graph?.description || savedWorkflow?.description || "Inspect the selected workflow and latest run context.",
    workflowName,
  };
}

export function workflowsInspectorVisibleSections(
  state: Pick<WorkflowsInspectorState, "showRunSummary">,
): WorkflowsInspectorSectionId[] {
  const sections: WorkflowsInspectorSectionId[] = ["header", "metrics"];
  if (state.showRunSummary) {
    sections.push("run-summary");
  }
  return sections;
}

export function workflowsInspectorViewState(
  workflow: unknown,
  selectedRun: unknown,
): WorkflowsInspectorViewState {
  const state = workflowsInspectorState(workflow, selectedRun);
  return {
    classes: WORKFLOWS_INSPECTOR_CLASSES,
    sections: workflowsInspectorVisibleSections(state),
    state,
  };
}
