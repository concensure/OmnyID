import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorComparisonUiReadinessState } from "../src/lib/weddingVendorComparisonUiReadinessState.ts";

const readyInput = {
  comparisonTableMounted: true,
  expandableTopFiveControlMounted: true,
  multiSelectControlsMounted: true,
  sourceLinkActionsMounted: true,
  confirmSelectedActionMounted: true,
  followUpQueueActionMounted: true,
  approvalGatingCopyMounted: true,
  selectedVendorProjectionMounted: true,
  unselectedVendorQueueSuppressionMounted: true,
  closedVendorHistoryMounted: true,
  malformedSourceUrlGuardMounted: true,
  localSourceUrlGuardMounted: true,
};

test("vendor comparison UI readiness passes only with dynamic selection and source safeguards", () => {
  const state = buildWeddingVendorComparisonUiReadinessState(readyInput);

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.ok(state.evidenceLabels.includes("Top-five expansion control mounted"));
  assert.ok(state.evidenceLabels.includes("Multi-select vendor controls mounted"));
  assert.ok(state.evidenceLabels.includes("Per-vendor source link actions mounted"));
  assert.ok(state.evidenceLabels.includes("Selected-vendor projection fan-out mounted"));
  assert.ok(state.evidenceLabels.includes("Unselected vendor queue suppression mounted"));
  assert.ok(state.evidenceLabels.includes("Closed vendor history surface mounted"));
  assert.ok(state.evidenceLabels.includes("Local source URL guard mounted"));
  assert.deepEqual(state.blockerLabels, []);
});

test("vendor comparison UI readiness blocks missing expansion, follow-up, history, and URL guards", () => {
  const state = buildWeddingVendorComparisonUiReadinessState({
    ...readyInput,
    expandableTopFiveControlMounted: false,
    followUpQueueActionMounted: false,
    closedVendorHistoryMounted: false,
    malformedSourceUrlGuardMounted: false,
    localSourceUrlGuardMounted: false,
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(state.blockerLabels.includes("Top-five expansion control is not mounted."));
  assert.ok(state.blockerLabels.includes("Follow-up queue action is not mounted."));
  assert.ok(state.blockerLabels.includes("Closed vendor history surface is not mounted."));
  assert.ok(state.blockerLabels.includes("Malformed source URL guard is not mounted."));
  assert.ok(state.blockerLabels.includes("Local source URL guard is not mounted."));
  assert.ok(
    state.nextActionLabels.includes("Mount the expansion control so users can grow the comparison from top three to top five."),
  );
  assert.ok(state.nextActionLabels.includes("Mount the action that opens approval-gated follow-up work."));
  assert.ok(state.nextActionLabels.includes("Keep vendors the user stops pursuing in response-queue history."));
  assert.equal(state.telemetryEvent, "wedding_vendor_comparison_ui_readiness_blocked");
});
