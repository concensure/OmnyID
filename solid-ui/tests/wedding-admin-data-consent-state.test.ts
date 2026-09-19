import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingAdminDataConsentState } from "@/lib/weddingAdminDataConsentState";

test("buildWeddingAdminDataConsentState keeps admin sharing off by default", () => {
  const state = buildWeddingAdminDataConsentState({ workspaceId: "workspace-1" });

  assert.equal(state.enabled, false);
  assert.equal(state.adminPacketReady, false);
  assert.equal(state.adminPacket, null);
  assert.match(state.hoverMessage, /anonymously|anonymized/i);
  assert.match(state.statusLabel, /off/i);
});

test("buildWeddingAdminDataConsentState creates anonymized admin packet only after explicit consent", () => {
  const state = buildWeddingAdminDataConsentState({
    enabled: true,
    workspaceId: "workspace-1",
    planId: "plan-1",
    submittedResponseCount: 3,
    lastSubmittedAt: "2026-09-14T10:00:00.000Z",
  });

  assert.equal(state.adminPacketReady, true);
  assert.deepEqual(state.adminPacket, {
    workspaceId: "workspace-1",
    planId: "plan-1",
    anonymized: true,
    submittedResponseCount: 3,
    consentSource: "wedding_template_toggle",
  });
  assert.match(state.statusLabel, /last copied/i);
});
