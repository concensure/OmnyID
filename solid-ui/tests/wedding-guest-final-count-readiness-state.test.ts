import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingGuestFinalCountReadinessState } from "@/lib/weddingGuestFinalCountReadinessState";

test("buildWeddingGuestFinalCountReadinessState passes complete final-count proof", () => {
  const state = buildWeddingGuestFinalCountReadinessState({
    rsvpCountSourceReady: true,
    catererDeadlineKnown: true,
    waitRiskOptionReady: true,
    budgetImpactOptionReady: true,
    approvalUiReady: true,
    submissionExecutorReady: true,
    auditReceiptReady: true,
    manualFallbackReady: true,
    testedGuestCountScenarioCount: 2,
    failedGuestCountScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /RSVP count source/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 guest final-count scenarios tested/i.test(label)));
});

test("buildWeddingGuestFinalCountReadinessState allows approval-recorded manual handoff", () => {
  const state = buildWeddingGuestFinalCountReadinessState({
    rsvpCountSourceReady: true,
    catererDeadlineKnown: true,
    waitRiskOptionReady: true,
    budgetImpactOptionReady: true,
    approvalUiReady: true,
    auditReceiptReady: true,
    manualFallbackReady: true,
    testedGuestCountScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual handoffs/i);
  assert.ok(state.blockerLabels.some((label) => /submission executor/i.test(label)));
});

test("buildWeddingGuestFinalCountReadinessState blocks failed final-count scenarios", () => {
  const state = buildWeddingGuestFinalCountReadinessState({
    rsvpCountSourceReady: true,
    catererDeadlineKnown: true,
    waitRiskOptionReady: true,
    budgetImpactOptionReady: true,
    approvalUiReady: true,
    submissionExecutorReady: true,
    auditReceiptReady: true,
    manualFallbackReady: true,
    testedGuestCountScenarioCount: 2,
    failedGuestCountScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 guest final-count scenario failed/i.test(label)));
});
