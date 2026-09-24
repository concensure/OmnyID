import assert from "node:assert/strict";
import test from "node:test";

import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryEventInvitation,
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryPolicy,
  WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";
import { buildWeddingBoundaryTopologyState } from "@/lib/weddingBoundaryTopologyState";

const metadata = {
  weddingPlanId: "wedding_plan:harbour",
  responseWorkspaceId: "response_workspace:harbour",
};

const policy: WeddingBoundaryPolicy = {
  id: "policy:no-extra-plus-ones",
  kind: "wedding_boundary_policy",
  title: "No extra plus-ones",
  status: "active",
  visibility: "family_visible",
  ruleType: "plus_one",
  enforcement: "require_approval",
  scope: "guest_list",
  plainLanguage: "We are not adding extra plus-ones unless both of us approve it.",
};

const household: WeddingBoundaryHousehold = {
  id: "household:smith",
  kind: "wedding_boundary_household",
  householdId: "household:smith",
  title: "Smith family",
  displayName: "Smith family",
  visibility: "family_visible",
  primaryContactPersonId: "person:janet",
  memberPersonIds: ["person:janet", "person:taylor"],
};

const guest: WeddingBoundaryGuestProfile = {
  id: "person:taylor",
  kind: "wedding_boundary_guest_profile",
  personId: "person:taylor",
  title: "Taylor Smith",
  displayName: "Taylor Smith",
  visibility: "approved_shared",
  householdId: "household:smith",
  ageBand: "adult",
};

const role: WeddingBoundaryRoleAssignment = {
  id: "role:janet",
  kind: "wedding_boundary_role_assignment",
  title: "Janet family access",
  visibility: "approved_shared",
  personId: "person:janet",
  role: "parent_family",
  canView: ["approved_guest_names"],
  canSuggest: ["plus_one_change"],
  canEdit: [],
  requiresApprovalFor: ["plus_one_change"],
};

const invitation: WeddingBoundaryEventInvitation = {
  id: "invite:taylor:reception",
  kind: "wedding_boundary_event_invitation",
  invitationId: "invite:taylor:reception",
  title: "Taylor reception invitation",
  visibility: "approved_shared",
  eventId: "event:reception",
  personId: "person:taylor",
  invitationStatus: "invited",
  plusOneAllowed: false,
  visibleToGuest: true,
};

const request: WeddingBoundaryChangeRequest = {
  id: "change:taylor-plus-one",
  kind: "wedding_boundary_change_request",
  requestId: "change:taylor-plus-one",
  title: "Add Taylor's plus-one",
  visibility: "approved_shared",
  requestedBy: "person:janet",
  changeType: "plus_one_change",
  targetPersonId: "person:taylor",
  targetEventId: "event:reception",
  requestStatus: "pending",
  approvalRequired: true,
  policyIds: ["policy:no-extra-plus-ones"],
};

test("buildWeddingBoundaryTopologyState creates queryable household role invitation and approval edges", () => {
  const state = buildWeddingBoundaryTopologyState({
    metadata,
    objects: [policy, household, guest, role, invitation, request],
  });

  assert.match(state.summaryLabel, /boundary nodes?/);
  assert.ok(state.nodes.some((node) => node.kind === "boundary_policy" && node.supertags.includes("wedding_policy:plus_one")));
  assert.ok(state.nodes.some((node) => node.kind === "boundary_role" && node.supertags.includes("wedding_boundary_role:parent_family")));
  assert.ok(state.nodes.some((node) => node.kind === "guest" && node.label === "Taylor Smith"));
  assert.ok(state.nodes.some((node) => node.kind === "wedding_event" && node.label === "Reception"));
  assert.ok(state.nodes.some((node) => node.kind === "change_request" && node.supertags.includes("wedding_boundary:approval_required")));
  assert.ok(state.edges.some((edge) => edge.kind === "member_of_household"));
  assert.ok(state.edges.some((edge) => edge.kind === "role_grants_visibility"));
  assert.ok(state.edges.some((edge) => edge.kind === "request_targets_guest"));
  assert.ok(state.edges.some((edge) => edge.kind === "request_targets_event"));
  assert.ok(state.edges.some((edge) => edge.kind === "request_violates_policy"));
  assert.ok(state.edges.some((edge) => edge.kind === "requires_approval"));
  assert.equal(state.approvalRequestNodes.length, 1);
  assert.ok(state.familyVisibleNodes.some((node) => node.kind === "boundary_policy"));
  for (const edge of state.edges.filter((item) => item.kind === "request_targets_event" || item.kind === "invited_to_event")) {
    assert.ok(state.nodes.some((node) => node.id === edge.target), `missing event target node for ${edge.id}`);
  }
});

test("buildWeddingBoundaryTopologyState uses latest request record for approval nodes", () => {
  const approvedRequest: WeddingBoundaryChangeRequest = {
    ...request,
    status: "approved",
    requestStatus: "approved",
    approvalRequired: false,
    metadata: {
      decided_at: "2026-09-24T09:00:00.000Z",
      decision: "approve",
    },
  };
  const state = buildWeddingBoundaryTopologyState({
    metadata,
    objects: [approvedRequest, request],
  });

  const requestNode = state.nodes.find((node) => node.kind === "change_request");
  assert.equal(state.approvalRequestNodes.length, 0);
  assert.equal(requestNode?.metadata.request_status, "approved");
  assert.equal(requestNode?.metadata.approval_required, false);
  assert.equal(state.edges.some((edge) => edge.kind === "requires_approval"), false);
});

test("buildWeddingBoundaryTopologyState keeps auto-blocked requests queryable but out of approvals", () => {
  const blockedRequest: WeddingBoundaryChangeRequest = {
    ...request,
    id: "change:auto-blocked-plus-one",
    requestId: "change:auto-blocked-plus-one",
    requestStatus: "auto_blocked",
    approvalRequired: true,
  };
  const state = buildWeddingBoundaryTopologyState({
    metadata,
    objects: [blockedRequest],
  });

  const requestNode = state.nodes.find((node) => node.kind === "change_request");

  assert.equal(state.approvalRequestNodes.length, 0);
  assert.equal(requestNode?.metadata.request_status, "auto_blocked");
  assert.equal(requestNode?.metadata.approval_required, false);
  assert.equal(requestNode?.metadata.approval_gate_recorded, true);
  assert.equal(requestNode?.supertags.includes("wedding_boundary:approval_required"), false);
  assert.equal(state.edges.some((edge) => edge.kind === "requires_approval"), false);
});

test("buildWeddingBoundaryTopologyState creates event nodes for policy-scoped event rules", () => {
  const state = buildWeddingBoundaryTopologyState({
    metadata,
    objects: [{
      ...policy,
      id: "policy:rehearsal-dinner",
      title: "Rehearsal dinner is family only",
      ruleType: "invitation_scope",
      appliesToEventIds: ["event:rehearsal_dinner"],
    }],
  });

  const eventNode = state.nodes.find((node) => node.kind === "wedding_event" && node.metadata.event_id === "event:rehearsal_dinner");

  assert.equal(eventNode?.label, "Rehearsal Dinner");
  assert.ok(state.edges.some((edge) => edge.kind === "request_targets_event" && edge.target === eventNode?.id));
});

test("buildWeddingBoundaryTopologyState keeps couple-only rationales out of family-visible nodes", () => {
  const state = buildWeddingBoundaryTopologyState({
    metadata,
    objects: [{
      id: "decision:no-plus-ones",
      kind: "wedding_boundary_decision_rationale",
      decisionId: "decision:no-plus-ones",
      title: "Why no extra plus-ones",
      visibility: "couple_only",
      linkedPolicyId: "policy:no-extra-plus-ones",
      rationaleCiphertext: "sealed:private-reason",
    }],
  });

  const rationaleNode = state.nodes.find((node) => node.kind === "private_rationale");
  assert.ok(rationaleNode);
  assert.ok(rationaleNode.supertags.includes("wedding_boundary:couple_only"));
  assert.equal(state.familyVisibleNodes.some((node) => node.kind === "private_rationale"), false);
  assert.equal(JSON.stringify(state).includes("sealed:private-reason"), false);
});

test("buildWeddingBoundaryTopologyState marks encrypted private fields without exposing ciphertext", () => {
  const state = buildWeddingBoundaryTopologyState({
    metadata,
    objects: [{
      ...guest,
      privateNotesCiphertext: "sealed:guest-context",
    }, {
      ...policy,
      privateRationaleCiphertext: "sealed:policy-context",
    }],
  });

  const guestNode = state.nodes.find((node) => node.kind === "guest");
  const policyNode = state.nodes.find((node) => node.kind === "boundary_policy");

  assert.equal(guestNode?.metadata.private_notes_encrypted, true);
  assert.equal(policyNode?.metadata.private_rationale_encrypted, true);
  assert.equal(JSON.stringify(state).includes("sealed:guest-context"), false);
  assert.equal(JSON.stringify(state).includes("sealed:policy-context"), false);
});
