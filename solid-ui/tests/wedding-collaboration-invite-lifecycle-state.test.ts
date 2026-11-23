import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaboratorInviteLifecycleState } from "../src/lib/weddingCollaborationInviteLifecycleState.ts";

test("buildWeddingCollaboratorInviteLifecycleState blocks expired invites", () => {
  const state = buildWeddingCollaboratorInviteLifecycleState({
    status: "invited",
    expiresAt: "2026-01-01T00:00:00Z",
    nowIso: "2026-02-01T00:00:00Z",
  });

  assert.equal(state.lifecycleLabel, "Expired");
  assert.equal(state.canGrantAccess, false);
  assert.ok(state.riskLabels.includes("Expired invites must not grant workspace access."));
});

test("buildWeddingCollaboratorInviteLifecycleState blocks revoked invites", () => {
  const state = buildWeddingCollaboratorInviteLifecycleState({
    status: "accepted",
    revokedAt: "2026-01-01T00:00:00Z",
    nowIso: "2026-02-01T00:00:00Z",
  });

  assert.equal(state.lifecycleLabel, "Revoked");
  assert.equal(state.canGrantAccess, false);
  assert.match(state.nextActionLabel, /fresh invite/i);
});

test("buildWeddingCollaboratorInviteLifecycleState flags stale accepted access", () => {
  const state = buildWeddingCollaboratorInviteLifecycleState({
    status: "accepted",
    lastActiveAt: "2026-01-01T00:00:00Z",
    nowIso: "2026-02-15T00:00:00Z",
  });

  assert.equal(state.lifecycleLabel, "Accepted, inactive");
  assert.equal(state.canGrantAccess, true);
  assert.ok(state.riskLabels.includes("No recent activity; review or revoke stale access."));
});

test("buildWeddingCollaboratorInviteLifecycleState treats drafts and sent invites as non-granting", () => {
  const draft = buildWeddingCollaboratorInviteLifecycleState({ status: "draft" });
  const invited = buildWeddingCollaboratorInviteLifecycleState({ status: "invited" });

  assert.equal(draft.canGrantAccess, false);
  assert.equal(invited.canGrantAccess, false);
  assert.equal(draft.lifecycleLabel, "Draft");
  assert.equal(invited.lifecycleLabel, "Invite sent");
});
