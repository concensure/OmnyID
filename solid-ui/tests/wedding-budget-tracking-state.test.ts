import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingBudgetPaymentTaskItems,
  buildWeddingBudgetTrackingState,
} from "@/lib/weddingBudgetTrackingState";
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function decision(input: Partial<WeddingPersistedDecisionRecord> = {}): WeddingPersistedDecisionRecord {
  return {
    id: input.id ?? "decision:vendor",
    artifactId: input.artifactId ?? "artifact:vendors",
    artifactTitle: input.artifactTitle ?? "Photographer shortlist",
    artifactKind: input.artifactKind ?? "vendor_table",
    selectedOptionId: input.selectedOptionId ?? "0:vendor",
    selectedOptionLabel: input.selectedOptionLabel ?? "Harbour Photos",
    selectedOptionDetail: input.selectedOptionDetail ?? "Projected package $4,000-$5,000, request current quote",
    selectedOptionCells: input.selectedOptionCells ?? ["Harbour Photos", "Photography", "$4,000-$5,000", "Projected package"],
    createdAt: input.createdAt ?? "2026-09-14T00:00:00.000Z",
    source: input.source ?? "local_selection",
    metadataLabels: input.metadataLabels ?? [],
  };
}

test("buildWeddingBudgetTrackingState totals selected vendor projected and quoted prices", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision(),
      decision({
        id: "decision:venue",
        artifactTitle: "Venue shortlist",
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Quoted package AUD 12000 including ceremony room",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000", "Contract quote"],
      }),
    ],
  });

  assert.equal(state.lineItems.length, 2);
  assert.equal(state.totalProjectedAmount, 4500);
  assert.equal(state.totalQuotedAmount, 12000);
  assert.equal(state.totalKnownAmount, 16500);
  assert.equal(state.projectedCount, 1);
  assert.equal(state.quotedCount, 1);
  assert.match(state.summaryLabel, /2 selected vendors tracked/i);
  assert.ok(state.warningLabels.some((label) => /still projected/i.test(label)));
});

test("buildWeddingBudgetTrackingState flags selected vendors without usable amounts", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision({
        id: "decision:florist",
        artifactTitle: "Florist shortlist",
        selectedOptionLabel: "Petal Studio",
        selectedOptionDetail: "Price TBC after moodboard",
        selectedOptionCells: ["Petal Studio", "Floral Designer", "TBC"],
      }),
    ],
  });

  assert.equal(state.lineItems.length, 1);
  assert.equal(state.totalKnownAmount, 0);
  assert.equal(state.unknownCount, 1);
  assert.equal(state.lineItems[0]?.priceStatus, "unknown");
  assert.ok(state.lineItems[0]?.warningLabels.some((label) => /No usable amount/i.test(label)));
});

test("buildWeddingBudgetTrackingState redacts imported selected-decision budget source labels", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision({
        id: "decision:imported-budget",
        artifactTitle: "Imported XLSX: family-budget.xlsx",
        sourceLabels: ["source: family-budget.xlsx"],
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Projected package $12000",
        selectedOptionCells: ["Garden Hall", "Venue", "$12,000"],
      }),
    ],
  });

  assert.equal(state.lineItems[0]?.sourceLabel, "Imported private planning file");
  assert.equal(state.quoteTaskCandidates[0]?.sourceLabel, "Imported private planning file");
});

test("buildWeddingBudgetTrackingState ignores non-vendor decision records", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision({
        artifactKind: "legal",
        artifactTitle: "NOIM path",
        selectedOptionLabel: "Use public celebrant path",
        selectedOptionDetail: "Prepare documents before deadline",
        selectedOptionCells: ["NOIM", "Deadline"],
      }),
    ],
  });

  assert.equal(state.lineItems.length, 0);
  assert.equal(state.summaryLabel, "No selected vendors are contributing to the budget yet.");
});

test("buildWeddingBudgetTrackingState compares selected vendors against explicit budget target", () => {
  const state = buildWeddingBudgetTrackingState({
    budgetTargetText: "Overall budget AUD 15000",
    decisionRecords: [
      decision({
        id: "decision:venue",
        artifactTitle: "Venue shortlist",
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Quoted package AUD 12000 including ceremony room",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000", "Contract quote"],
      }),
      decision(),
    ],
  });

  assert.equal(state.budgetTargetAmount, 15000);
  assert.equal(state.remainingAmount, -1500);
  assert.equal(state.overBudgetAmount, 1500);
  assert.equal(state.budgetUtilizationPercent, 110);
  assert.match(state.budgetStatusLabel, /Over target/i);
  assert.ok(state.warningLabels.some((label) => /over the explicit budget target/i.test(label)));
});

test("buildWeddingBudgetTrackingState extracts budget target from budget artifacts only", () => {
  const state = buildWeddingBudgetTrackingState({
    artifacts: [{
      title: "Budget plan",
      kind: "budget_sheet",
      bodyText: "Target budget: $22000\nVendor row: photographer $4500",
    }],
    decisionRecords: [decision()],
  });

  assert.equal(state.budgetTargetAmount, 22000);
  assert.equal(state.remainingAmount, 17500);
  assert.match(state.budgetStatusLabel, /remaining against explicit target/i);
});

test("buildWeddingBudgetTrackingState exposes category rollups and quote tasks", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision(),
      decision({
        id: "decision:florist",
        artifactTitle: "Florist shortlist",
        selectedOptionLabel: "Petal Studio",
        selectedOptionDetail: "Price TBC after moodboard",
        selectedOptionCells: ["Petal Studio", "Floral Designer", "TBC"],
      }),
      decision({
        id: "decision:venue",
        artifactTitle: "Venue shortlist",
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Quoted package AUD 12000 including ceremony room",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000", "Contract quote"],
      }),
    ],
  });

  assert.equal(state.categoryRollups[0]?.categoryLabel, "Venue");
  assert.equal(state.categoryRollups[0]?.amount, 12000);
  assert.ok(state.categoryRollups.some((rollup) => rollup.categoryLabel === "Photographer"));
  assert.equal(state.quoteTaskCandidates.length, 2);
  assert.ok(state.quoteTaskCandidates.some((task) => /Get current quote for Petal Studio/i.test(task.title)));
  assert.ok(state.quoteTaskCandidates.some((task) => /Verify Harbour Photos pricing/i.test(task.title)));
});

test("buildWeddingBudgetTrackingState extracts payment review tasks from budget sheets", () => {
  const state = buildWeddingBudgetTrackingState({
    artifacts: [{
      id: "artifact:budget",
      title: "Wedding budget",
      kind: "budget_sheet",
      bodyText: [
        "| Category | Vendor | Paid | Due | Due date | Warning |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Venue | Garden Hall | No | $5000 | 2027-06-01 | Deposit deadline |",
        "| Celebrant | Jane Public | Paid | $0 | 2027-05-01 | None |",
      ].join("\n"),
    }],
  });

  assert.equal(state.paymentTaskCandidates.length, 1);
  assert.equal(state.paymentTaskCandidates[0]?.vendorName, "Garden Hall");
  assert.equal(state.paymentTaskCandidates[0]?.dueAmountLabel, "$5000");
  assert.equal(state.paymentTaskCandidates[0]?.dueAt, "2027-06-01");
});

test("buildWeddingBudgetTrackingState redacts imported budget-sheet source labels for payment tasks", () => {
  const state = buildWeddingBudgetTrackingState({
    artifacts: [{
      id: "wedding_import:budget_sheet:workspace:family-budget-xlsx",
      title: "Imported XLSX: family-budget.xlsx",
      kind: "budget_sheet",
      metadata: {
        supertags: ["wedding_import", "wedding_import:spreadsheet"],
      },
      sourceLabels: ["XLSX import: family-budget.xlsx"],
      bodyText: "| Category | Vendor | Paid | Due |\n| --- | --- | --- | --- |\n| Venue | Garden Hall | No | $5000 |",
    }],
  });

  assert.equal(state.paymentTaskCandidates.length, 1);
  assert.equal(state.paymentTaskCandidates[0]?.sourceLabel, "Imported private planning file");
});

test("buildWeddingBudgetPaymentTaskItems creates searchable payment-review task metadata and dedupes saved tasks", () => {
  const state = buildWeddingBudgetTrackingState({
    artifacts: [{
      id: "artifact:budget",
      title: "Wedding budget",
      kind: "budget_sheet",
      bodyText: "| Category | Vendor | Paid | Due |\n| --- | --- | --- | --- |\n| Venue | Garden Hall | No | $5000 |",
    }],
  });
  const tasks = buildWeddingBudgetPaymentTaskItems({
    budgetTracking: state,
    metadata: {
      wedding_plan_id: "wedding_plan:budget",
      response_workspace_id: "response_workspace:budget",
    },
  });

  assert.equal(tasks.length, 1);
  const taskMetadata = record(tasks[0]?.metadata);
  assert.equal(taskMetadata.budget_payment_review, true);
  assert.equal(taskMetadata.budget_vendor_label, "Garden Hall");
  assert.ok((taskMetadata.searchable_terms as string[]).some((term) => /payment review/i.test(term)));

  const duplicate = buildWeddingBudgetPaymentTaskItems({
    budgetTracking: state,
    existingTaskItems: [{
      id: "task:payment",
      title: "Review payment status for Garden Hall",
      kind: "budget_review",
      metadata: { budget_payment_candidate_id: tasks[0]?.id },
    }],
  });
  assert.equal(duplicate.length, 0);
});
