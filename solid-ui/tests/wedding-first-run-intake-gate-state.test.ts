import test from "node:test";
import assert from "node:assert/strict";

import { shouldShowWeddingFirstRunIntake } from "../src/lib/weddingFirstRunIntakeGateState.ts";

test("wedding first-run intake appears for a template launch with no saved workspace", () => {
  assert.equal(shouldShowWeddingFirstRunIntake({
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
  }), true);
});

test("wedding first-run intake stays hidden once saved workspace content exists", () => {
  assert.equal(shouldShowWeddingFirstRunIntake({
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: true,
    followUpRequested: false,
  }), false);
});

test("wedding first-run intake yields to generated follow-up workspace", () => {
  assert.equal(shouldShowWeddingFirstRunIntake({
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: true,
  }), false);
});

test("wedding first-run intake stays hidden without a template launch", () => {
  assert.equal(shouldShowWeddingFirstRunIntake({
    hasTemplateLaunch: false,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
  }), false);
});
