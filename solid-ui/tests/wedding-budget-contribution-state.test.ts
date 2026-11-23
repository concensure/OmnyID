import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingBudgetContributionProjectionInput,
  isWeddingBudgetContributionDecisionRecord,
  weddingBudgetContributionsFromDecisionRecords,
} from "@/lib/weddingBudgetContributionState";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";

test("buildWeddingBudgetContributionProjectionInput creates a reusable wedding decision projection", () => {
  const projection = buildWeddingBudgetContributionProjectionInput({
    personLabel: "Alex parents",
    amount: 5000,
    conditionLabel: "Venue only",
    currency: "AUD",
  }, {
    weddingPlanId: "wedding_plan:budget",
    responseWorkspaceId: "response_workspace:budget",
    sourceResponseId: "response:budget",
    supertags: ["template:wedding_planning"],
  }, "2026-09-26T00:00:00.000Z");

  assert.ok(projection);
  assert.equal(projection.artifactKind, "budget_sheet");
  assert.match(projection.artifactId, /^wedding-budget-contribution:/);
  assert.equal(projection.selectedOption.label, "Alex parents");
  assert.equal(projection.selectedOption.cells[0], "Contributor: Alex parents");
  assert.match(projection.selectedOption.cells[1] ?? "", /^Amount: .?5,000$/);
  assert.equal(projection.selectedOption.cells[2], "Condition: Venue only");

  const sendInput = weddingDecisionProjectionToAfpSendInput(projection, "2026-09-26T00:00:00.000Z");
  assert.equal(sendInput.kind, "note");
  assert.equal(sendInput.subtype, "wedding_decision_selection");
  assert.equal(sendInput.store_in_relational, true);
  assert.ok(sendInput.to?.includes("agent://knowledge-graph"));
});

test("weddingBudgetContributionsFromDecisionRecords reads saved contribution rows", () => {
  const record: WeddingPersistedDecisionRecord = {
    id: "decision:contribution",
    artifactId: "wedding-budget-contribution:response-workspace-budget:alex-parents",
    artifactTitle: "Wedding Budget Contribution",
    artifactKind: "budget_sheet",
    selectedOptionId: "budget-contribution",
    selectedOptionLabel: "Alex parents",
    selectedOptionDetail: "Alex parents may contribute A$5,000. Condition: Venue only",
    selectedOptionCells: ["Contributor: Alex parents", "Amount: A$5,000", "Condition: Venue only"],
    createdAt: "2026-09-26T00:00:00.000Z",
    source: "user",
    metadataLabels: [],
  };

  assert.equal(isWeddingBudgetContributionDecisionRecord(record), true);
  assert.deepEqual(weddingBudgetContributionsFromDecisionRecords([record]), [{
    personLabel: "Alex parents",
    amountLabel: "A$5,000",
    conditionLabel: "Venue only",
  }]);
});
