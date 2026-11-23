import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingLiveRunSheetExecutionReadinessState } from "@/lib/weddingLiveRunSheetExecutionReadinessState";

test("buildWeddingLiveRunSheetExecutionReadinessState passes complete live execution proof", () => {
  const state = buildWeddingLiveRunSheetExecutionReadinessState({
    liveDelayIntakeConnected: true,
    dependencyRecalculationReady: true,
    scopedNotificationRoutesReady: true,
    approvalReceiptsPersisted: true,
    offlineFallbackReady: true,
    testedScenarioCount: 3,
    failedScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /dependency recalculation/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /3 live run-sheet scenarios tested/i.test(label)));
});

test("buildWeddingLiveRunSheetExecutionReadinessState allows approval-recorded coordinator handoff", () => {
  const state = buildWeddingLiveRunSheetExecutionReadinessState({
    approvalReceiptsPersisted: true,
    offlineFallbackReady: true,
    testedScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /coordinator handoff/i);
  assert.ok(state.blockerLabels.some((label) => /vendor-delay intake/i.test(label)));
});

test("buildWeddingLiveRunSheetExecutionReadinessState blocks missing fallback or failed scenarios", () => {
  const state = buildWeddingLiveRunSheetExecutionReadinessState({
    liveDelayIntakeConnected: true,
    dependencyRecalculationReady: true,
    scopedNotificationRoutesReady: true,
    approvalReceiptsPersisted: true,
    offlineFallbackReady: false,
    testedScenarioCount: 2,
    failedScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /fallback/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /1 live run-sheet scenario failed/i.test(label)));
});
