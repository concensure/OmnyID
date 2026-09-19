import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRunSheetAdjustmentReadinessState } from "@/lib/weddingRunSheetAdjustmentReadinessState";

test("buildWeddingRunSheetAdjustmentReadinessState passes complete adjustment proof", () => {
  const state = buildWeddingRunSheetAdjustmentReadinessState({
    delayOptionModelReady: true,
    dependencyImpactPreviewReady: true,
    approvalUiReady: true,
    dragOrButtonAdjustmentReady: true,
    calendarTaskProjectionReady: true,
    receiptPersistenceReady: true,
    coordinatorFallbackReady: true,
    testedAdjustmentScenarioCount: 2,
    failedAdjustmentScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /dependency impact preview/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 run-sheet adjustment scenarios tested/i.test(label)));
});

test("buildWeddingRunSheetAdjustmentReadinessState allows approval-recorded coordinator handoff", () => {
  const state = buildWeddingRunSheetAdjustmentReadinessState({
    delayOptionModelReady: true,
    dependencyImpactPreviewReady: true,
    approvalUiReady: true,
    calendarTaskProjectionReady: true,
    coordinatorFallbackReady: true,
    testedAdjustmentScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /coordinator handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Drag\/button adjustment controls/i.test(label)));
});

test("buildWeddingRunSheetAdjustmentReadinessState blocks failed adjustment scenarios", () => {
  const state = buildWeddingRunSheetAdjustmentReadinessState({
    delayOptionModelReady: true,
    dependencyImpactPreviewReady: true,
    approvalUiReady: true,
    dragOrButtonAdjustmentReady: true,
    calendarTaskProjectionReady: true,
    receiptPersistenceReady: true,
    coordinatorFallbackReady: true,
    testedAdjustmentScenarioCount: 2,
    failedAdjustmentScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 run-sheet adjustment scenario failed/i.test(label)));
});
