import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRsvpCollectionReadinessState } from "@/lib/weddingRsvpCollectionReadinessState";

test("buildWeddingRsvpCollectionReadinessState passes complete secure RSVP proof", () => {
  const state = buildWeddingRsvpCollectionReadinessState({
    secureLinkProviderConnected: true,
    guestIdentityScopeReady: true,
    mealDietaryAccessibilityFieldsReady: true,
    noThirdPartyTrackingPolicyReady: true,
    responseExportReady: true,
    auditReceiptsPersisted: true,
    manualEntryFallbackReady: true,
    testedRsvpScenarioCount: 3,
    failedRsvpScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /meal, dietary, and accessibility/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /3 RSVP scenarios tested/i.test(label)));
});

test("buildWeddingRsvpCollectionReadinessState allows manual guest-list handoff", () => {
  const state = buildWeddingRsvpCollectionReadinessState({
    guestIdentityScopeReady: true,
    mealDietaryAccessibilityFieldsReady: true,
    auditReceiptsPersisted: true,
    manualEntryFallbackReady: true,
    testedRsvpScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual guest-list handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Secure RSVP link provider/i.test(label)));
});

test("buildWeddingRsvpCollectionReadinessState blocks failed RSVP scenarios", () => {
  const state = buildWeddingRsvpCollectionReadinessState({
    secureLinkProviderConnected: true,
    guestIdentityScopeReady: true,
    mealDietaryAccessibilityFieldsReady: true,
    noThirdPartyTrackingPolicyReady: true,
    responseExportReady: true,
    auditReceiptsPersisted: true,
    manualEntryFallbackReady: true,
    testedRsvpScenarioCount: 2,
    failedRsvpScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 RSVP scenario failed/i.test(label)));
});
