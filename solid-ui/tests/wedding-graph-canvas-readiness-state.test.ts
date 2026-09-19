import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingGraphCanvasReadinessState } from "@/lib/weddingGraphCanvasReadinessState";

test("buildWeddingGraphCanvasReadinessState passes complete visual focus evidence", () => {
  const state = buildWeddingGraphCanvasReadinessState({
    focusNodeIds: ["node:venue", "node:risk"],
    focusEdgeIds: ["edge:venue-risk"],
    highlightedNodeIds: ["node:risk", "node:venue"],
    highlightedEdgeIds: ["edge:venue-risk"],
    dimmedOutsideFocus: true,
    arrivalIntentConsumed: true,
    hasClearFocusControl: true,
    hasPathEmphasisLegend: true,
    errorCount: 0,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.some((label) => /2 focus nodes carried/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /path-emphasis legend visible/i.test(label)));
});

test("buildWeddingGraphCanvasReadinessState treats carried focus without rendering as handoff only", () => {
  const state = buildWeddingGraphCanvasReadinessState({
    focusNodeIds: ["node:venue"],
    focusEdgeIds: ["edge:venue-risk"],
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    dimmedOutsideFocus: false,
    arrivalIntentConsumed: false,
    hasClearFocusControl: false,
    hasPathEmphasisLegend: false,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /carried to Knowledge Graph/i);
  assert.ok(state.blockerLabels.some((label) => /not highlighted/i.test(label)));
});

test("buildWeddingGraphCanvasReadinessState blocks partial or errored highlighting", () => {
  const state = buildWeddingGraphCanvasReadinessState({
    focusNodeIds: ["node:venue", "node:budget"],
    focusEdgeIds: ["edge:venue-budget"],
    highlightedNodeIds: ["node:venue"],
    highlightedEdgeIds: ["edge:venue-budget"],
    dimmedOutsideFocus: true,
    arrivalIntentConsumed: true,
    hasClearFocusControl: false,
    hasPathEmphasisLegend: true,
    errorCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /node:budget/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Clear-focus control/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /1 graph highlighting error/i.test(label)));
});
