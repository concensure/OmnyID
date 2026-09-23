import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingBoundaryState,
  evaluateWeddingBoundaryChangeRequest,
  weddingBoundaryLedgerObjectToAfpMessage,
  weddingBoundaryLedgerObjectToAfpSendInput,
  type WeddingBoundaryChangeRequest,
  type WeddingBoundaryGuestProfile,
  type WeddingBoundaryHousehold,
  type WeddingBoundaryPolicy,
  type WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";

const metadata = {
  weddingPlanId: "wedding_plan:harbour",
  responseWorkspaceId: "response_workspace:harbour",
  supertags: ["template:wedding_planning", "event:wedding"],
};

const noPlusOnesPolicy: WeddingBoundaryPolicy = {
  id: "policy:no-extra-plus-ones",
  kind: "wedding_boundary_policy",
  title: "No extra plus-ones",
  status: "active",
  visibility: "family_visible",
  ruleType: "plus_one",
  enforcement: "require_approval",
  scope: "guest_list",
  plainLanguage: "We are not adding extra plus-ones unless both of us approve it.",
  approvedBy: ["person:alex", "person:sam"],
  privateRationaleCiphertext: "sealed:venue-capacity-and-budget-context",
};

const parentRole: WeddingBoundaryRoleAssignment = {
  id: "role:janet",
  kind: "wedding_boundary_role_assignment",
  title: "Janet family access",
  visibility: "approved_shared",
  personId: "person:janet",
  role: "parent_family",
  canView: ["approved_guest_names", "event_times"],
  canSuggest: ["add_guest", "plus_one_change"],
  canEdit: [],
  requiresApprovalFor: ["add_guest", "plus_one_change"],
  privateNotesVisible: false,
};

const plusOneRequest: WeddingBoundaryChangeRequest = {
  id: "change:add-plus-one",
  kind: "wedding_boundary_change_request",
  requestId: "change:add-plus-one",
  title: "Add Taylor's plus-one",
  visibility: "approved_shared",
  requestedBy: "person:janet",
  changeType: "plus_one_change",
  targetPersonId: "person:taylor",
  targetEventId: "event:reception",
  requestStatus: "pending",
  approvalRequired: true,
  publicReason: "Request received. The couple will review it.",
  privateRationaleCiphertext: "sealed:couple-only-reason",
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
  familySide: "bride",
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
  relationshipLabel: "Cousin",
  familySide: "bride",
  privateNotesCiphertext: "sealed:private-context",
};

test("wedding boundary policy projects as AFP ledger with topology and private rationale guards", () => {
  const message = weddingBoundaryLedgerObjectToAfpMessage(noPlusOnesPolicy, metadata, "2026-09-23T00:00:00.000Z");

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_boundary_policy");
  assert.equal(message.subtype, "wedding_boundary_policy");
  assert.ok(message.supertags?.includes("wedding_boundary"));
  assert.ok(message.supertags?.includes("wedding_policy:plus_one"));
  assert.ok(message.supertags?.includes("topology:wedding_decision_rights"));
  assert.ok(message.supertags?.includes("decisionos:wedding_boundary"));
  assert.equal(message.content.plain_language, "We are not adding extra plus-ones unless both of us approve it.");
  assert.equal(message.content.private_rationale_encrypted, true);
  assert.equal(message.content.encrypted_private_payload, "sealed:venue-capacity-and-budget-context");
  assert.equal(message.metadata?.e2ee_required, true);
  assert.deepEqual(message.metadata?.private_fields, ["encrypted_private_payload"]);
  assert.ok(message.references?.some((reference) => reference.type === "wedding_plan"));
  assert.ok(message.views.some((view) => view.format === "a2ui"));
});

test("wedding boundary send input preserves ledger tags and typed references", () => {
  const input = weddingBoundaryLedgerObjectToAfpSendInput(plusOneRequest, metadata, "2026-09-23T00:00:00.000Z");

  assert.equal(input.type, "ledger");
  assert.equal(input.kind, "wedding_boundary_change_request");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_boundary:approval_required"));
  assert.ok(input.supertags?.includes("topology:wedding_guest_graph"));
  assert.ok(input.references?.some((reference) => reference.type === "request_targets_guest" && reference.target === "person:taylor"));
  assert.ok(input.references?.some((reference) => reference.type === "request_targets_event" && reference.target === "event:reception"));
});

test("wedding boundary evaluator requires approval for parent plus-one suggestions", () => {
  const evaluation = evaluateWeddingBoundaryChangeRequest({
    request: plusOneRequest,
    policies: [noPlusOnesPolicy],
    roleAssignments: [parentRole],
  });

  assert.equal(evaluation.status, "pending");
  assert.equal(evaluation.approvalRequired, true);
  assert.deepEqual(evaluation.policyIds, ["policy:no-extra-plus-ones"]);
  assert.equal(evaluation.allowedWithoutApproval, false);
  assert.ok(evaluation.reasonLabels.some((label) => /needs review/i.test(label)));
});

test("wedding boundary evaluator blocks changes when a couple-approved rule blocks them", () => {
  const blockedChildrenPolicy: WeddingBoundaryPolicy = {
    ...noPlusOnesPolicy,
    id: "policy:no-children-under-12",
    title: "Adults-only reception",
    ruleType: "children",
    enforcement: "block",
    plainLanguage: "Children under 12 are not invited to the reception.",
  };
  const childRequest: WeddingBoundaryChangeRequest = {
    ...plusOneRequest,
    id: "change:add-child",
    requestId: "change:add-child",
    title: "Add a child guest",
    changeType: "add_guest",
    targetPersonId: "person:child-guest",
  };

  const evaluation = evaluateWeddingBoundaryChangeRequest({
    request: childRequest,
    policies: [blockedChildrenPolicy],
    roleAssignments: [parentRole],
  });

  assert.equal(evaluation.status, "auto_blocked");
  assert.equal(evaluation.approvalRequired, true);
  assert.deepEqual(evaluation.policyIds, ["policy:no-children-under-12"]);
  assert.ok(evaluation.reasonLabels.some((label) => /blocks this change/i.test(label)));
});

test("wedding boundary state exposes family-safe objects and keeps private rationales out", () => {
  const privateRationale = {
    id: "decision:no-plus-ones",
    kind: "wedding_boundary_decision_rationale" as const,
    decisionId: "decision:no-plus-ones",
    title: "Why we chose no extra plus-ones",
    visibility: "couple_only" as const,
    linkedPolicyId: "policy:no-extra-plus-ones",
    summaryPublic: "We are keeping invitations to named guests.",
    rationaleCiphertext: "sealed:couple-only-long-form-reason",
  };
  const state = buildWeddingBoundaryState({
    metadata,
    objects: [noPlusOnesPolicy, parentRole, household, guest, plusOneRequest, privateRationale],
  });

  assert.equal(state.activePolicyCount, 1);
  assert.equal(state.pendingApprovalCount, 1);
  assert.equal(state.householdCount, 1);
  assert.equal(state.guestCount, 1);
  assert.equal(state.privateObjectCount, 1);
  assert.ok(state.approvalQueue.some((request) => request.requestId === "change:add-plus-one"));
  assert.ok(state.familyVisibleObjects.some((object) => object.kind === "wedding_boundary_policy"));
  assert.ok(!state.familyVisibleObjects.some((object) => object.kind === "wedding_boundary_decision_rationale"));
  assert.ok(!state.familyVisibleObjects.some((object) => object.kind === "wedding_boundary_change_request"));
  const familyPolicy = state.familyVisibleObjects.find((object): object is WeddingBoundaryPolicy => object.kind === "wedding_boundary_policy");
  const familyGuest = state.familyVisibleObjects.find((object): object is WeddingBoundaryGuestProfile => object.kind === "wedding_boundary_guest_profile");

  assert.equal(familyPolicy?.privateRationaleCiphertext, undefined);
  assert.equal(familyGuest?.privateNotesCiphertext, undefined);
});

test("wedding boundary state strips private rationale from approved family-visible requests", () => {
  const approvedRequest: WeddingBoundaryChangeRequest = {
    ...plusOneRequest,
    requestStatus: "approved",
    approvalRequired: false,
  };

  const state = buildWeddingBoundaryState({
    metadata,
    objects: [approvedRequest],
  });

  const familyRequest = state.familyVisibleObjects.find(
    (object): object is WeddingBoundaryChangeRequest => object.kind === "wedding_boundary_change_request",
  );

  assert.equal(familyRequest?.requestStatus, "approved");
  assert.equal(familyRequest?.privateRationaleCiphertext, undefined);
});

test("wedding boundary state uses latest request record after an approval refresh", () => {
  const decidedRequest: WeddingBoundaryChangeRequest = {
    ...plusOneRequest,
    status: "approved",
    requestStatus: "approved",
    approvalRequired: false,
    publicReason: "Approved by the couple.",
    metadata: {
      decided_at: "2026-09-24T09:00:00.000Z",
      decision: "approve",
    },
  };
  const state = buildWeddingBoundaryState({
    metadata,
    objects: [decidedRequest, plusOneRequest],
  });

  assert.equal(state.pendingApprovalCount, 0);
  assert.equal(state.approvalQueue.length, 0);
  assert.equal(state.familyVisibleObjects.length, 1);
  assert.equal(
    (state.familyVisibleObjects[0] as WeddingBoundaryChangeRequest | undefined)?.requestStatus,
    "approved",
  );
});

test("wedding boundary evaluator allows scoped editor changes only when no active policy overrides them", () => {
  const helperRole: WeddingBoundaryRoleAssignment = {
    ...parentRole,
    id: "role:coordinator",
    personId: "person:coordinator",
    role: "helper",
    canSuggest: ["guest_contact_update"],
    canEdit: ["guest_contact_update"],
    requiresApprovalFor: [],
  };
  const contactRequest: WeddingBoundaryChangeRequest = {
    ...plusOneRequest,
    id: "change:update-phone",
    requestId: "change:update-phone",
    requestedBy: "person:coordinator",
    changeType: "guest_contact_update",
    approvalRequired: false,
  };

  const allowed = evaluateWeddingBoundaryChangeRequest({
    request: contactRequest,
    policies: [],
    roleAssignments: [helperRole],
  });
  const guarded = evaluateWeddingBoundaryChangeRequest({
    request: contactRequest,
    policies: [{
      ...noPlusOnesPolicy,
      id: "policy:contact-updates-need-review",
      ruleType: "access",
      enforcement: "require_approval",
    }],
    roleAssignments: [helperRole],
  });

  assert.equal(allowed.status, "approved");
  assert.equal(allowed.allowedWithoutApproval, true);
  assert.equal(guarded.status, "pending");
  assert.equal(guarded.approvalRequired, true);
  assert.deepEqual(guarded.policyIds, ["policy:contact-updates-need-review"]);
});
