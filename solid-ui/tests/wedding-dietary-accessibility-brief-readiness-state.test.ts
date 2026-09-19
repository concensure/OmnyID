import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDietaryAccessibilityBriefReadinessState } from "@/lib/weddingDietaryAccessibilityBriefReadinessState";

test("buildWeddingDietaryAccessibilityBriefReadinessState passes complete vendor brief proof", () => {
  const state = buildWeddingDietaryAccessibilityBriefReadinessState({
    verifiedRsvpCountsReady: true,
    dietaryCategoriesNormalized: true,
    allergySeverityHandlingReady: true,
    accessibilityNeedsScoped: true,
    vendorAudienceScopeReady: true,
    approvalReceiptsPersisted: true,
    deliveryOrExportReady: true,
    correctionLoopReady: true,
    testedBriefScenarioCount: 2,
    failedBriefScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /allergy severity/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 dietary\/accessibility brief scenarios tested/i.test(label)));
});

test("buildWeddingDietaryAccessibilityBriefReadinessState allows approval-recorded manual handoff", () => {
  const state = buildWeddingDietaryAccessibilityBriefReadinessState({
    verifiedRsvpCountsReady: true,
    vendorAudienceScopeReady: true,
    approvalReceiptsPersisted: true,
    correctionLoopReady: true,
    testedBriefScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual handoffs/i);
  assert.ok(state.blockerLabels.some((label) => /Dietary categories/i.test(label)));
});

test("buildWeddingDietaryAccessibilityBriefReadinessState blocks failed brief scenarios", () => {
  const state = buildWeddingDietaryAccessibilityBriefReadinessState({
    verifiedRsvpCountsReady: true,
    dietaryCategoriesNormalized: true,
    allergySeverityHandlingReady: true,
    accessibilityNeedsScoped: true,
    vendorAudienceScopeReady: true,
    approvalReceiptsPersisted: true,
    deliveryOrExportReady: true,
    correctionLoopReady: true,
    testedBriefScenarioCount: 2,
    failedBriefScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 dietary\/accessibility brief scenario failed/i.test(label)));
});
