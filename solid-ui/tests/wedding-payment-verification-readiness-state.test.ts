import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingPaymentVerificationReadinessState } from "@/lib/weddingPaymentVerificationReadinessState";

test("buildWeddingPaymentVerificationReadinessState passes complete receipt proof", () => {
  const state = buildWeddingPaymentVerificationReadinessState({
    trustedReceiptSourceConnected: true,
    vendorInvoiceMatchingReady: true,
    amountAndDueDateChecksReady: true,
    sensitiveReceiptStoragePolicyReady: true,
    auditReceiptPersisted: true,
    manualUploadFallbackReady: true,
    testedPaymentScenarioCount: 3,
    failedPaymentScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /invoice matching/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /3 payment verification scenarios tested/i.test(label)));
});

test("buildWeddingPaymentVerificationReadinessState allows audit-recorded manual receipt review", () => {
  const state = buildWeddingPaymentVerificationReadinessState({
    sensitiveReceiptStoragePolicyReady: true,
    auditReceiptPersisted: true,
    manualUploadFallbackReady: true,
    testedPaymentScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual receipt review/i);
  assert.ok(state.blockerLabels.some((label) => /Trusted receipt or payment source/i.test(label)));
});

test("buildWeddingPaymentVerificationReadinessState blocks failed payment verification scenarios", () => {
  const state = buildWeddingPaymentVerificationReadinessState({
    trustedReceiptSourceConnected: true,
    vendorInvoiceMatchingReady: true,
    amountAndDueDateChecksReady: true,
    sensitiveReceiptStoragePolicyReady: true,
    auditReceiptPersisted: true,
    manualUploadFallbackReady: true,
    testedPaymentScenarioCount: 2,
    failedPaymentScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 payment verification scenario failed/i.test(label)));
});
