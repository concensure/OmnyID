import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingDelegationState,
  buildWeddingDelegationTaskItems,
} from "@/lib/weddingDelegationState";

test("buildWeddingDelegationState exposes detailed responsibility categories", () => {
  const state = buildWeddingDelegationState();

  assert.ok(state.categoryOptions.some((option) => option.id === "legal_noim" && /NOIM/i.test(option.description)));
  assert.deepEqual(state.categoryOptions.find((option) => option.id === "legal_noim")?.recommendedCollaboratorRoles, ["co_owner", "planner"]);
  assert.match(state.categoryOptions.find((option) => option.id === "legal_noim")?.sensitiveScopeLabel ?? "", /legal identity/i);
  assert.ok(state.categoryOptions.some((option) => option.id === "venue_selection"));
  assert.ok(state.categoryOptions.some((option) => option.id === "payments_contracts"));
  assert.ok(state.categoryOptions.length >= 12);
});

test("buildWeddingDelegationState projects complete delegates into Contacts-compatible drafts", () => {
  const state = buildWeddingDelegationState([
    {
      category: "legal_noim",
      personName: "Maya Chen",
      relationship: "Bride's sister",
      phone: "+61 400 111 222",
      email: "maya@example.com",
      notes: "Can attend celebrant meeting",
    },
    {
      category: "venue_selection",
      personName: "Harbour Planner",
      relationship: "Planner",
      email: "planner@example.com",
    },
  ]);

  assert.equal(state.blockerLabels.length, 0);
  assert.equal(state.contactDrafts.length, 2);
  assert.equal(state.contactDrafts[0]?.phone, "+61 400 111 222");
  assert.equal(state.contactDrafts[0]?.relationshipKind, "friend");
  assert.match(state.contactDrafts[0]?.notes ?? "", /Legal and NOIM/);
  assert.deepEqual(state.items[0]?.recommendedRoleLabels, ["Co-owner", "Wedding planner"]);
  assert.match(state.items[0]?.sensitiveScopeLabel ?? "", /legal identity/i);
  assert.equal(state.contactDrafts[1]?.relationshipKind, "supplier");
});

test("buildWeddingDelegationState blocks incomplete delegate contacts", () => {
  const state = buildWeddingDelegationState([
    { category: "budget_tracking", personName: "Alex", relationship: "Groom" },
  ]);

  assert.equal(state.contactDrafts.length, 0);
  assert.ok(state.blockerLabels.some((label) => /phone or email/i.test(label)));
});

test("buildWeddingDelegationState gives custom responsibilities conservative role guidance", () => {
  const state = buildWeddingDelegationState([
    { category: "surprise_fireworks", personName: "Ari", relationship: "Friend", email: "ari@example.com" },
  ]);

  assert.equal(state.items[0]?.categoryDescription, "Custom delegated wedding responsibility.");
  assert.deepEqual(state.items[0]?.recommendedCollaboratorRoles, ["contributor"]);
  assert.match(state.items[0]?.sensitiveScopeLabel ?? "", /review what this person can see/i);
});

test("buildWeddingDelegationTaskItems turns complete delegated responsibilities into projection-ready tasks", () => {
  const delegation = buildWeddingDelegationState([
    {
      category: "legal_noim",
      personName: "Maya Chen",
      relationship: "Bride's sister",
      phone: "+61 400 111 222",
      email: "maya@example.com",
    },
    {
      category: "budget_tracking",
      personName: "Alex",
      relationship: "Groom",
    },
  ]);

  const tasks = buildWeddingDelegationTaskItems({
    delegation,
    metadata: {
      wedding_plan_id: "wedding_plan:delegation",
      response_workspace_id: "response_workspace:delegation",
    },
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, "wedding_delegation:legal-noim:maya-chen");
  assert.equal(tasks[0]?.assignee, "Maya Chen");
  assert.equal(tasks[0]?.priority, "high");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).delegation_task, true);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).contacts_projection_recommended, true);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).delegate_phone, "+61 400 111 222");
  assert.match(tasks[0]?.notes ?? "", /Recommended access role/i);
});

test("buildWeddingDelegationTaskItems suppresses duplicate saved delegation tasks", () => {
  const delegation = buildWeddingDelegationState([
    {
      category: "venue_selection",
      personName: "Harbour Planner",
      relationship: "Planner",
      email: "planner@example.com",
    },
  ]);

  const tasks = buildWeddingDelegationTaskItems({
    delegation,
    existingTaskItems: [{
      id: "task:existing",
      title: "Existing delegation",
      kind: "vendor_coordination",
      metadata: {
        delegation_task: true,
        delegated_category: "venue_selection",
        delegate_name: "Harbour Planner",
      },
    }],
  });

  assert.equal(tasks.length, 0);
});
