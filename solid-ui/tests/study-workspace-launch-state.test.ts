import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_STUDENT_ONBOARDING_QUICK_START, studentQuickStartForIntent } from "../src/lib/onboardingQuickStart.ts";
import { buildStudyWorkspaceLaunchState } from "../src/lib/studyWorkspaceLaunchState.ts";

test("buildStudyWorkspaceLaunchState only appears for onboarding entry seeds", () => {
  const state = buildStudyWorkspaceLaunchState({
    quickStartSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
    attachedCount: 0,
    supportedCount: 0,
    recommendedSetupReady: true,
    queryReady: true,
  });

  assert.equal(state, null);
});

test("buildStudyWorkspaceLaunchState guides the first upload when launched from onboarding", () => {
  const state = buildStudyWorkspaceLaunchState({
    quickStartSeed: {
      ...DEFAULT_STUDENT_ONBOARDING_QUICK_START,
      entryPoint: "onboarding",
      originLabel: "From onboarding",
    },
    attachedCount: 0,
    supportedCount: 0,
    recommendedSetupReady: true,
    queryReady: true,
  });

  assert.equal(state?.tone, "sky");
  assert.equal(state?.primaryActionId, "pick_files");
  assert.match(state?.headline ?? "", /one real class source/i);
});

test("buildStudyWorkspaceLaunchState allows immediate run once readable study material is ready", () => {
  const state = buildStudyWorkspaceLaunchState({
    quickStartSeed: {
      ...DEFAULT_STUDENT_ONBOARDING_QUICK_START,
      entryPoint: "onboarding",
    },
    attachedCount: 1,
    supportedCount: 1,
    recommendedSetupReady: true,
    queryReady: true,
  });

  assert.equal(state?.tone, "emerald");
  assert.equal(state?.primaryActionId, "run_now");
  assert.match(state?.primaryActionLabel ?? "", /first study pass/i);
});

test("buildStudyWorkspaceLaunchState preserves zettelkasten launch language", () => {
  const seed = {
    ...studentQuickStartForIntent("zettelkasten_chain"),
    entryPoint: "onboarding" as const,
  };
  const state = buildStudyWorkspaceLaunchState({
    quickStartSeed: seed,
    attachedCount: 1,
    supportedCount: 1,
    recommendedSetupReady: true,
    queryReady: true,
  });

  assert.match(state?.headline ?? "", /note-chain run/i);
  assert.match(state?.primaryActionLabel ?? "", /note chain/i);
});
