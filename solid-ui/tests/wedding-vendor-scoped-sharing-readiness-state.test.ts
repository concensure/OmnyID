import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorScopedSharingReadinessState } from "@/lib/weddingVendorScopedSharingReadinessState";

test("buildWeddingVendorScopedSharingReadinessState passes complete sharing proof", () => {
  const state = buildWeddingVendorScopedSharingReadinessState({
    runSheetPacketGenerationReady: true,
    vendorAudienceScopeReady: true,
    minimumNecessaryFieldsReady: true,
    privacyRedactionReady: true,
    approvalUiReady: true,
    sharingExecutorReady: true,
    accessControlReady: true,
    receiptPersistenceReady: true,
    revocationOrCorrectionReady: true,
    testedSharingScenarioCount: 2,
    failedSharingScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /privacy redaction/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 vendor-scoped sharing scenarios tested/i.test(label)));
});

test("buildWeddingVendorScopedSharingReadinessState allows approval-recorded manual sharing handoff", () => {
  const state = buildWeddingVendorScopedSharingReadinessState({
    runSheetPacketGenerationReady: true,
    vendorAudienceScopeReady: true,
    minimumNecessaryFieldsReady: true,
    privacyRedactionReady: true,
    approvalUiReady: true,
    revocationOrCorrectionReady: true,
    testedSharingScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Sharing executor/i.test(label)));
});

test("buildWeddingVendorScopedSharingReadinessState blocks failed sharing scenarios", () => {
  const state = buildWeddingVendorScopedSharingReadinessState({
    runSheetPacketGenerationReady: true,
    vendorAudienceScopeReady: true,
    minimumNecessaryFieldsReady: true,
    privacyRedactionReady: true,
    approvalUiReady: true,
    sharingExecutorReady: true,
    accessControlReady: true,
    receiptPersistenceReady: true,
    revocationOrCorrectionReady: true,
    testedSharingScenarioCount: 2,
    failedSharingScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 vendor-scoped sharing scenario failed/i.test(label)));
});
