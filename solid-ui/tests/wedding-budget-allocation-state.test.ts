import test from "node:test";
import assert from "node:assert/strict";

import {
  weddingDecisionProjectionToAfpSendInput,
} from "../src/lib/weddingDecisionAfpProjectionState.ts";
import {
  WEDDING_BUDGET_CATEGORIES,
  buildWeddingBudgetAllocationSaveState,
  buildWeddingBudgetAllocationProjectionInput,
  emptyWeddingBudgetAllocationDraft,
  loadWeddingBudgetAllocationDraft,
  loadWeddingBudgetAllocationPendingDecision,
  saveWeddingBudgetAllocationPendingDecision,
  saveWeddingBudgetAllocationDraft,
  weddingBudgetAllocationAllocatedAmount,
  weddingBudgetAllocationFromDecisionRecords,
  weddingBudgetAllocationIsBalanced,
  weddingBudgetAllocationRemaining,
  weddingBudgetCustomCategoryId,
  withWeddingBudgetAutoBalance,
  type WeddingBudgetAllocationDraft,
} from "../src/lib/weddingBudgetAllocationState.ts";
import {
  buildWeddingPersistedWorkspaceState,
  type WeddingPersistedDecisionRecord,
} from "../src/lib/weddingPersistedWorkspaceState.ts";
import type { AfpMessage } from "../src/lib/api.ts";

function fakeStorage(): Storage {
  const state = new Map<string, string>();
  return {
    getItem: (key: string) => (state.has(key) ? state.get(key)! : null),
    setItem: (key: string, value: string) => {
      state.set(key, value);
    },
    removeItem: (key: string) => {
      state.delete(key);
    },
    clear: () => state.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function filledDraft(overrides: Partial<Record<string, number>> = {}): WeddingBudgetAllocationDraft {
  const draft = emptyWeddingBudgetAllocationDraft("AUD");
  draft.totalAmount = 30_000;
  draft.categoryAmounts.venue_ceremony = 10_000;
  draft.categoryAmounts.catering_drinks = 8_000;
  draft.categoryAmounts.photo_video = 4_000;
  draft.categoryAmounts.attire_beauty = 2_000;
  draft.categoryAmounts.flowers_decor = 2_500;
  draft.categoryAmounts.entertainment_music = 2_000;
  draft.categoryAmounts.other_misc = 1_500;
  for (const [id, amount] of Object.entries(overrides)) {
    (draft.categoryAmounts as Record<string, number>)[id] = amount as number;
  }
  return draft;
}

test("there are exactly seven broad budget categories", () => {
  assert.equal(WEDDING_BUDGET_CATEGORIES.length, 7);
  assert.equal(new Set(WEDDING_BUDGET_CATEGORIES.map((c) => c.id)).size, 7);
});

test("allocated amount sums every category regardless of order", () => {
  const draft = filledDraft();
  assert.equal(weddingBudgetAllocationAllocatedAmount(draft), 30_000);
  assert.equal(weddingBudgetAllocationRemaining(draft), 0);
  assert.equal(weddingBudgetAllocationIsBalanced(draft), true);
});

test("a draft is not balanced until every dollar of the total is allocated", () => {
  const under = filledDraft({ other_misc: 1_000 });
  assert.equal(weddingBudgetAllocationRemaining(under), 500);
  assert.equal(weddingBudgetAllocationIsBalanced(under), false);

  const over = filledDraft({ other_misc: 2_000 });
  assert.equal(weddingBudgetAllocationRemaining(over), -500);
  assert.equal(weddingBudgetAllocationIsBalanced(over), false);

  const zero = emptyWeddingBudgetAllocationDraft();
  assert.equal(weddingBudgetAllocationIsBalanced(zero), false, "a zero total is never considered balanced");
});

test("withWeddingBudgetAutoBalance makes other_misc absorb the remainder so the draft stays balanced", () => {
  const draft = filledDraft({ other_misc: 0 });
  // Every category except other_misc sums to 28,500 of the 30,000 total.
  const balanced = withWeddingBudgetAutoBalance(draft);
  assert.equal(balanced.categoryAmounts.other_misc, 1_500);
  assert.equal(weddingBudgetAllocationIsBalanced(balanced), true);
});

test("withWeddingBudgetAutoBalance clamps to zero instead of going negative when other categories already exceed the total", () => {
  const draft = filledDraft({ venue_ceremony: 40_000, other_misc: 0 });
  const balanced = withWeddingBudgetAutoBalance(draft);
  assert.equal(balanced.categoryAmounts.other_misc, 0);
  assert.equal(weddingBudgetAllocationIsBalanced(balanced), false, "over-allocation in another category must still block save, not silently balance");
});

test("withWeddingBudgetAutoBalance recomputes the remainder after the total itself changes", () => {
  const draft = filledDraft({ other_misc: 1_500 });
  const rebalanced = withWeddingBudgetAutoBalance({ ...draft, totalAmount: 32_000 });
  assert.equal(rebalanced.categoryAmounts.other_misc, 3_500);
  assert.equal(weddingBudgetAllocationIsBalanced(rebalanced), true);
});

test("custom categories balance, persist and round-trip through the AFP decision", () => {
  const draft = filledDraft({ other_misc: 1_500 });
  const id = weddingBudgetCustomCategoryId("Childcare");
  draft.customCategories.push({ id, label: "Childcare" });
  draft.categoryAmounts[id] = 500;
  const balanced = withWeddingBudgetAutoBalance(draft);
  assert.equal(balanced.categoryAmounts.other_misc, 1_000);
  assert.equal(weddingBudgetAllocationIsBalanced(balanced), true);

  const projection = buildWeddingBudgetAllocationProjectionInput(balanced, { responseWorkspaceId: "workspace-1" });
  assert.ok(projection.selectedOption.cells.includes("Custom — Childcare: $500"));
  const summary = weddingBudgetAllocationFromDecisionRecords([budgetDecisionRecord({
    selectedOptionCells: projection.selectedOption.cells,
  })]);
  assert.equal(summary?.categories.find((category) => category.categoryLabel === "Childcare")?.amount, 500);

  const storage = fakeStorage();
  saveWeddingBudgetAllocationDraft("plan-custom", balanced, storage);
  assert.deepEqual(loadWeddingBudgetAllocationDraft("plan-custom", storage), balanced);
});

test("budget allocation save state explains why saving is unavailable", () => {
  const balanced = filledDraft();
  assert.deepEqual(
    buildWeddingBudgetAllocationSaveState({ draft: balanced, saveAvailable: true }),
    { canSave: true, disabledReason: null },
  );
  assert.match(
    buildWeddingBudgetAllocationSaveState({ draft: balanced, saveAvailable: false }).disabledReason ?? "",
    /not connected/i,
  );
  assert.match(
    buildWeddingBudgetAllocationSaveState({ draft: balanced, saving: true, saveAvailable: true }).disabledReason ?? "",
    /saving/i,
  );
  assert.match(
    buildWeddingBudgetAllocationSaveState({ draft: filledDraft({ other_misc: 1_000 }), saveAvailable: true }).disabledReason ?? "",
    /remaining/i,
  );
  assert.match(
    buildWeddingBudgetAllocationSaveState({ draft: filledDraft({ other_misc: 2_000 }), saveAvailable: true }).disabledReason ?? "",
    /match the total/i,
  );
  assert.match(
    buildWeddingBudgetAllocationSaveState({ draft: emptyWeddingBudgetAllocationDraft(), saveAvailable: true }).disabledReason ?? "",
    /total budget/i,
  );
});

test("the projection input carries one cell per category and is deterministic on the figures", () => {
  const draft = filledDraft();
  const metadata = { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", sourceResponseId: null };
  const input = buildWeddingBudgetAllocationProjectionInput(draft, metadata, "2026-09-22T00:00:00.000Z");

  assert.equal(input.artifactKind, "budget_sheet");
  assert.equal(input.selectedOption.cells.length, 7);
  assert.match(input.selectedOption.cells[0], /^Venue & Ceremony: \$10,000$/);
  assert.match(input.selectedOption.label, /\$30,000/);

  const sameAgain = buildWeddingBudgetAllocationProjectionInput(draft, metadata, "2026-09-22T00:00:00.000Z");
  assert.equal(input.id, sameAgain.id, "identical figures must produce the identical decision id");

  const changed = buildWeddingBudgetAllocationProjectionInput(filledDraft({ entertainment_music: 1_500, other_misc: 2_000 }), metadata);
  assert.notEqual(input.id, changed.id, "a changed figure must produce a different decision id");
});

test("the projection input fails closed for an unbalanced allocation", () => {
  assert.throws(
    () => buildWeddingBudgetAllocationProjectionInput(filledDraft({ other_misc: 2_000 }), { responseWorkspaceId: "workspace-1" }),
    /balanced/i,
  );
});

test("a balanced allocation uses the standard AFP decision path and round-trips from persisted workspace state", () => {
  const metadata = { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", sourceResponseId: "response-1" };
  const projection = buildWeddingBudgetAllocationProjectionInput(filledDraft(), metadata, "2026-09-22T00:00:00.000Z");
  const sendInput = weddingDecisionProjectionToAfpSendInput(projection, "2026-09-22T00:00:00.000Z");

  assert.equal(sendInput.subtype, "wedding_decision_selection");
  assert.equal(sendInput.store_in_relational, true);
  assert.deepEqual(sendInput.to, ["agent://wedding-planning", "agent://decision-queue", "agent://search", "agent://knowledge-graph"]);
  assert.equal((sendInput.content as Record<string, unknown>).artifact_kind, "budget_sheet");
  assert.equal((sendInput.content as Record<string, unknown>).artifact_id, "wedding-budget-allocation");
  assert.equal((sendInput.content as Record<string, unknown>).response_workspace_id, "response_workspace:workspace-1");

  const message: AfpMessage = {
    id: "afp-budget-allocation-1",
    thread_id: sendInput.thread_id,
    from: sendInput.from,
    to: sendInput.to,
    timestamp: sendInput.timestamp ?? "2026-09-22T00:00:00.000Z",
    type: sendInput.type,
    kind: sendInput.kind ?? null,
    subtype: sendInput.subtype,
    supertags: ["template:wedding_planning", "event:wedding", "response_workspace"],
    content: sendInput.content as Record<string, unknown>,
    metadata: sendInput.metadata ?? {},
    views: [],
    attachments: [],
    references: [],
  };

  const persisted = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: "plan-1",
    responseWorkspaceId: "response_workspace:workspace-1",
    sourceResponseId: "response-1",
  });

  assert.equal(persisted.decisionRecords.length, 1);
  const summary = weddingBudgetAllocationFromDecisionRecords(persisted.decisionRecords);
  assert.ok(summary);
  assert.equal(summary!.totalAmount, 30_000);
  assert.equal(summary!.categories.length, 7);
  assert.equal(summary!.categories.find((category) => category.categoryId === "catering_drinks")?.amount, 8_000);
});

function budgetDecisionRecord(overrides: Partial<WeddingPersistedDecisionRecord> = {}): WeddingPersistedDecisionRecord {
  return {
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
    createdAt: "2026-09-22T00:00:00.000Z",
    source: "user",
    metadataLabels: [],
    ...overrides,
  };
}

test("weddingBudgetAllocationFromDecisionRecords round-trips the figures the projection input wrote", () => {
  const summary = weddingBudgetAllocationFromDecisionRecords([budgetDecisionRecord()]);
  assert.ok(summary);
  assert.equal(summary!.totalAmount, 30_000);
  assert.equal(summary!.categories.length, 7);
  assert.equal(summary!.categories.find((c) => c.categoryId === "venue_ceremony")?.amount, 10_000);
});

test("weddingBudgetAllocationFromDecisionRecords ignores non-budget decisions and picks the most recent budget one", () => {
  const older = budgetDecisionRecord({ id: "older", createdAt: "2026-09-01T00:00:00.000Z", selectedOptionCells: budgetDecisionRecord().selectedOptionCells.map((c) => c.replace("$10,000", "$5,000")) });
  const vendorPick: WeddingPersistedDecisionRecord = {
    ...budgetDecisionRecord(),
    id: "vendor",
    artifactKind: "vendor_table",
    artifactTitle: "Venue shortlist",
    selectedOptionCells: ["Harbour House", "$25,000"],
    createdAt: "2026-09-10T00:00:00.000Z",
  };
  const newer = budgetDecisionRecord({ id: "newer", createdAt: "2026-09-15T00:00:00.000Z" });

  const summary = weddingBudgetAllocationFromDecisionRecords([older, vendorPick, newer]);
  assert.ok(summary);
  assert.equal(summary!.createdAt, "2026-09-15T00:00:00.000Z", "must pick the most recent budget_sheet record, not the vendor pick or the older one");
  assert.equal(summary!.categories.find((c) => c.categoryId === "venue_ceremony")?.amount, 10_000);
});

test("weddingBudgetAllocationFromDecisionRecords ignores ordinary budget-sheet decisions", () => {
  const ordinaryBudgetDecision = budgetDecisionRecord({
    id: "ordinary-budget-row",
    artifactId: "artifact:budget-sheet",
    selectedOptionId: "row-1",
    selectedOptionLabel: "Garden Hall deposit",
    selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000"],
  });

  assert.equal(weddingBudgetAllocationFromDecisionRecords([ordinaryBudgetDecision]), null);
});

test("weddingBudgetAllocationFromDecisionRecords returns null when there is no budget decision", () => {
  const vendorPick: WeddingPersistedDecisionRecord = {
    ...budgetDecisionRecord(),
    artifactKind: "vendor_table",
    selectedOptionCells: ["Harbour House", "$25,000"],
  };
  assert.equal(weddingBudgetAllocationFromDecisionRecords([vendorPick]), null);
  assert.equal(weddingBudgetAllocationFromDecisionRecords([]), null);
});

test("draft persistence round-trips through storage and rejects malformed data", () => {
  const storage = fakeStorage();
  assert.equal(loadWeddingBudgetAllocationDraft("plan-1", storage), null);

  const draft = filledDraft();
  saveWeddingBudgetAllocationDraft("plan-1", draft, storage);
  const loaded = loadWeddingBudgetAllocationDraft("plan-1", storage);
  assert.deepEqual(loaded, draft);

  assert.equal(loadWeddingBudgetAllocationDraft("plan-2", storage), null, "drafts must not leak across wedding plans");

  storage.setItem("omnyid.wedding.budget-allocation-draft.plan-3", "not json");
  assert.equal(loadWeddingBudgetAllocationDraft("plan-3", storage), null);
});

test("pending budget allocation decision round-trips as local fallback state", () => {
  const storage = fakeStorage();
  const decision = buildWeddingBudgetAllocationProjectionInput(filledDraft(), {
    weddingPlanId: "plan-1",
    responseWorkspaceId: "workspace-1",
  }, "2026-09-28T00:00:00.000Z");

  assert.equal(loadWeddingBudgetAllocationPendingDecision("plan-1", storage), null);
  saveWeddingBudgetAllocationPendingDecision("plan-1", decision, storage);

  const loaded = loadWeddingBudgetAllocationPendingDecision("plan-1", storage);
  assert.equal(loaded?.id, decision.id);
  assert.equal(loaded?.artifactId, decision.artifactId);
  assert.equal(loaded?.selectedOption.label, decision.selectedOption.label);
  assert.deepEqual(loaded?.selectedOption.cells, decision.selectedOption.cells);
  assert.equal(loadWeddingBudgetAllocationPendingDecision("plan-2", storage), null);
});
