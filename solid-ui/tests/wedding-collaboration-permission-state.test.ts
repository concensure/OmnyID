import assert from "node:assert/strict";
import test from "node:test";

import { evaluateWeddingCollaborationPermission } from "../src/lib/weddingCollaborationPermissionState.ts";

const readyControls = {
  backendReady: true,
  encryptionReady: true,
  auditReady: true,
  conflictPolicyReady: true,
};

test("evaluateWeddingCollaborationPermission allows co-owner sensitive edits only when controls are ready", () => {
  const blocked = evaluateWeddingCollaborationPermission({
    role: "co_owner",
    action: "edit",
    surfaceId: "sensitive_decisions",
  });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.statusLabel, "Blocked");
  assert.ok(blocked.blockerLabels.includes("Workspace ACL backend not connected"));
  assert.ok(blocked.blockerLabels.includes("Shared E2EE key distribution not proven"));
  assert.ok(blocked.blockerLabels.includes("Per-collaborator audit trail not connected"));
  assert.ok(blocked.blockerLabels.includes("Concurrent edit conflict policy not connected"));

  const allowed = evaluateWeddingCollaborationPermission({
    role: "co_owner",
    action: "edit",
    surfaceId: "sensitive_decisions",
    ...readyControls,
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.statusLabel, "Allowed");
  assert.deepEqual(allowed.requiredRoleLabels, ["Co-owner"]);
});

test("evaluateWeddingCollaborationPermission keeps planners out of owner-only controls", () => {
  const decision = evaluateWeddingCollaborationPermission({
    role: "planner",
    action: "change_sensitive_setting",
    surfaceId: "sensitive_decisions",
    ...readyControls,
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.requiredRoleLabels, ["Co-owner"]);
  assert.ok(decision.blockerLabels.includes("Wedding planner cannot change sensitive settings for sensitive decisions and approvals."));
});

test("evaluateWeddingCollaborationPermission allows planner planning edits after production controls", () => {
  const decision = evaluateWeddingCollaborationPermission({
    role: "planner",
    action: "edit",
    surfaceId: "planning_files",
    ...readyControls,
  });

  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.requiredRoleLabels, ["Co-owner", "Wedding planner"]);
});

test("evaluateWeddingCollaborationPermission limits contributor edits to assigned tasks", () => {
  const assignedTaskDecision = evaluateWeddingCollaborationPermission({
    role: "contributor",
    action: "edit",
    surfaceId: "assigned_tasks",
    ...readyControls,
  });
  const budgetDecision = evaluateWeddingCollaborationPermission({
    role: "contributor",
    action: "edit",
    surfaceId: "budget_guest_timeline",
    ...readyControls,
  });

  assert.equal(assignedTaskDecision.allowed, true);
  assert.equal(budgetDecision.allowed, false);
  assert.ok(budgetDecision.blockerLabels.includes("Contributor cannot edit budget, guest list, and timeline."));
});

test("evaluateWeddingCollaborationPermission keeps viewers read-only", () => {
  const viewDecision = evaluateWeddingCollaborationPermission({
    role: "viewer",
    action: "view",
    surfaceId: "planning_files",
    ...readyControls,
  });
  const editDecision = evaluateWeddingCollaborationPermission({
    role: "viewer",
    action: "edit",
    surfaceId: "planning_files",
    ...readyControls,
  });

  assert.equal(viewDecision.allowed, true);
  assert.equal(editDecision.allowed, false);
  assert.ok(editDecision.blockerLabels.includes("Viewer cannot edit wedding documents and replies."));
});
