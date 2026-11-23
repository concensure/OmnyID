import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingBudgetTrackingState } from "../src/lib/weddingBudgetTrackingState.ts";
import { buildWeddingTaskDecisionContract } from "../src/lib/weddingDecisionDefinitionState.ts";
import { buildWeddingPlanVariableChangeTaskItems } from "../src/lib/weddingPlanVariableChangeState.ts";
import type { WeddingNeedToKnowProjectionContext } from "../src/lib/weddingNeedToKnowAfpProjectionState.ts";
import type { WeddingPersistedDecisionRecord } from "../src/lib/weddingPersistedWorkspaceState.ts";

const metadata = { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", sourceResponseId: null, supertags: ["wedding"] };

function context(guestCount: number, priorities: string[] = []): WeddingNeedToKnowProjectionContext {
  return {
    metadata,
    planningContext: { guestCount, topPriorities: priorities, atmosphereDescription: "Relaxed garden dinner" },
    answeredLabels: [],
    nextQuestionLabel: "Continue",
    readyForFirstRecommendations: true,
  };
}

function budgetTracking(): WeddingBudgetTrackingState {
  return {
    lineItems: [
      { id: "venue", linkedArtifactId: "quote-venue", vendorName: "Garden Hall", categoryLabel: "Venue", amount: 12_000, currency: "AUD", priceStatus: "quoted", sourceLabel: "quote", confidenceLabel: "quoted", warningLabels: [], rowCells: ["Final guest numbers due 7 days before"] },
      { id: "catering", linkedArtifactId: "quote-food", vendorName: "Shared Table", categoryLabel: "Catering & drinks", amount: 8_000, currency: "AUD", priceStatus: "projected", sourceLabel: "quote", confidenceLabel: "estimate", warningLabels: [], rowCells: [] },
      { id: "photo", linkedArtifactId: "quote-photo", vendorName: "Light Studio", categoryLabel: "Photo & video", amount: 5_000, currency: "AUD", priceStatus: "quoted", sourceLabel: "quote", confidenceLabel: "quoted", warningLabels: [], rowCells: [] },
      { id: "flowers", linkedArtifactId: "quote-flowers", vendorName: "Field Flowers", categoryLabel: "Flowers & decor", amount: 4_000, currency: "AUD", priceStatus: "projected", sourceLabel: "estimate", confidenceLabel: "estimate", warningLabels: [], rowCells: [] },
    ],
    categoryRollups: [], quoteTaskCandidates: [], paymentTaskCandidates: [], budgetAllocation: [],
    insights: {} as WeddingBudgetTrackingState["insights"], budgetTargetAmount: 35_000, remainingAmount: 6_000,
    overBudgetAmount: 0, budgetUtilizationPercent: 82, budgetStatusLabel: "Within budget", totalProjectedAmount: 12_000,
    totalQuotedAmount: 17_000, totalKnownAmount: 29_000, unknownCount: 0, projectedCount: 2, quotedCount: 2,
    summaryLabel: "Budget", warningLabels: [],
  };
}

function budgetRecord(total: number, createdAt: string, photo: number, flowers: number): WeddingPersistedDecisionRecord {
  const venue = 12_000;
  const catering = 8_000;
  const other = total - venue - catering - photo - flowers;
  return {
    id: `budget-${total}`, artifactId: "wedding-budget-allocation", artifactTitle: "Wedding Budget", artifactKind: "budget_sheet",
    selectedOptionId: "total-budget", selectedOptionLabel: `A$${total}`, selectedOptionDetail: "Budget allocation",
    selectedOptionCells: [`Venue & Ceremony: AUD ${venue}`, `Catering & Drinks: AUD ${catering}`, `Photography & Video: AUD ${photo}`, `Flowers & Decor: AUD ${flowers}`, `Stationery, Transport & Other: AUD ${other}`],
    selectedOptionColumnCells: [], createdAt, source: "user", metadataLabels: [],
  };
}

test("guest-count changes use a size-aware materiality safeguard and affected vendor evidence", () => {
  assert.equal(buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(95), context(80)], budgetTracking: budgetTracking() }).length, 0);
  const twenty = buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(100), context(80)], budgetTracking: budgetTracking() });
  assert.equal(twenty.length, 1);
  assert.match(twenty[0]!.title, /100 guests/i);
  assert.match(JSON.stringify(twenty[0]!.metadata), /80.*100|100.*80/);
  const smallWedding = buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(40), context(30)], budgetTracking: budgetTracking() });
  assert.equal(smallWedding.length, 1, "a 10-person, 33% change is material for a small wedding");
});

test("guest-count revision becomes one explicit approval-gated decision", () => {
  const [task] = buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(60), context(40)], budgetTracking: budgetTracking() });
  const contract = buildWeddingTaskDecisionContract({ task: task!, facts: { guestCount: 60, budgetTargetAmount: 35_000 } });
  assert.equal(contract.question, "Should you ask Garden Hall, Shared Table to reconfirm the plan for 60 guests?");
  assert.deepEqual(contract.options.map((option) => option.id), ["prepare_vendor_check", "review_guest_list", "keep_current_basis"]);
  assert.equal(contract.approvalRequiredBeforeExternalAction, true);
  assert.equal(contract.missingPrerequisite, null);
});

test("lowering budget creates preference-aware negotiate-or-reduce choices, but an increase does not", () => {
  const previous = budgetRecord(45_000, "2026-11-01T00:00:00Z", 7_000, 6_000);
  const current = budgetRecord(35_000, "2026-11-02T00:00:00Z", 7_000, 3_000);
  const tasks = buildWeddingPlanVariableChangeTaskItems({
    contextItems: [context(80, ["Photography is our most important keepsake"])],
    decisionRecords: [current, previous],
    budgetTracking: budgetTracking(),
  });
  const budgetTask = tasks.find((task) => (task.metadata as Record<string, unknown>).plan_variable_change_kind === "budget_reduction");
  assert.ok(budgetTask);
  const labels = ((budgetTask.metadata as Record<string, unknown>).decision_option_labels as string[]).join(" ");
  assert.match(labels, /Field Flowers/);
  assert.doesNotMatch(labels.split("Keep the trade-off open")[0] ?? "", /^Negotiate Light Studio/);
  assert.match((budgetTask.metadata as Record<string, unknown>).decision_question as string, /lowering the budget by A\$10,000/i);

  const laterIncrease = budgetRecord(45_000, "2026-11-03T00:00:00Z", 7_000, 6_000);
  assert.equal(buildWeddingPlanVariableChangeTaskItems({
    decisionRecords: [laterIncrease, current],
    budgetTracking: budgetTracking(),
  }).some((task) => (task.metadata as Record<string, unknown>).plan_variable_change_kind === "budget_reduction"), false);
});

test("settling a revision suppresses the same dependent decision without suppressing later revisions", () => {
  const [task] = buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(60), context(40)], budgetTracking: budgetTracking() });
  const settled = { ...task!, approvalState: "archived" as const };
  assert.equal(buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(60), context(40)], budgetTracking: budgetTracking(), existingTaskItems: [settled] }).length, 0);
  assert.equal(buildWeddingPlanVariableChangeTaskItems({ contextItems: [context(80), context(60), context(40)], budgetTracking: budgetTracking(), existingTaskItems: [settled] }).length, 1);
});
