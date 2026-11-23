import assert from "node:assert/strict";
import test from "node:test";

import { weddingInitialExperienceMode } from "../src/lib/weddingInitialExperienceState.ts";

test("a signed-in returning couple never sees intake before its saved projection resolves", () => {
  assert.equal(weddingInitialExperienceMode({
    signedIn: true,
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
    onboardingResolved: false,
    workspaceRefreshStatus: null,
    intakeVariantResolved: false,
  }), "resolving");

  assert.equal(weddingInitialExperienceMode({
    signedIn: true,
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: true,
    followUpRequested: false,
    onboardingResolved: true,
    workspaceRefreshStatus: "loaded",
    intakeVariantResolved: true,
  }), "workspace");
});

test("a genuinely new Wedding account opens intake after both account checks resolve", () => {
  assert.equal(weddingInitialExperienceMode({
    signedIn: true,
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
    onboardingResolved: true,
    workspaceRefreshStatus: "loaded",
    intakeVariantResolved: true,
  }), "intake");
});

test("a failed empty refresh never misclassifies a returning account as new", () => {
  assert.equal(weddingInitialExperienceMode({
    signedIn: true,
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
    onboardingResolved: true,
    workspaceRefreshStatus: "error",
    intakeVariantResolved: true,
  }), "retry");
});

test("a guest launch can show intake without waiting for account state", () => {
  assert.equal(weddingInitialExperienceMode({
    signedIn: false,
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
    onboardingResolved: false,
    workspaceRefreshStatus: null,
    intakeVariantResolved: false,
  }), "intake");
});
