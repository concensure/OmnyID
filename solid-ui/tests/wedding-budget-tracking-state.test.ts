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
  assert.equal(taskMetadata.second_order_loop, "budget_drift");
  assert.ok((taskMetadata.second_order_evidence_labels as string[]).some((term) => /Payment schedule/i.test(term)));
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

test("buildWeddingBudgetTrackingState surfaces a saved budget allocation without treating it as a vendor spend line", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision(), // a real vendor pick — must still produce a line item
      decision({
        id: "wedding_decision:workspace-1:wedding-budget-allocation:1",
        artifactId: "wedding-budget-allocation",
        artifactTitle: "Wedding Budget",
        artifactKind: "budget_sheet",
        selectedOptionId: "total-budget",
        selectedOptionLabel: "$30,000 total",
        selectedOptionDetail: "Allocated across 7 categories.",
        selectedOptionCells: [
          "Venue & Ceremony: $10,000",
          "Catering & Drinks: $8,000",
          "Photography & Video: $4,000",
          "Attire & Beauty: $2,000",
          "Flowers & Decor: $2,500",
          "Entertainment & Music: $2,000",
          "Stationery, Transport & Other: $1,500",
        ],
        createdAt: "2026-09-20T00:00:00.000Z",
      }),
    ],
  });

  // Regression guard: a budget_sheet decision record must not become a bogus vendor line item
  // (its artifactKind contains the word "budget", which the vendor-line detector matches on).
  assert.equal(state.lineItems.length, 1, "only the real vendor pick should produce a line item");
  assert.equal(state.lineItems[0]?.vendorName, "Harbour Photos");

  assert.equal(state.budgetAllocation.length, 7);
  assert.equal(state.budgetAllocation.find((c) => c.categoryId === "venue_ceremony")?.amount, 10_000);
  // The couple's own explicit allocation must win as the target amount over any text-derived guess.
  assert.equal(state.budgetTargetAmount, 30_000);
});

test("buildWeddingBudgetTrackingState still treats ordinary budget-sheet decisions as spend lines", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision({
        id: "decision:budget-sheet-row",
        artifactId: "artifact:budget-sheet",
        artifactTitle: "Wedding budget sheet",
        artifactKind: "budget_sheet",
        selectedOptionId: "row-venue",
        selectedOptionLabel: "Garden Hall deposit",
        selectedOptionDetail: "Quoted package AUD 12000 including ceremony room",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000", "Contract quote"],
      }),
    ],
  });

  assert.equal(state.lineItems.length, 1);
  assert.equal(state.lineItems[0]?.vendorName, "Garden Hall deposit");
  assert.equal(state.totalQuotedAmount, 12_000);
  assert.equal(state.budgetAllocation.length, 0, "ordinary budget-sheet rows must not become the user's allocation target");
});

test("buildWeddingBudgetTrackingState normalizes quote fields and scenario budgets", () => {
  const state = buildWeddingBudgetTrackingState({
    budgetTargetText: "Total budget AUD 30000",
    artifacts: [{
      id: "artifact:budget",
      title: "Sydney wedding budget",
      kind: "budget_sheet",
      bodyText: [
        "Wedding date 2027-06-01. Guest count 80. Priorities: photography and food.",
        "Contribution from Alex parents: $5000 condition: venue only.",
        "| Category | Vendor | Paid | Due | Due date |",
        "| --- | --- | --- | --- | --- |",
        "| Venue | Garden Hall | No | $6000 | 2027-02-01 |",
        "| Photography | Harbour Photos | Paid $1000 | $3500 | 2027-05-01 |",
      ].join("\n"),
    }],
    decisionRecords: [
      decision({
        selectedOptionCells: [
          "Harbour Photos",
          "Photography",
          "$4,500 includes 8 hours and 80 guests. GST included. Travel fee $200. Overtime $500/hr. Cancellation: deposit non-refundable. Deposit $1000, balance due 2027-05-01.",
        ],
      }),
    ],
  });

  assert.equal(state.insights.committedAmount, 0);
  assert.equal(state.insights.estimatedAmount, 4500);
  assert.equal(state.insights.paidAmount, 1000);
  assert.equal(state.insights.remainingAmount, 25500);
  assert.equal(state.insights.monthlyCashNeeds.length, 2);
  assert.equal(state.insights.scenarios.find((scenario) => scenario.id === "safe")?.targetAmount, 27000);
  assert.equal(state.insights.contributionRows[0]?.personLabel, "Alex parents");
  assert.equal(state.insights.quoteNormalForms[0]?.hoursLabel, "8 hours");
  assert.match(state.insights.quoteNormalForms[0]?.taxLabel ?? "", /GST included/i);
  assert.match(state.insights.quoteNormalForms[0]?.cancellationLabel ?? "", /Cancellation/i);
  assert.deepEqual(state.insights.missingContextLabels, []);
});

test("buildWeddingBudgetTrackingState asks for missing budget context and flags unaffordable category choices", () => {
  const state = buildWeddingBudgetTrackingState({
    decisionRecords: [
      decision({
        id: "wedding_decision:workspace-1:wedding-budget-allocation:1",
        artifactId: "wedding-budget-allocation",
        artifactTitle: "Wedding Budget",
        artifactKind: "budget_sheet",
        selectedOptionId: "total-budget",
        selectedOptionLabel: "$10,000 total",
        selectedOptionDetail: "Allocated across 7 categories.",
        selectedOptionCells: [
          "Venue & Ceremony: $1,000",
          "Catering & Drinks: $1,000",
          "Photography & Video: $1,000",
          "Attire & Beauty: $1,000",
          "Flowers & Decor: $1,000",
          "Entertainment & Music: $1,000",
          "Stationery, Transport & Other: $4,000",
        ],
        createdAt: "2026-09-20T00:00:00.000Z",
      }),
      decision({
        id: "decision:venue",
        artifactTitle: "Venue shortlist",
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Quoted AUD 12000",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000"],
      }),
    ],
  });

  assert.ok(state.insights.missingContextLabels.includes("location"));
  assert.ok(state.insights.missingContextLabels.includes("wedding date"));
  assert.ok(state.insights.unaffordableWarningLabels.some((label) => /over the total budget/i.test(label)));
});

test("buildWeddingBudgetTrackingState extracts payment dates from uploaded contract or quote text", () => {
  const state = buildWeddingBudgetTrackingState({
    budgetTargetText: "Total budget AUD 30000",
    artifacts: [{
      id: "artifact:venue-contract",
      title: "Garden Hall contract",
      kind: "legal",
      vendorLabels: ["Garden Hall"],
      bodyText: [
        "Deposit $3000 due 2027-01-15. Non-refundable after signing.",
        "Final balance $9000 due 2027-05-15.",
        "A quiet design note with no money should not create a payment task.",
      ].join("\n"),
    }, {
      id: "artifact:photo-quote",
      title: "Harbour Photos quote",
      kind: "vendor_table",
      vendorLabels: ["Harbour Photos"],
      bodyText: "Payment schedule: $1000 deposit due 2027-02-01 and cancellation terms apply.",
    }],
  });

  assert.equal(state.paymentTaskCandidates.length, 3);
  assert.equal(state.paymentTaskCandidates[0]?.vendorName, "Garden Hall");
  assert.equal(state.paymentTaskCandidates[0]?.dueAt, "2027-01-15");
  assert.equal(state.paymentTaskCandidates[2]?.vendorName, "Harbour Photos");
  assert.deepEqual(
    state.insights.monthlyCashNeeds.map((row) => row.monthLabel),
    ["Jan 2027", "Feb 2027", "May 2027"],
  );
});
