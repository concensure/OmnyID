import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionReportScopeTaskItems } from "../src/lib/weddingDecisionReportScopeTaskState.ts";
import type { WeddingDecisionReportScopeState } from "../src/lib/weddingDecisionReportScopeState.ts";
import { buildWeddingTaskHierarchyState } from "../src/lib/weddingTaskHierarchyState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function scope(input: Partial<WeddingDecisionReportScopeState> = {}): WeddingDecisionReportScopeState {
  return {
    status: "scoped_needs_recheck",
    selectedOptionId: "0:harbour-house",
    selectedOptionLabel: "Harbour House",
    collapseAlternatives: true,
    includeAlternativesAsAudit: true,
    reportInstructionLabel: "Use Harbour House as tentative scope, but resolve freshness blockers first.",
    blockerLabels: [
      "Selected option price/package evidence needs recheck.",
      "Selected option date-specific availability needs recheck.",
    ],
    auditContextLabels: ["Freshness: source current, price needs_recheck, availability missing"],
    nextActionLabels: ["Refresh source, price, and availability evidence before confident recommendations."],
    ...input,
  };
}

test("buildWeddingDecisionReportScopeTaskItems creates a review task for scoped decision blockers", () => {
  const tasks = buildWeddingDecisionReportScopeTaskItems({
    metadata,
    scope: scope(),
    artifactId: "artifact:venue-shortlist",
    artifactTitle: "Venue shortlist",
  });

  assert.equal(tasks.length, 1);
  assert.match(tasks[0]?.title ?? "", /Resolve selected wedding option blockers/i);
  assert.equal(tasks[0]?.kind, "vendor_follow_up");
  assert.equal(tasks[0]?.priority, "high");
  assert.equal(tasks[0]?.reviewStatus, "needs_review");
  assert.equal(tasks[0]?.linkedArtifactId, "artifact:venue-shortlist");
  const taskMetadata = tasks[0]?.metadata as Record<string, unknown>;
  assert.equal(taskMetadata.decision_report_scope_task, true);
  assert.equal(taskMetadata.second_order_loop, "budget_drift");
  assert.match(tasks[0]?.notes ?? "", /Refresh source, price, and availability/i);
});

test("buildWeddingDecisionReportScopeTaskItems creates a low-priority scoping task when decision is ready", () => {
  const tasks = buildWeddingDecisionReportScopeTaskItems({
    metadata,
    scope: scope({
      status: "scoped_ready",
      blockerLabels: [],
      reportInstructionLabel: "Use Harbour House as the primary scope for follow-up reports.",
      nextActionLabels: ["Generate follow-up reports from the selected option first."],
    }),
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "decision");
  assert.equal(tasks[0]?.priority, "low");
  assert.equal(tasks[0]?.reviewStatus, "accepted");
  assert.match(tasks[0]?.dueLabel ?? "", /next narrowed report/i);
});

test("buildWeddingDecisionReportScopeTaskItems redacts imported artifact titles in task metadata", () => {
  const redactedScope = scope({
    status: "scoped_ready",
    blockerLabels: [],
    reportInstructionLabel: "Use Harbour House as the primary scope for follow-up reports from Imported private planning file.",
    auditContextLabels: ["Source artifact: Imported private planning file"],
    nextActionLabels: ["Generate follow-up reports from the selected option first."],
  });
  const tasks = buildWeddingDecisionReportScopeTaskItems({
    metadata,
    scope: redactedScope,
    artifactId: "wedding_import:vendor_table:workspace:venues-xlsx",
    artifactTitle: "Imported XLSX: venues.xlsx",
  });
  const taskMetadata = tasks[0]?.metadata as Record<string, unknown>;
  const selectedScope = taskMetadata.selected_decision_scope as Record<string, unknown>;
  const serialized = JSON.stringify(tasks);

  assert.equal(selectedScope.artifact_title, "Imported private planning file");
  assert.equal(selectedScope.selected_option_label, "Harbour House");
  assert.equal(serialized.includes("venues.xlsx"), false);
});

test("buildWeddingDecisionReportScopeTaskItems suppresses no-selection and duplicate scope tasks", () => {
  const noSelection = buildWeddingDecisionReportScopeTaskItems({
    metadata,
    scope: scope({ status: "no_selection", selectedOptionId: null, selectedOptionLabel: null }),
  });
  assert.deepEqual(noSelection, []);

  const existing = buildWeddingDecisionReportScopeTaskItems({ metadata, scope: scope() });
  const repeated = buildWeddingDecisionReportScopeTaskItems({
    metadata,
    scope: scope(),
    existingTaskItems: existing,
  });

  assert.deepEqual(repeated, []);
});

test("decision report-scope tasks render in the existing wedding task hierarchy", () => {
  const tasks = buildWeddingDecisionReportScopeTaskItems({
    metadata,
    scope: scope(),
    artifactId: "artifact:venue-shortlist",
    artifactTitle: "Venue shortlist",
  });
  const hierarchy = buildWeddingTaskHierarchyState(tasks.map((task) => ({
    task_id: `afp-${task.id}`,
    title: task.title,
    status: "pending",
    priority: task.priority ?? "normal",
    due_label: task.dueLabel ?? undefined,
    wedding_task_kind: task.kind,
    second_order_loop: (task.metadata as Record<string, unknown>).second_order_loop as string,
    second_order_evidence_labels: (task.metadata as Record<string, unknown>).second_order_evidence_labels as string[],
  })));

  assert.equal(hierarchy.hasWeddingTasks, true);
  assert.equal(hierarchy.stages[0]?.id, "anytime");
  assert.equal(hierarchy.stages[0]?.items[0]?.loopLabel, "Budget drift loop");
  assert.ok(hierarchy.stages[0]?.items[0]?.evidenceLabels.includes("Selected option: Harbour House"));
});
