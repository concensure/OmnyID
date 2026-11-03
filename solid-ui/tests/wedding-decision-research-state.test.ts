import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionResearchState } from "../src/lib/weddingDecisionResearchState.ts";
import { buildWeddingSecondOrderLoopCards } from "../src/lib/weddingSecondOrderLoopState.ts";
import type { WeddingPlanningTaskItem } from "../src/lib/weddingCalendarProjectionState.ts";
import type { WeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function task(title: string): WeddingPlanningTaskItem {
  return {
    id: `task:${title}`,
    title,
    kind: "research",
    dueLabel: "Before booking",
    priority: "normal",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {},
  };
}

function state(input?: { preference?: string; allocation?: number }): WeddingResponseWorkspaceViewState {
  return {
    workspace: { metadata: { weddingPlanId: "plan:test", responseWorkspaceId: "workspace:test", supertags: [] } },
    artifactPreviews: [],
    budgetTracking: {
      budgetAllocation: input?.allocation ? [{ categoryId: "other_misc", categoryLabel: "Transport", amount: input.allocation }] : [],
    },
    contextCards: [{
      id: "context",
      title: "Wedding context",
      statusLabel: "Ready",
      planningContext: { atmosphereDescription: input?.preference ?? null },
      answeredLabels: [],
      nextQuestionLabel: "",
      metadataLabels: [],
    }],
  } as unknown as WeddingResponseWorkspaceViewState;
}

test("transport recommendation uses the category allocation and never the total wedding budget", () => {
  const result = buildWeddingDecisionResearchState({
    task: task("Verify transport, access, and guest logistics for $35,000 total"),
    state: state({ allocation: 2_500 }),
  });
  assert.equal(result?.kind, "guest_logistics");
  assert.match(result?.recommendation ?? "", /\$2,500 transport allocation/);
  assert.doesNotMatch(result?.recommendation ?? "", /35,000/);
  assert.match(result?.detailMarkdown ?? "", /No complete route or access finding/i);
});

test("hen night brief adapts activity formats to the couple's saved preference", () => {
  const result = buildWeddingDecisionResearchState({
    task: task("Plan hen's night activities, budget, guest list, and transport"),
    state: state({ preference: "intimate, close circle and relaxed" }),
  });
  assert.equal(result?.kind, "hen_night");
  assert.match(result?.recommendation ?? "", /private small-group activity/i);
  assert.match(result?.detailMarkdown ?? "", /private cooking, pottery, floral or cocktail workshop/i);
  assert.equal(result?.generatedArtifact?.summary.kind, "research");
});

test("a linked report supplies a readable recommendation instead of a generic task instruction", () => {
  const linkedTask = { ...task("Review the researched wet-weather plan"), linkedArtifactId: "report:rain" };
  const linkedState = state();
  linkedState.artifactPreviews = [{
    artifactId: "report:rain",
    title: "Wet-weather venue research",
    bodyText: "## Recommendation\nConfirm the covered ceremony room and its seated capacity before paying the next deposit.\n\n## Evidence\nThe current package names an indoor room but does not state its seated capacity.",
  }] as WeddingResponseWorkspaceViewState["artifactPreviews"];
  const result = buildWeddingDecisionResearchState({ task: linkedTask, state: linkedState });
  assert.equal(result?.kind, "linked_report");
  assert.match(result?.recommendation ?? "", /Confirm the covered ceremony room/i);
  assert.equal(result?.existingArtifactId, "report:rain");
});

test("second-order logistics tasks do not name an unrelated overall budget decision", () => {
  const cards = buildWeddingSecondOrderLoopCards({
    artifacts: [{ id: "map", title: "Venue transport notes", kind: "map_collection", bodyText: "Venue access, parking and bus routes need checking." }],
    decisionRecords: [{
      id: "budget",
      artifactId: "budget-allocation",
      artifactTitle: "Wedding budget",
      artifactKind: "budget_sheet",
      selectedOptionId: "budget-total",
      selectedOptionLabel: "$35,000 total",
      selectedOptionDetail: "Overall wedding budget",
      selectedOptionCells: [],
      createdAt: "2026-11-03T00:00:00Z",
      source: "couple",
      metadataLabels: [],
    }],
  });
  const logistics = cards.find((card) => card.id === "second_order:guest_logistics");
  assert.equal(logistics?.suggestedTask?.title, "Verify transport, access, and guest logistics");
  assert.doesNotMatch(logistics?.suggestedTask?.notes ?? "", /35,000/);
});
