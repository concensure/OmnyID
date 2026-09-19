import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingSeatingChartReadinessState } from "@/lib/weddingSeatingChartReadinessState";

test("buildWeddingSeatingChartReadinessState passes complete interactive seating proof", () => {
  const state = buildWeddingSeatingChartReadinessState({
    focusedCanvasReady: true,
    householdGroupingReady: true,
    vipAndRoleConstraintsReady: true,
    sensitiveSeatingConstraintsReady: true,
    accessibilityNeedsReady: true,
    dragAndButtonControlsReady: true,
    revisionHistoryReady: true,
    exportOrVendorBriefReady: true,
    testedSeatingScenarioCount: 3,
    failedSeatingScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /button controls/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /3 seating scenarios tested/i.test(label)));
});

test("buildWeddingSeatingChartReadinessState allows structured vendor-brief handoff", () => {
  const state = buildWeddingSeatingChartReadinessState({
    householdGroupingReady: true,
    sensitiveSeatingConstraintsReady: true,
    accessibilityNeedsReady: true,
    exportOrVendorBriefReady: true,
    testedSeatingScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /vendor-brief handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Focused seating canvas/i.test(label)));
});

test("buildWeddingSeatingChartReadinessState blocks failed seating scenarios", () => {
  const state = buildWeddingSeatingChartReadinessState({
    focusedCanvasReady: true,
    householdGroupingReady: true,
    vipAndRoleConstraintsReady: true,
    sensitiveSeatingConstraintsReady: true,
    accessibilityNeedsReady: true,
    dragAndButtonControlsReady: true,
    revisionHistoryReady: true,
    exportOrVendorBriefReady: true,
    testedSeatingScenarioCount: 2,
    failedSeatingScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 seating scenario failed/i.test(label)));
});
