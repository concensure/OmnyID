import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingGraphCanvasReadinessState } from "@/lib/weddingGraphCanvasReadinessState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

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
    proofReferenceLabels: ["graph-canvas:oracle-prod-1:2026-09-28"],
    errorCount: 0,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.deepEqual(state.proofReferenceLabels, ["graph-canvas:oracle-prod-1:2026-09-28"]);
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

test("buildWeddingGraphCanvasReadinessState rejects placeholder proof references", () => {
  const state = buildWeddingGraphCanvasReadinessState({
    focusNodeIds: ["node:venue"],
    focusEdgeIds: ["edge:venue-risk"],
    highlightedNodeIds: ["node:venue"],
    highlightedEdgeIds: ["edge:venue-risk"],
    dimmedOutsideFocus: true,
    arrivalIntentConsumed: true,
    hasClearFocusControl: true,
    hasPathEmphasisLegend: true,
    proofReferenceLabels: ["graph-canvas:placeholder:test"],
  });

  assert.equal(state.status, "blocked");
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.ok(state.blockerLabels.some((label) => /proof reference/i.test(label)));
});

test("buildWeddingGraphCanvasReadinessState rejects bare test proof references while accepting prod-smoke", () => {
  const baseInput = {
    focusNodeIds: ["node:venue"],
    focusEdgeIds: ["edge:venue-risk"],
    highlightedNodeIds: ["node:venue"],
    highlightedEdgeIds: ["edge:venue-risk"],
    dimmedOutsideFocus: true,
    arrivalIntentConsumed: true,
    hasClearFocusControl: true,
    hasPathEmphasisLegend: true,
  };

  const testProof = buildWeddingGraphCanvasReadinessState({
    ...baseInput,
    proofReferenceLabels: ["graph-canvas:test:latest"],
  });
  const prodSmokeProof = buildWeddingGraphCanvasReadinessState({
    ...baseInput,
    proofReferenceLabels: ["graph-canvas:prod-smoke:2026-09-28"],
  });

  assert.equal(testProof.status, "blocked");
  assert.deepEqual(testProof.proofReferenceLabels, []);
  assert.equal(prodSmokeProof.status, "ready");
  assert.deepEqual(prodSmokeProof.proofReferenceLabels, ["graph-canvas:prod-smoke:2026-09-28"]);
});

test("buildWeddingGraphCanvasReadinessState rejects local browser-only proof references", () => {
  const state = buildWeddingGraphCanvasReadinessState({
    focusNodeIds: ["node:venue"],
    focusEdgeIds: ["edge:venue-risk"],
    highlightedNodeIds: ["node:venue"],
    highlightedEdgeIds: ["edge:venue-risk"],
    dimmedOutsideFocus: true,
    arrivalIntentConsumed: true,
    hasClearFocusControl: true,
    hasPathEmphasisLegend: true,
    proofReferenceLabels: [
      "graph-canvas:local-only",
      "http://127.0.0.1:5173/graph-proof",
      "blob:https://omnyid.example/graph-proof",
      "graph-canvas:oracle-prod-1:2026-09-28",
    ],
  });

  assert.equal(state.status, "ready");
  assert.deepEqual(state.proofReferenceLabels, ["graph-canvas:oracle-prod-1:2026-09-28"]);
  assert.ok(state.evidenceLabels.some((label) => /1 durable graph proof reference/i.test(label)));
});

test("buildWeddingGraphCanvasReadinessState bounds noisy focus ids", () => {
  const noisyNode = `  node:${"venue-detail-".repeat(60)}  `;
  const noisyEdge = `edge:${"venue-risk-".repeat(60)}`;
  const state = buildWeddingGraphCanvasReadinessState({
    focusNodeIds: [noisyNode, noisyNode],
    focusEdgeIds: [noisyEdge],
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    dimmedOutsideFocus: false,
    arrivalIntentConsumed: true,
    hasClearFocusControl: true,
    hasPathEmphasisLegend: true,
  });

  assert.equal(state.status, "handoff_only");
  assert.ok(state.evidenceLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.blockerLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.blockerLabels.some((label) => label.endsWith("...")));
});
