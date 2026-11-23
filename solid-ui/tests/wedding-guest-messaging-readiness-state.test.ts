import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingGuestMessagingReadinessState } from "@/lib/weddingGuestMessagingReadinessState";

test("buildWeddingGuestMessagingReadinessState passes complete secure messaging proof", () => {
  const state = buildWeddingGuestMessagingReadinessState({
    secureGuestChannelConnected: true,
    scopedAudienceControlsReady: true,
    optInContactSourceReady: true,
    rateLimitAndNoSpamPolicyReady: true,
    approvalReceiptsPersisted: true,
    deliveryReceiptsAvailable: true,
    emergencyFallbackReady: true,
    testedMessageScenarioCount: 3,
    failedMessageScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /scoped audience/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /3 guest-message scenarios tested/i.test(label)));
});

test("buildWeddingGuestMessagingReadinessState allows approval-recorded coordinator handoff", () => {
  const state = buildWeddingGuestMessagingReadinessState({
    scopedAudienceControlsReady: true,
    approvalReceiptsPersisted: true,
    emergencyFallbackReady: true,
    testedMessageScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /coordinator handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Secure guest messaging channel/i.test(label)));
});

test("buildWeddingGuestMessagingReadinessState blocks missing no-spam proof or failed delivery scenarios", () => {
  const state = buildWeddingGuestMessagingReadinessState({
    secureGuestChannelConnected: true,
    scopedAudienceControlsReady: true,
    optInContactSourceReady: true,
    rateLimitAndNoSpamPolicyReady: false,
    approvalReceiptsPersisted: true,
    deliveryReceiptsAvailable: true,
    emergencyFallbackReady: true,
    testedMessageScenarioCount: 2,
    failedMessageScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /no-spam policy/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /1 guest-message scenario failed/i.test(label)));
});
