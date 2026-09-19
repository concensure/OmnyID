import assert from "node:assert/strict";
import test from "node:test";

import { weddingPersistedDecisionRecordsToGraphDecisions } from "../src/lib/weddingDecisionGraphState.ts";
import { normalizeWeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";
import { buildWeddingKnowledgeGraphState } from "../src/lib/weddingKnowledgeGraphState.ts";
import { buildWeddingRecommendationExplanationState } from "../src/lib/weddingRecommendationExplanationState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:venue-pass",
  source_response_id: "afp:response-1",
};

function artifact(input: Parameters<typeof normalizeWeddingArtifactSummary>[0]) {
  const summary = normalizeWeddingArtifactSummary({ metadata, ...input });
  assert.ok(summary);
  return summary;
}

test("buildWeddingRecommendationExplanationState leads with missing evidence conservatively", () => {
  const graph = buildWeddingKnowledgeGraphState({ metadata });
  const state = buildWeddingRecommendationExplanationState(graph);

  assert.match(state.summaryLabel, /graph-backed wedding recommendation/i);
  assert.equal(state.primaryRecommendation?.kind, "missing_evidence");
  assert.match(state.primaryRecommendation?.body ?? "", /planning gap/i);
  assert.ok(state.recommendations.some((recommendation) => recommendation.title === "No budget sheet artifact yet"));
});

test("buildWeddingRecommendationExplanationState explains risks, approvals, decisions, and topology anchors", () => {
  const graph = buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:vendors",
        title: "Venue comparison",
        kind: "vendor_table",
        vendorLabels: ["Harbour House", "Garden Hall"],
        locationLabels: ["Sydney Harbour"],
      }),
      artifact({
        id: "artifact:budget",
        title: "Budget sheet",
        kind: "budget_sheet",
        metadata: { ...metadata, approval_state: "pending_user_approval" },
      }),
      artifact({
        id: "artifact:timeline",
        title: "Run sheet",
        kind: "timeline",
      }),
    ],
    scheduleItems: [{
      id: "rsvp-date",
      title: "RSVP deadline",
      kind: "rsvp_deadline",
      startAt: "2027-01-15T17:00:00+11:00",
      linkedArtifactId: "artifact:timeline",
    }],
    taskItems: [{
      id: "confirm-venue",
      title: "Confirm venue",
      kind: "decision",
      priority: "high",
      linkedArtifactId: "artifact:vendors",
    }],
    decisions: [{
      id: "venue-choice",
      title: "Choose venue",
      status: "open",
      constrains: ["Budget allocation"],
      requiresApproval: true,
    }],
    risks: [{
      id: "wet-weather",
      title: "No wet-weather backup confirmed",
      severity: "high",
      evidence: "Outdoor ceremony is still preferred.",
    }],
  });

  const state = buildWeddingRecommendationExplanationState(graph);
  const kinds = new Set(state.recommendations.map((recommendation) => recommendation.kind));

  assert.equal(state.primaryRecommendation?.kind, "risk");
  assert.ok(kinds.has("risk"));
  assert.ok(kinds.has("approval"));
  assert.ok(kinds.has("decision"));
  assert.ok(kinds.has("topology_anchor"));
  assert.ok(state.recommendations.some((recommendation) => recommendation.evidenceLabel.includes("degree")));
  assert.ok(state.recommendations.some((recommendation) => recommendation.edgeIds.length > 0));
});

test("buildWeddingRecommendationExplanationState returns an empty state for fully quiet graphs", () => {
  const graph = buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:vendors",
        title: "Vendor table",
        kind: "vendor_table",
        sourceLinks: [{ label: "Vendor source", url: "https://example.com/vendor" }],
      }),
      artifact({
        id: "artifact:budget",
        title: "Budget sheet",
        kind: "budget_sheet",
        sourceLinks: [{ label: "Quote", url: "https://example.com/quote" }],
      }),
      artifact({ id: "artifact:timeline", title: "Timeline", kind: "timeline" }),
    ],
    taskItems: [{ id: "task", title: "Confirm date", kind: "decision" }],
  });
  const state = buildWeddingRecommendationExplanationState({
    ...graph,
    highDegreeNodes: [],
  });

  assert.equal(state.primaryRecommendation, null);
  assert.deepEqual(state.recommendations, []);
  assert.equal(state.summaryLabel, "No graph-backed wedding recommendations yet.");
});

test("buildWeddingRecommendationExplanationState gives source-verification risks specific next actions", () => {
  const graph = buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:vendors",
        title: "Venue table",
        kind: "vendor_table",
        sourceLabels: ["Agent research"],
      }),
      artifact({ id: "artifact:timeline", title: "Timeline", kind: "timeline" }),
    ],
    taskItems: [{ id: "task", title: "Confirm source evidence", kind: "vendor_follow_up" }],
  });
  const state = buildWeddingRecommendationExplanationState(graph);
  const sourceRisk = state.recommendations.find((recommendation) => recommendation.badges.includes("source verification"));

  assert.ok(sourceRisk);
  assert.equal(sourceRisk.kind, "risk");
  assert.match(sourceRisk.title, /Verify sources for Venue table/);
  assert.match(sourceRisk.body, /no source URL is attached/i);
  assert.match(sourceRisk.nextActionLabel, /add or verify source URLs/i);
  assert.match(sourceRisk.nextActionLabel, /before acting/i);
});

test("buildWeddingRecommendationExplanationState does not expose imported source filenames", () => {
  const graph = buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:imported-budget",
        title: "Imported budget workbook",
        kind: "research",
        metadata: {
          ...metadata,
          artifactKind: "research",
          supertags: ["wedding_import", "wedding_import:spreadsheet", "wedding_import_status:synthesized"],
        },
        sourceLabels: ["original upload saved", "source: private-family-budget.xlsx"],
      }),
      artifact({ id: "artifact:timeline", title: "Timeline", kind: "timeline" }),
    ],
    taskItems: [{ id: "task", title: "Review imported budget evidence", kind: "budget_review" }],
  });
  const state = buildWeddingRecommendationExplanationState(graph);
  const sourceRisk = state.recommendations.find((recommendation) => recommendation.badges.includes("source verification"));
  const serialized = JSON.stringify(state);

  assert.ok(sourceRisk);
  assert.match(sourceRisk.body, /private import source labels redacted/i);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("original upload saved"), false);
});

test("buildWeddingRecommendationExplanationState does not treat selected decisions as open decisions", () => {
  const graph = buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:vendors",
        title: "Venue table",
        kind: "vendor_table",
        vendorLabels: ["Harbour Hall"],
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
      }),
      artifact({
        id: "artifact:budget",
        title: "Budget sheet",
        kind: "budget_sheet",
        sourceLinks: [{ label: "Quote", url: "https://example.com/quote" }],
      }),
      artifact({ id: "artifact:timeline", title: "Timeline", kind: "timeline" }),
    ],
    taskItems: [{ id: "task", title: "Confirm venue", kind: "decision" }],
    decisions: weddingPersistedDecisionRecordsToGraphDecisions([{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:vendors",
      artifactTitle: "Venue table",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected venue.",
      selectedOptionCells: ["Harbour Hall"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }]),
  });
  const state = buildWeddingRecommendationExplanationState(graph);

  assert.equal(state.recommendations.some((recommendation) => recommendation.kind === "decision"), false);
  assert.ok(state.recommendations.some((recommendation) => (
    recommendation.kind === "topology_anchor"
    && /Harbour Hall/i.test(recommendation.title)
  )));
});
