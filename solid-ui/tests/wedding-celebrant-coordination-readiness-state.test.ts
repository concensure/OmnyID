import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCelebrantCoordinationReadinessState } from "@/lib/weddingCelebrantCoordinationReadinessState";

test("buildWeddingCelebrantCoordinationReadinessState passes complete celebrant proof", () => {
  const state = buildWeddingCelebrantCoordinationReadinessState({
    australianLegalSetupReady: true,
    officialRegisterSourceReady: true,
    locationScopeReady: true,
    vendorSearchProviderReady: true,
    noimGuardrailsReady: true,
    noBookingNoLodgementCaveatReady: true,
    approvalUiReady: true,
    contactExecutorReady: true,
    testedCelebrantScenarioCount: 2,
    failedCelebrantScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /official celebrant register/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2 celebrant coordination scenarios tested/i.test(label)));
});

test("buildWeddingCelebrantCoordinationReadinessState allows official-source planning handoff", () => {
  const state = buildWeddingCelebrantCoordinationReadinessState({
    australianLegalSetupReady: true,
    officialRegisterSourceReady: true,
    locationScopeReady: true,
    noimGuardrailsReady: true,
    noBookingNoLodgementCaveatReady: true,
    testedCelebrantScenarioCount: 1,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /official-source planning handoff/i);
  assert.ok(state.blockerLabels.some((label) => /search provider/i.test(label)));
});

test("buildWeddingCelebrantCoordinationReadinessState blocks failed celebrant scenarios", () => {
  const state = buildWeddingCelebrantCoordinationReadinessState({
    australianLegalSetupReady: true,
    officialRegisterSourceReady: true,
    locationScopeReady: true,
    vendorSearchProviderReady: true,
    noimGuardrailsReady: true,
    noBookingNoLodgementCaveatReady: true,
    approvalUiReady: true,
    contactExecutorReady: true,
    testedCelebrantScenarioCount: 2,
    failedCelebrantScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 celebrant coordination scenario failed/i.test(label)));
});
