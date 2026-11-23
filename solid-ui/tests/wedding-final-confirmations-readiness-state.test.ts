import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingFinalConfirmationsReadinessState } from "@/lib/weddingFinalConfirmationsReadinessState";

test("buildWeddingFinalConfirmationsReadinessState passes complete reminder and payment proof", () => {
  const state = buildWeddingFinalConfirmationsReadinessState({
    vendorConfirmationTasksReady: true,
    approvalUiReady: true,
    emailOrContactExecutorReady: true,
    reminderCadenceReady: true,
    noSpamPolicyReady: true,
    guestFinalCountDecisionReady: true,
    paymentReviewLinked: true,
    auditReceiptsPersisted: true,
    manualFallbackReady: true,
    testedFinalConfirmationScenarioCount: 2,
    failedFinalConfirmationScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /email\/contact executor/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 final-confirmation scenarios tested/i.test(label)));
});

test("buildWeddingFinalConfirmationsReadinessState allows approval-recorded manual handoff", () => {
  const state = buildWeddingFinalConfirmationsReadinessState({
    vendorConfirmationTasksReady: true,
    approvalUiReady: true,
    guestFinalCountDecisionReady: true,
    paymentReviewLinked: true,
    auditReceiptsPersisted: true,
    manualFallbackReady: true,
    testedFinalConfirmationScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual handoffs/i);
  assert.ok(state.blockerLabels.some((label) => /Email\/contact executor/i.test(label)));
});

test("buildWeddingFinalConfirmationsReadinessState blocks failed final-confirmation scenarios", () => {
  const state = buildWeddingFinalConfirmationsReadinessState({
    vendorConfirmationTasksReady: true,
    approvalUiReady: true,
    emailOrContactExecutorReady: true,
    reminderCadenceReady: true,
    noSpamPolicyReady: true,
    guestFinalCountDecisionReady: true,
    paymentReviewLinked: true,
    auditReceiptsPersisted: true,
    manualFallbackReady: true,
    testedFinalConfirmationScenarioCount: 2,
    failedFinalConfirmationScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 final-confirmation scenario failed/i.test(label)));
});
