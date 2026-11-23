import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDayOfEmergencyReadinessState } from "@/lib/weddingDayOfEmergencyReadinessState";

test("buildWeddingDayOfEmergencyReadinessState passes complete emergency proof", () => {
  const state = buildWeddingDayOfEmergencyReadinessState({
    emergencyPlaybooksReady: true,
    vendorNoShowFallbackReady: true,
    weatherEmergencyActivationReady: true,
    verifiedWeatherOrSourceReady: true,
    scopedNotificationReady: true,
    approvalUiReady: true,
    executorReady: true,
    auditReceiptReady: true,
    manualCoordinatorFallbackReady: true,
    testedEmergencyScenarioCount: 2,
    failedEmergencyScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /vendor no-show fallback/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 day-of emergency scenarios tested/i.test(label)));
});

test("buildWeddingDayOfEmergencyReadinessState allows approval-recorded coordinator handoff", () => {
  const state = buildWeddingDayOfEmergencyReadinessState({
    emergencyPlaybooksReady: true,
    vendorNoShowFallbackReady: true,
    weatherEmergencyActivationReady: true,
    approvalUiReady: true,
    auditReceiptReady: true,
    manualCoordinatorFallbackReady: true,
    testedEmergencyScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /coordinator handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Verified weather\/source evidence/i.test(label)));
});

test("buildWeddingDayOfEmergencyReadinessState blocks failed emergency scenarios", () => {
  const state = buildWeddingDayOfEmergencyReadinessState({
    emergencyPlaybooksReady: true,
    vendorNoShowFallbackReady: true,
    weatherEmergencyActivationReady: true,
    verifiedWeatherOrSourceReady: true,
    scopedNotificationReady: true,
    approvalUiReady: true,
    executorReady: true,
    auditReceiptReady: true,
    manualCoordinatorFallbackReady: true,
    testedEmergencyScenarioCount: 2,
    failedEmergencyScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 day-of emergency scenario failed/i.test(label)));
});
