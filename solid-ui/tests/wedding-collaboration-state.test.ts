import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaborationState } from "../src/lib/weddingCollaborationState.ts";

test("buildWeddingCollaborationState exposes role capabilities and conservative blockers", () => {
  const state = buildWeddingCollaborationState();

  assert.equal(state.productionReady, false);
  assert.equal(state.statusLabel, "Collaboration scaffolded");
  assert.deepEqual(state.roleCards.map((card) => card.role), ["co_owner", "planner", "contributor", "viewer"]);
  assert.deepEqual(state.roleAssignmentOptions.map((card) => card.role), ["co_owner", "planner", "contributor", "viewer"]);
  assert.match(state.roleAssignmentOptions[0]?.hoverHelpLabel ?? "", /Co-owner: Partner-level access/);
  assert.match(state.roleAssignmentOptions[1]?.mobileDisclosureLabel ?? "", /Tap to review wedding planner permissions/);
  assert.deepEqual(state.editingSurfaces.map((surface) => surface.id), [
    "planning_files",
    "budget_guest_timeline",
    "assigned_tasks",
    "sensitive_decisions",
  ]);
  assert.ok(state.roleCards.find((card) => card.role === "co_owner")?.capabilityLabels.some((label) => /Approve vendor/.test(label)));
  assert.ok(state.roleCards.find((card) => card.role === "planner")?.restrictionLabels.some((label) => /billing/.test(label)));
  assert.ok(state.blockerLabels.includes("Workspace ACL backend not connected"));
  assert.ok(state.blockerLabels.includes("Shared E2EE key distribution not proven"));
  assert.ok(state.editingSurfaces[0]?.blockerLabels.includes("Workspace ACL backend not connected"));
  assert.equal(state.permissionProofCards.length, 4);
  assert.equal(state.permissionProofCards.every((card) => card.allowed === false), true);
  assert.deepEqual(state.editingSurfaces.find((surface) => surface.id === "sensitive_decisions")?.editorRoleLabels, ["Co-owner"]);
  assert.deepEqual(state.editingSurfaces.find((surface) => surface.id === "assigned_tasks")?.editorRoleLabels, ["Co-owner", "Wedding planner", "Contributor"]);
});

test("buildWeddingCollaborationState validates collaborator invites", () => {
  const state = buildWeddingCollaborationState({
    nowIso: "2026-02-15T00:00:00Z",
    invites: [
      {
        email: "partner@example.com",
        displayName: "Partner",
        role: "co_owner",
        status: "invited",
        invitedBy: "owner",
      },
      {
        email: "not-an-email",
        displayName: "Mum",
        role: "viewer",
        status: "draft",
      },
      {
        email: "planner@example.com",
        displayName: "Planner",
        role: null,
      },
      {
        email: "former@example.com",
        displayName: "Former planner",
        role: "planner",
        status: "accepted",
        revokedAt: "2026-02-01T00:00:00Z",
      },
      {
        email: "stale@example.com",
        displayName: "Stale helper",
        role: "contributor",
        status: "accepted",
        lastActiveAt: "2026-01-01T00:00:00Z",
      },
    ],
  });

  assert.equal(state.invites.length, 5);
  assert.equal(state.readyInviteCount, 1);
  assert.equal(state.invites[0]?.roleLabel, "Co-owner");
  assert.match(state.invites[0]?.roleSummaryLabel ?? "", /Partner-level access/);
  assert.ok(state.invites[0]?.roleCapabilityLabels.some((label) => /Approve vendor selections/.test(label)));
  assert.ok(state.invites[0]?.roleRestrictionLabels.some((label) => /billing/.test(label)));
  assert.equal(state.invites[0]?.readyForInvite, true);
  assert.deepEqual(state.invites[1]?.missingLabels, ["valid email required"]);
  assert.deepEqual(state.invites[2]?.missingLabels, ["role defaults to viewer until selected"]);
  assert.equal(state.invites[3]?.lifecycleLabel, "Revoked");
  assert.equal(state.invites[3]?.canGrantAccess, false);
  assert.equal(state.invites[4]?.lifecycleLabel, "Accepted, inactive");
  assert.deepEqual(state.invites[4]?.riskLabels, ["No recent activity; review or revoke stale access."]);
  assert.ok(state.warningLabels.some((label) => /Mum: valid email required/.test(label)));
});

test("buildWeddingCollaborationState only becomes production-ready when required controls are ready", () => {
  const state = buildWeddingCollaborationState({
    backendReady: true,
    encryptionReady: true,
    auditReady: true,
    conflictPolicyReady: true,
  });

  assert.equal(state.productionReady, true);
  assert.equal(state.statusLabel, "Collaboration ready");
  assert.equal(state.blockerLabels.length, 0);
  assert.equal(state.permissionProofCards.every((card) => card.allowed), true);
});
