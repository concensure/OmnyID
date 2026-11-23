import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingControlledOutreachReadinessState } from "@/lib/weddingControlledOutreachReadinessState";

test("buildWeddingControlledOutreachReadinessState passes complete outreach proof", () => {
  const state = buildWeddingControlledOutreachReadinessState({
    approvalUiReady: true,
    contactInfoConsentReady: true,
    vendorSafePayloadReady: true,
    emailOrContactExecutorReady: true,
    noSpamPolicyReady: true,
    providerSetupFallbackReady: true,
    receiptPersistenceReady: true,
    rejectionPathReady: true,
    testedOutreachScenarioCount: 2,
    failedOutreachScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /contact-info sharing consent/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 controlled-outreach scenarios tested/i.test(label)));
});

test("buildWeddingControlledOutreachReadinessState allows approval-recorded manual handoff", () => {
  const state = buildWeddingControlledOutreachReadinessState({
    approvalUiReady: true,
    contactInfoConsentReady: true,
    vendorSafePayloadReady: true,
    noSpamPolicyReady: true,
    providerSetupFallbackReady: true,
    rejectionPathReady: true,
    testedOutreachScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Email\/contact executor/i.test(label)));
});

test("buildWeddingControlledOutreachReadinessState blocks failed outreach scenarios", () => {
  const state = buildWeddingControlledOutreachReadinessState({
    approvalUiReady: true,
    contactInfoConsentReady: true,
    vendorSafePayloadReady: true,
    emailOrContactExecutorReady: true,
    noSpamPolicyReady: true,
    providerSetupFallbackReady: true,
    receiptPersistenceReady: true,
    rejectionPathReady: true,
    testedOutreachScenarioCount: 2,
    failedOutreachScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 controlled-outreach scenario failed/i.test(label)));
});
