import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingBoundaryState } from "@/lib/weddingBoundaryLedgerState";
import { buildWeddingBoundaryManagementViewState } from "@/lib/weddingBoundaryManagementViewState";
import { buildWeddingBoundaryTopologyState } from "@/lib/weddingBoundaryTopologyState";
import type {
  WeddingBoundaryGuestProfile,
  WeddingBoundaryPolicy,
  WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";

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
  plainLanguage: "We are not adding extra plus-ones unless both of us approve it.",
  privateRationaleCiphertext: "sealed:private-budget-context",
};

const role: WeddingBoundaryRoleAssignment = {
  id: "role:janet",
  kind: "wedding_boundary_role_assignment",
  title: "Janet family access",
  visibility: "approved_shared",
  personId: "person:janet",
  role: "parent_family",
  canView: ["approved guest names", "event times"],
  canSuggest: ["plus_one_change"],
  canEdit: [],
};

const guest: WeddingBoundaryGuestProfile = {
  id: "person:taylor",
  kind: "wedding_boundary_guest_profile",
  personId: "person:taylor",
  title: "Taylor Smith",
  displayName: "Taylor Smith",
  visibility: "approved_shared",
  ageBand: "adult",
  privateNotesCiphertext: "sealed:private-family-context",
};

test("buildWeddingBoundaryManagementViewState derives non-editable user guidance from boundary topology", () => {
  const objects = [policy, role, guest];
  const state = buildWeddingBoundaryState({ metadata, objects });
  const topology = buildWeddingBoundaryTopologyState({ metadata, objects });
  const view = buildWeddingBoundaryManagementViewState({ state, topology });

  assert.match(view.includeText, /Taylor Smith/);
  assert.match(view.includeText, /Janet family access/);
  assert.match(view.excludeText, /private couple notes/);
  assert.match(view.excludeText, /No extra plus-ones/);
  assert.equal(view.hasRules, true);
  assert.equal(view.hasVisibilityItems, true);
  assert.equal(view.ruleItems[0]?.detail, "We are not adding extra plus-ones unless both of us approve it.");
  assert.ok(view.visibilityItems.some((item) => item.label === "Janet family access" && item.detail === "parent family"));
  assert.equal(view.privateItemsLabel, null);
});

test("buildWeddingBoundaryManagementViewState has calm empty-state labels", () => {
  const state = buildWeddingBoundaryState({ metadata, objects: [] });
  const topology = buildWeddingBoundaryTopologyState({ metadata, objects: [] });
  const view = buildWeddingBoundaryManagementViewState({ state, topology });

  assert.equal(view.includeText, "Named guests, assigned helpers, and approved family viewers");
  assert.equal(view.excludeText, "Extra plus-ones, private notes, and couple-only reasons");
  assert.equal(view.hasRules, false);
  assert.equal(view.hasVisibilityItems, false);
  assert.equal(view.privateItemsLabel, null);
});
