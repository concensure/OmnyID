import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCoworkingJourneyState } from "@/lib/weddingCoworkingJourneyState";

test("coworking journey keeps a solo plan private until an invitation is accepted", () => {
  const state = buildWeddingCoworkingJourneyState({});
  assert.equal(state.stage, "private");
  assert.match(state.currentStep, /private/i);
  assert.match(state.nextStep, /invite one partner/i);
  assert.match(state.followingStep, /accept/i);
});

test("coworking journey distinguishes a pending invitation from shared access", () => {
  const state = buildWeddingCoworkingJourneyState({ invites: [{ status: "pending" }] });
  assert.equal(state.stage, "invited");
  assert.match(state.currentStep, /grants no access yet/i);
  assert.match(state.nextStep, /signs in/i);
});

test("coworking journey uses the accepted co-owner identity for the next task", () => {
  const state = buildWeddingCoworkingJourneyState({
    members: [
      { role: "owner", display_name: "Mia" },
      { role: "co_owner", display_name: "Jordan" },
    ],
  });
  assert.equal(state.stage, "shared");
  assert.deepEqual(state.partnerNames, ["Jordan"]);
  assert.match(state.currentStep, /Jordan can open/i);
  assert.match(state.nextStep, /Jordan/i);
  assert.match(state.followingStep, /before any enquiry or commitment/i);
});

test("coworking journey requires a fresh invitation after expiry or revocation", () => {
  for (const status of ["expired", "revoked"] as const) {
    const state = buildWeddingCoworkingJourneyState({ invites: [{ status }] });
    assert.equal(state.stage, "renew");
    assert.match(state.nextStep, /fresh seven-day/i);
    assert.match(state.followingStep, /own account/i);
  }
});
