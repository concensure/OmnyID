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

test("buildWeddingGuestBoundaryDraftObjects creates guest and invitation ledger objects", () => {
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

  assert.equal(objects.length, 2);
  assert.equal(objects[0]?.kind, "wedding_boundary_guest_profile");
  assert.equal(objects[1]?.kind, "wedding_boundary_event_invitation");
  assert.equal(objects[1]?.kind === "wedding_boundary_event_invitation" ? objects[1].invitationStatus : null, "rsvp_yes");
  assert.equal(objects[1]?.kind === "wedding_boundary_event_invitation" ? objects[1].plusOneAllowed : null, true);
  assert.equal(objects[1]?.kind === "wedding_boundary_event_invitation" ? objects[1].childrenInvited : null, true);
  assert.equal(objects[0]?.kind === "wedding_boundary_guest_profile" ? objects[0].contactLabel : null, "alex@example.test");
  assert.equal(objects[0]?.kind === "wedding_boundary_guest_profile" ? objects[0].mealPreference : null, "Fish");
  assert.equal(objects[0]?.kind === "wedding_boundary_guest_profile" ? objects[0].dietaryNote : null, "Nut allergy");
  assert.equal(objects[0]?.kind === "wedding_boundary_guest_profile" ? objects[0].accessibilityNote : null, "Wheelchair access");
});

test("guest invitation drafts expose plus-one and children facts through AFP", () => {
  const [, invitation] = buildWeddingGuestBoundaryDraftObjects({
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

test("guest boundary drafts project through AFP topology and knowledge graph routing", () => {
  const [guest] = buildWeddingGuestBoundaryDraftObjects({
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
