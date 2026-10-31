import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeddingFamilyBoundaryRequestEvaluation,
  buildWeddingFamilyBoundaryPolicyObject,
  buildWeddingFamilyBoundaryRequestObject,
  buildWeddingGuestBoundaryDraftObjects,
  buildWeddingGuestBoundaryRuleObjects,
} from "@/lib/weddingGuestBoundaryDraftState";
import { weddingBoundaryLedgerObjectToAfpMessage } from "@/lib/weddingBoundaryLedgerState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:harbour",
  source_response_id: "afp:source",
};

test("buildWeddingGuestBoundaryDraftObjects creates household, guest, and invitation ledger objects", () => {
  const objects = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Alex Lee",
    householdLabel: "Bride family",
    rsvpStatus: "Attending",
    plusOneAllowed: true,
    childrenInvited: true,
    contactLabel: "alex@example.test",
    mealPreference: "Fish",
    dietaryNote: "Nut allergy",
    accessibilityNote: "Wheelchair access",
  }, metadata, "2026-09-25T00:00:00.000Z");

  assert.equal(objects.length, 3);
  assert.equal(objects[0]?.kind, "wedding_boundary_household");
  assert.equal(objects[1]?.kind, "wedding_boundary_guest_profile");
  assert.equal(objects[2]?.kind, "wedding_boundary_event_invitation");
  assert.equal(objects[0]?.kind === "wedding_boundary_household" ? objects[0].displayName : null, "Bride family");
  assert.equal(objects[2]?.kind === "wedding_boundary_event_invitation" ? objects[2].invitationStatus : null, "rsvp_yes");
  assert.equal(objects[2]?.kind === "wedding_boundary_event_invitation" ? objects[2].plusOneAllowed : null, true);
  assert.equal(objects[2]?.kind === "wedding_boundary_event_invitation" ? objects[2].childrenInvited : null, true);
  assert.equal(objects[1]?.kind === "wedding_boundary_guest_profile" ? objects[1].contactLabel : null, "alex@example.test");
  assert.equal(objects[1]?.kind === "wedding_boundary_guest_profile" ? objects[1].mealPreference : null, "Fish");
  assert.equal(objects[1]?.kind === "wedding_boundary_guest_profile" ? objects[1].dietaryNote : null, "Nut allergy");
  assert.equal(objects[1]?.kind === "wedding_boundary_guest_profile" ? objects[1].accessibilityNote : null, "Wheelchair access");
});

test("guest invitation drafts expose plus-one and children facts through AFP", () => {
  const [, , invitation] = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Alex Lee",
    householdLabel: "Bride family",
    rsvpStatus: "Pending",
    plusOneAllowed: true,
    childrenInvited: false,
  }, metadata, "2026-09-25T00:00:00.000Z");
  assert.ok(invitation);
  const message = weddingBoundaryLedgerObjectToAfpMessage(invitation, metadata, "2026-09-25T00:00:00.000Z");

  assert.equal(message.kind, "wedding_boundary_event_invitation");
  assert.ok(message.supertags?.includes("wedding_guest:plus_one_allowed"));
  assert.ok(message.supertags?.includes("wedding_guest:children_blocked"));
  assert.equal(message.content.plus_one_allowed, true);
  assert.equal(message.content.children_invited, false);
});

test("named and unnamed plus-ones are separate canonical household guests", () => {
  const named = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Alex Lee",
    householdLabel: "Lee household",
    rsvpStatus: "Pending",
    plusOneAllowed: true,
    plusOneMode: "named",
    plusOneName: "Jordan Kim",
  }, metadata, "2026-09-25T00:00:00.000Z");
  const namedHousehold = named.find((object) => object.kind === "wedding_boundary_household");
  const namedProfiles = named.filter((object) => object.kind === "wedding_boundary_guest_profile");
  const namedInvitations = named.filter((object) => object.kind === "wedding_boundary_event_invitation");

  assert.equal(namedProfiles.length, 2);
  assert.equal(namedInvitations.length, 2);
  assert.equal(namedHousehold?.kind === "wedding_boundary_household" ? namedHousehold.memberPersonIds?.length : 0, 2);
  const companion = namedInvitations.find((object) => object.kind === "wedding_boundary_event_invitation" && object.guestRole === "plus_one");
  assert.equal(companion?.kind === "wedding_boundary_event_invitation" ? companion.namePending : null, false);
  const primaryProfile = namedProfiles.find((object) => object.kind === "wedding_boundary_guest_profile" && object.relationshipLabel !== "Plus-one");
  assert.equal(
    companion?.kind === "wedding_boundary_event_invitation" ? companion.companionToPersonId : null,
    primaryProfile?.kind === "wedding_boundary_guest_profile" ? primaryProfile.personId : null,
  );

  const unnamed = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Sam Patel",
    householdLabel: "Patel household",
    rsvpStatus: "Pending",
    plusOneAllowed: true,
    plusOneMode: "unnamed",
  }, metadata, "2026-09-25T00:00:00.000Z");
  const unnamedProfile = unnamed.find((object) => object.kind === "wedding_boundary_guest_profile" && object.relationshipLabel === "Plus-one");
  const unnamedInvitation = unnamed.find((object) => object.kind === "wedding_boundary_event_invitation" && object.guestRole === "plus_one");
  assert.equal(unnamedProfile?.kind === "wedding_boundary_guest_profile" ? unnamedProfile.displayName : null, "Guest of Sam Patel");
  assert.equal(unnamedInvitation?.kind === "wedding_boundary_event_invitation" ? unnamedInvitation.namePending : null, true);
});

test("a child is a separate invitation with age, seat, and meal requirements", () => {
  const objects = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Taylor Wong",
    householdLabel: "Wong household",
    rsvpStatus: "Pending",
    childrenInvited: true,
    childName: "Ari Wong",
    childAgeBand: "child_under_12",
    childSeatRequirement: "high_chair",
    childMealRequirement: "child",
  }, metadata, "2026-09-25T00:00:00.000Z");
  const child = objects.find((object) => object.kind === "wedding_boundary_guest_profile" && object.relationshipLabel === "Child");
  const invitation = objects.find((object) => object.kind === "wedding_boundary_event_invitation" && object.guestRole === "child");
  assert.equal(child?.kind === "wedding_boundary_guest_profile" ? child.ageBand : null, "child_under_12");
  assert.equal(invitation?.kind === "wedding_boundary_event_invitation" ? invitation.seatRequirement : null, "high_chair");
  assert.equal(invitation?.kind === "wedding_boundary_event_invitation" ? invitation.mealRequirement : null, "child");

  assert.ok(invitation);
  const restored = weddingBoundaryLedgerObjectToAfpMessage(invitation!, metadata, "2026-09-25T00:00:00.000Z");
  assert.equal(restored.content.guest_role, "child");
  assert.equal(restored.content.seat_requirement, "high_chair");
  assert.equal(restored.content.meal_requirement, "child");
});

test("guest boundary drafts project through AFP topology and knowledge graph routing", () => {
  const [, guest] = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Alex Lee",
    householdLabel: "Bride family",
    rsvpStatus: "Pending",
    contactLabel: "alex@example.test",
    mealPreference: "Vegetarian",
    dietaryNote: "No nuts",
    accessibilityNote: "Near lift",
  }, metadata, "2026-09-25T00:00:00.000Z");
  assert.ok(guest);
  const message = weddingBoundaryLedgerObjectToAfpMessage(guest, metadata, "2026-09-25T00:00:00.000Z");

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_boundary_guest_profile");
  assert.ok(message.to?.includes("agent://knowledge-graph"));
  assert.ok(message.to?.includes("agent://topology"));
  assert.ok(message.supertags?.includes("topology:wedding_guest_graph"));
  assert.ok(message.references.some((reference) => reference.type === "member_of_household"));
  assert.equal(message.content.contact_label, "alex@example.test");
  assert.equal(message.content.meal_preference, "Vegetarian");
  assert.equal(message.content.dietary_note, "No nuts");
  assert.equal(message.content.accessibility_note, "Near lift");
});

test("buildWeddingGuestBoundaryRuleObjects creates family-visible enforceable policies", () => {
  const policies = buildWeddingGuestBoundaryRuleObjects({
    plusOneRule: "No extra plus-ones unless we approve them.",
    childrenRule: "Children under 12 are only included when named on the invite.",
  }, metadata, "2026-09-25T00:00:00.000Z");

  assert.equal(policies.length, 2);
  assert.deepEqual(policies.map((policy) => policy.ruleType), ["plus_one", "children"]);
  assert.ok(policies.every((policy) => policy.enforcement === "require_approval"));
  assert.ok(policies.every((policy) => policy.visibility === "family_visible"));
});

test("buildWeddingFamilyBoundaryRequestObject creates approval-gated family requests", () => {
  const request = buildWeddingFamilyBoundaryRequestObject({
    requesterLabel: "Mum",
    requestLabel: "Add two cousins",
    changeType: "add_guest",
  }, metadata, "2026-09-25T00:00:00.000Z");

  assert.ok(request);
  assert.equal(request.kind, "wedding_boundary_change_request");
  assert.equal(request.requestStatus, "pending");
  assert.equal(request.approvalRequired, true);
  const message = weddingBoundaryLedgerObjectToAfpMessage(request, metadata, "2026-09-25T00:00:00.000Z");
  assert.ok(message.supertags?.includes("wedding_boundary:approval_required"));
  assert.ok(message.to?.includes("agent://decision-queue"));
});

test("configured partner-pair approval cannot be auto-applied by a permissive role", () => {
  const request = buildWeddingFamilyBoundaryRequestObject({
    requesterLabel: "Planner",
    requestLabel: "Move the invitation group",
    changeType: "household_change",
    requiredApprovalCount: 2,
  }, metadata, "2026-09-25T00:00:00.000Z");
  assert.ok(request);
  const evaluated = applyWeddingFamilyBoundaryRequestEvaluation({
    request,
    roleAssignments: [{
      id: "role:planner", kind: "wedding_boundary_role_assignment", title: "Planner",
      personId: "family:planner", role: "planner", canEdit: ["household_change"],
    }],
  });
  assert.equal(evaluated.requestStatus, "pending");
  assert.equal(evaluated.approvalRequired, true);
  assert.equal(evaluated.requiredApprovalCount, 2);
  assert.match(String(evaluated.publicReason), /Both partners/);
});

test("applyWeddingFamilyBoundaryRequestEvaluation links active rules before saving", () => {
  const request = buildWeddingFamilyBoundaryRequestObject({
    requesterLabel: "Mum",
    requestLabel: "Add Sam's plus-one",
    changeType: "plus_one_change",
  }, metadata, "2026-09-25T00:00:00.000Z");
  assert.ok(request);

  const evaluated = applyWeddingFamilyBoundaryRequestEvaluation({
    request,
    policies: [{
      id: "policy:no-extra-plus-ones",
      kind: "wedding_boundary_policy",
      title: "No extra plus-ones",
      ruleType: "plus_one",
      enforcement: "require_approval",
      plainLanguage: "No extra plus-ones unless both of us approve.",
      status: "active",
    }],
    roleAssignments: [{
      id: "role:mum",
      kind: "wedding_boundary_role_assignment",
      title: "Mum family access",
      personId: "family:mum",
      role: "parent_family",
      canSuggest: ["plus_one_change"],
      canEdit: [],
      requiresApprovalFor: ["plus_one_change"],
    }],
  });

  assert.equal(evaluated.requestStatus, "pending");
  assert.equal(evaluated.approvalRequired, true);
  assert.deepEqual(evaluated.policyIds, ["policy:no-extra-plus-ones"]);
  assert.equal(evaluated.metadata?.boundary_evaluation_applied, true);
  assert.match(String(evaluated.publicReason), /needs review/i);
});

test("applyWeddingFamilyBoundaryRequestEvaluation records blocked requests without review work", () => {
  const request = buildWeddingFamilyBoundaryRequestObject({
    requesterLabel: "Dad",
    requestLabel: "Add young cousins",
    changeType: "add_guest",
  }, metadata, "2026-09-25T00:00:00.000Z");
  assert.ok(request);

  const evaluated = applyWeddingFamilyBoundaryRequestEvaluation({
    request,
    policies: [{
      id: "policy:adults-only",
      kind: "wedding_boundary_policy",
      title: "Adults-only reception",
      ruleType: "children",
      enforcement: "block",
      plainLanguage: "Children under 12 are not invited to the reception.",
      status: "active",
    }],
  });
  const message = weddingBoundaryLedgerObjectToAfpMessage(evaluated, metadata, "2026-09-25T00:00:00.000Z");

  assert.equal(evaluated.requestStatus, "auto_blocked");
  assert.equal(evaluated.approvalRequired, true);
  assert.deepEqual(evaluated.policyIds, ["policy:adults-only"]);
  assert.match(String(evaluated.publicReason), /blocks this change/i);
  assert.ok(!message.supertags?.includes("wedding_boundary:approval_required"));
  assert.equal(message.content.approval_required, false);
});

test("buildWeddingFamilyBoundaryPolicyObject creates a family-visible rule", () => {
  const policy = buildWeddingFamilyBoundaryPolicyObject({
    title: "Named guests only",
    plainLanguage: "Only named guests are invited to the reception.",
    ruleType: "invitation_scope",
  }, metadata, "2026-09-25T00:00:00.000Z");

  assert.ok(policy);
  assert.equal(policy.kind, "wedding_boundary_policy");
  assert.equal(policy.enforcement, "require_approval");
  assert.equal(policy.visibility, "family_visible");
});
