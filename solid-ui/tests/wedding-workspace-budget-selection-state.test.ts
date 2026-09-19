import assert from "node:assert/strict";
import test from "node:test";

import { setWeddingDecisionSelection } from "../src/lib/weddingDecisionSelectionState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import type { WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  } as Storage;
}

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata,
    sourceLabels: ["Agent research"],
    ...input,
  };
}

test("buildWeddingResponseWorkspaceViewState updates budget from unsaved selected vendor rows", () => {
  const storage = memoryStorage();
  setWeddingDecisionSelection("artifact:photographer-shortlist", "0:harbour-photos", storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:photographer-shortlist",
        title: "Photographer shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: [
          "# Photographer shortlist",
          "",
          "| Name | Category | Price | Notes |",
          "| --- | --- | --- | --- |",
          "| Harbour Photos | Photographer | AUD 4,000-5,000 | Editorial package, request current quote |",
          "| City Lens | Photographer | AUD 6,000 | Premium quote |",
        ].join("\n"),
      }),
    ],
    projectionStorage: storage,
  });

  assert.equal(state.budgetTracking.lineItems.length, 1);
  assert.equal(state.budgetTracking.lineItems[0]?.vendorName, "Harbour Photos");
  assert.equal(state.budgetTracking.totalProjectedAmount, 4500);
  assert.ok(state.budgetTracking.quoteTaskCandidates.some((task) => /Verify Harbour Photos pricing/i.test(task.title)));
});

test("buildWeddingResponseWorkspaceViewState does not double count a selected row after decision persistence", () => {
  const storage = memoryStorage();
  setWeddingDecisionSelection("artifact:photographer-shortlist", "0:harbour-photos", storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:photographer-shortlist",
        title: "Photographer shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: [
          "# Photographer shortlist",
          "",
          "| Name | Category | Price | Notes |",
          "| --- | --- | --- | --- |",
          "| Harbour Photos | Photographer | AUD 4,000-5,000 | Editorial package, request current quote |",
        ].join("\n"),
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:photographer",
      artifactId: "artifact:photographer-shortlist",
      artifactTitle: "Photographer shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "0:harbour-photos",
      selectedOptionLabel: "Harbour Photos",
      selectedOptionDetail: "AUD 4,000-5,000 editorial package",
      selectedOptionCells: ["Harbour Photos", "Photographer", "AUD 4,000-5,000", "Editorial package"],
      createdAt: "2026-09-14T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: storage,
  });

  assert.equal(state.budgetTracking.lineItems.length, 1);
  assert.equal(state.budgetTracking.totalKnownAmount, 4500);
});

test("buildWeddingResponseWorkspaceViewState projects selected vendor quote checks into tasks", () => {
  const storage = memoryStorage();
  setWeddingDecisionSelection("artifact:photographer-shortlist", "0:harbour-photos", storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:photographer-shortlist",
        title: "Photographer shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: [
          "# Photographer shortlist",
          "",
          "| Name | Category | Price | Notes |",
          "| --- | --- | --- | --- |",
          "| Harbour Photos | Photographer | AUD 4,000-5,000 | Projected package, request current quote |",
        ].join("\n"),
      }),
    ],
    projectionStorage: storage,
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.ok(taskItems.some((item) =>
    /Verify Harbour Photos pricing/i.test(item.title)
    && item.sourceId.startsWith("wedding_budget_quote_task:")
  ));
  assert.ok(state.personalOsProjection.rankedItems.some((item) => /Verify Harbour Photos pricing/i.test(item.title)));
});

test("buildWeddingResponseWorkspaceViewState suppresses duplicate budget quote task projections", () => {
  const storage = memoryStorage();
  setWeddingDecisionSelection("artifact:photographer-shortlist", "0:harbour-photos", storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:photographer-shortlist",
        title: "Photographer shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: [
          "# Photographer shortlist",
          "",
          "| Name | Category | Price | Notes |",
          "| --- | --- | --- | --- |",
          "| Harbour Photos | Photographer | AUD 4,000-5,000 | Projected package, request current quote |",
        ].join("\n"),
      }),
    ],
    taskItems: [{
      id: "task:existing-budget-check",
      title: "Check Harbour Photos quote",
      kind: "budget_review",
      source: "agent",
      metadata: {
        ...metadata,
        budget_quote_verification: true,
        budget_line_item_id: "wedding_decision:artifact:photographer-shortlist:0:harbour-photos",
      },
    }],
    projectionStorage: storage,
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.equal(taskItems.some((item) =>
    /Verify Harbour Photos pricing/i.test(item.title)
    && item.sourceId.startsWith("wedding_budget_quote_task:")
  ), false);
});

test("buildWeddingResponseWorkspaceViewState projects budget-sheet payment reviews into Tasks and PersonalOS", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:budget",
        title: "Wedding budget",
        kind: "budget_sheet",
        createdAt: 1,
        bodyText: [
          "| Category | Vendor | Paid | Due | Due date | Warning |",
          "| --- | --- | --- | --- | --- | --- |",
          "| Venue | Garden Hall | No | $5000 | 2027-06-01 | Deposit deadline |",
        ].join("\n"),
      }),
    ],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.ok(taskItems.some((item) =>
    /Review payment status for Garden Hall/i.test(item.title)
    && item.sendInput?.metadata?.budget_payment_review === true
  ));
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    /Review payment status for Garden Hall/i.test(item.title)
    && item.evidenceLabels.includes("payment review")
  ));
});
