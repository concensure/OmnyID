import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeddingBoundaryHelperProjection,
  previewWeddingBoundaryHouseholdCommand,
  previewWeddingBoundaryPolicyChange,
  previewWeddingBoundaryRequestDecision,
  projectWeddingBoundaryEffectiveRules,
  validateWeddingBoundaryRuleDraft,
  weddingBoundaryRoleCapabilityPreset,
} from "../src/lib/weddingBoundaryGovernanceState";
import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryEventInvitation,
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryLedgerObject,
  WeddingBoundaryPolicy,
} from "../src/lib/weddingBoundaryLedgerState";
import { buildWeddingBoundaryState, weddingBoundaryRequestStatusAt } from "../src/lib/weddingBoundaryLedgerState";

const household = (id: string, members: string[], allocation = 4): WeddingBoundaryHousehold => ({
  id,
  kind: "wedding_boundary_household",
  title: id,
  householdId: id,
  displayName: id,
  memberPersonIds: members,
  invitationAllocation: allocation,
  visibility: "approved_shared",
});

const guest = (id: string, householdId: string): WeddingBoundaryGuestProfile => ({
  id,
  kind: "wedding_boundary_guest_profile",
  title: id,
  personId: id,
  displayName: id,
  householdId,
  visibility: "couple_only",
});

const invitation = (id: string, personId: string, status: WeddingBoundaryEventInvitation["invitationStatus"]): WeddingBoundaryEventInvitation => ({
  id,
  kind: "wedding_boundary_event_invitation",
  title: id,
  invitationId: id,
  eventId: "event:wedding",
  personId,
  invitationStatus: status,
  visibility: "approved_shared",
});

const request = (overrides: Partial<WeddingBoundaryChangeRequest> = {}): WeddingBoundaryChangeRequest => ({
  id: "request:1",
  kind: "wedding_boundary_change_request",
  title: "Add Alex",
  requestId: "request:1",
  requestedBy: "family:helper",
  changeType: "add_guest",
  requestStatus: "pending",
  approvalRequired: true,
  targetPersonId: "person:alex",
  targetHouseholdId: "household:a",
  visibility: "approved_shared",
  ...overrides,
});

function policy(id: string, overrides: Partial<WeddingBoundaryPolicy>): WeddingBoundaryPolicy {
  return {
    id,
    kind: "wedding_boundary_policy",
    title: id,
    ruleType: "visibility",
    enforcement: "block",
    plainLanguage: id,
    visibility: "family_visible",
    status: "active",
    ...overrides,
  };
}

const objects: WeddingBoundaryLedgerObject[] = [
    household("household:a", ["person:a", "person:b"]),
    household("household:b", ["person:c"]),
    guest("person:a", "household:a"),
    guest("person:b", "household:a"),
    guest("person:c", "household:b"),
    invitation("invite:a", "person:a", "rsvp_yes"),
    invitation("invite:b", "person:b", "invited"),
    request(),
];

test("governance previews a safe split without changing stable guest or invitation references", () => {
    const result = previewWeddingBoundaryHouseholdCommand({
      command: { kind: "split_household", sourceHouseholdId: "household:a", newHouseholdId: "household:new", movePersonIds: ["person:b"] },
      objects,
    });
    assert.equal(result.canApply, true);
    assert.deepEqual(result.affectedPersonIds, ["person:b"]);
    assert.deepEqual(result.affectedInvitationIds, ["invite:b"]);
    assert.ok(result.impactAreas.includes("rsvp"));
  });

test("governance requires elevated confirmation when merging accepted invitations", () => {
    const result = previewWeddingBoundaryHouseholdCommand({
      command: { kind: "merge_households", sourceHouseholdIds: ["household:a", "household:b"], targetHouseholdId: "household:a" },
      objects,
    });
    assert.equal(result.canApply, true);
    assert.equal(result.requiresElevatedConfirmation, true);
    assert.deepEqual(result.affectedPersonIds, ["person:a", "person:b", "person:c"]);
  });

test("governance refuses to archive a household that still has members", () => {
    const result = previewWeddingBoundaryHouseholdCommand({
      command: { kind: "archive_household", householdId: "household:a" },
      objects,
    });
    assert.equal(result.canApply, false);
    assert.match(result.warnings.join(" "), /Move or remove every member/);
  });

test("governance keeps system privacy denial ahead of a narrower allow rule", () => {
    const result = projectWeddingBoundaryEffectiveRules({
      policies: [
        policy("system:privacy", { authority: "system", effect: "deny", scopeKind: "wedding" }),
        policy("guest:allow", { authority: "couple", effect: "allow", enforcement: "warn", scopeKind: "guest", scopeId: "person:a" }),
      ],
      scopeKind: "guest",
      scopeId: "person:a",
    });
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.effective.map((item) => item.rule.id), ["system:privacy"]);
  });

test("governance surfaces same-level rule disagreement instead of choosing an opaque winner", () => {
    const result = projectWeddingBoundaryEffectiveRules({
      policies: [
        policy("household:allow", { effect: "allow", enforcement: "warn", scopeKind: "household", scopeId: "household:a" }),
        policy("household:deny", { effect: "deny", scopeKind: "household", scopeId: "household:a" }),
      ],
      scopeKind: "household",
      scopeId: "household:a",
    });
    assert.deepEqual(result.effective, []);
    assert.deepEqual(result.conflicts[0]?.ruleIds, ["household:allow", "household:deny"]);
  });

test("governance does not let a vague request become an approval mutation", () => {
    const result = previewWeddingBoundaryRequestDecision({ request: request({ targetPersonId: null, targetHouseholdId: null }), objects });
    assert.equal(result.canApply, false);
    assert.match(result.warnings[0] ?? "", /exact guest or household/);
  });

test("governance projects only minimum necessary household aggregates to a helper", () => {
    const result = buildWeddingBoundaryHelperProjection({ householdIds: ["household:a"], objects });
    assert.equal(result.length, 1);
    assert.partialDeepStrictEqual(result[0], { householdId: "household:a", namedGuestCount: 2, allocation: 4 });
    assert.ok(!JSON.stringify(result).includes("dietary"));
    assert.ok(!JSON.stringify(result).includes("person:a"));
});

test("governance previews a versioned rule change before touching sent invitations", () => {
  const result = previewWeddingBoundaryPolicyChange({
    policy: policy("household:plus-one", {
      ruleType: "plus_one",
      scopeKind: "household",
      scopeId: "household:a",
      version: 3,
    }),
    nextStatus: "archived",
    objects,
  });
  assert.equal(result.canApply, true);
  assert.equal(result.requiresElevatedConfirmation, true);
  assert.deepEqual(result.affectedInvitationIds, ["invite:a", "invite:b"]);
  assert.match(result.warnings.join(" "), /version 4/);
  assert.match(result.warnings.join(" "), /RSVP records stay intact/);
});

test("delegated planner and RSVP guest presets are minimum-necessary and approval bounded", () => {
  const planner = weddingBoundaryRoleCapabilityPreset("planner");
  const guestRole = weddingBoundaryRoleCapabilityPreset("rsvp_guest");
  assert.equal(planner.privateNotesVisible, false);
  assert.ok(planner.requiresApprovalFor?.includes("household_change"));
  assert.deepEqual(guestRole.canView, ["own_invitation", "own_rsvp", "published_event_details"]);
  assert.equal(guestRole.canEdit?.includes("household_change"), false);
  assert.equal(guestRole.privateNotesVisible, false);
});

test("boundary rule validation requires exact scope and conditional values", () => {
  assert.match(validateWeddingBoundaryRuleDraft({ ruleType: "visibility", scopeKind: "household", condition: {} }) ?? "", /exact family group/);
  assert.match(validateWeddingBoundaryRuleDraft({ ruleType: "allocation", scopeKind: "wedding", condition: {} }) ?? "", /maximum number/);
  assert.match(validateWeddingBoundaryRuleDraft({ ruleType: "deadline", scopeKind: "wedding", condition: { request_deadline: "not-a-date" } }) ?? "", /request deadline/);
  assert.equal(validateWeddingBoundaryRuleDraft({ ruleType: "allocation", scopeKind: "household", scopeId: "household:a", condition: { maximum_guest_count: 8 } }), null);
  assert.equal(validateWeddingBoundaryRuleDraft({ ruleType: "deadline", scopeKind: "wedding", condition: { request_deadline: "2027-09-01" } }), null);
});

test("request lifecycle keeps only open states in the decision queue and expires elapsed deadlines", () => {
  const at = new Date("2027-09-02T12:00:00Z");
  assert.equal(weddingBoundaryRequestStatusAt(request({ expiresAt: "2027-09-01" }), at), "expired");
  assert.equal(weddingBoundaryRequestStatusAt(request({ requestStatus: "partially_approved", expiresAt: "2027-09-03" }), at), "partially_approved");
  assert.equal(weddingBoundaryRequestStatusAt(request({ requestStatus: "withdrawn", expiresAt: "2027-09-03" }), at), "withdrawn");
  const state = buildWeddingBoundaryState({
    objects: [
      request({ requestId: "pending", id: "pending" }),
      request({ requestId: "partial", id: "partial", requestStatus: "partially_approved" }),
      request({ requestId: "withdrawn", id: "withdrawn", requestStatus: "withdrawn" }),
      request({ requestId: "expired", id: "expired", requestStatus: "expired" }),
      request({ requestId: "blocked", id: "blocked", requestStatus: "auto_blocked" }),
    ],
  });
  assert.deepEqual(state.approvalQueue.map((item) => item.requestId), ["pending", "partial"]);
});
