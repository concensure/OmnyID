import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingAdminDataConsentState } from "@/lib/weddingAdminDataConsentState";

test("buildWeddingAdminDataConsentState keeps admin sharing off by default", () => {
  const state = buildWeddingAdminDataConsentState({ workspaceId: "workspace-1" });

  assert.equal(state.enabled, false);
  assert.match(state.hoverMessage, /off by default/i);
  assert.match(state.statusLabel, /off/i);
  assert.match(state.statusLabel, /does not change/i);
  assert.ok(state.excludedLabels.includes("message or draft text"));
});

test("buildWeddingAdminDataConsentState describes only content-free counts after explicit consent", () => {
  const state = buildWeddingAdminDataConsentState({
    enabled: true,
    workspaceId: "workspace-1",
    planId: "plan-1",
    submittedResponseCount: 3,
    lastSubmittedAt: "2026-09-14T10:00:00.000Z",
  });

  assert.equal(state.enabled, true);
  assert.match(state.statusLabel, /statistics are on/i);
  assert.deepEqual(state.includedLabels, ["onboarding completed", "vendor saved", "decision resolved"]);
  assert.ok(state.excludedLabels.includes("budget and guest count"));
});
