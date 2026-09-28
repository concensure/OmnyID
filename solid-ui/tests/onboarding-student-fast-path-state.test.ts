import assert from "node:assert/strict";
import test from "node:test";

import { buildOnboardingStudentFastPathState } from "../src/lib/onboardingStudentFastPathState.ts";

test("buildOnboardingStudentFastPathState prioritizes immediate study value over preference setup", () => {
  const state = buildOnboardingStudentFastPathState({
    currentStep: 1,
    totalSteps: 4,
  });

  assert.equal(state.eyebrow, "Student fast path");
  assert.equal(state.primaryActionLabel, "Skip to study quick start");
  assert.match(state.headline, /connected notes/i);
  assert.match(state.detail, /extracted-note retention/i);
  assert.match(state.detail, /supertag\/graph reuse/i);
  assert.deepEqual(state.chips, [
    "lecture slides",
    "readings",
    "assignment briefs",
    "voice memos",
  ]);
});

test("buildOnboardingStudentFastPathState softens copy near the final setup step", () => {
  const state = buildOnboardingStudentFastPathState({
    currentStep: 4,
    totalSteps: 4,
  });

  assert.match(state.detail, /finish preferences later/i);
});
