import test from "node:test";
import assert from "node:assert/strict";

import {
  addContactRole,
  buildContactRoleOptions,
  collectContactRoleLabels,
  normalizeContactRoleLabel,
  removeContactRole,
} from "../src/lib/contactRoleState.ts";

test("normalizeContactRoleLabel keeps known wedding and general roles canonical", () => {
  assert.equal(normalizeContactRoleLabel(" guest "), "Guest");
  assert.equal(normalizeContactRoleLabel("maid OF HONOUR"), "Maid of honour");
  assert.equal(normalizeContactRoleLabel("VIP"), "VIP");
  assert.equal(normalizeContactRoleLabel("   "), null);
});

test("buildContactRoleOptions prioritises wedding roles without excluding general roles", () => {
  const options = buildContactRoleOptions({
    context: "wedding",
    contacts: [{ id: "1", name: "Ava", relationshipKind: "friend", roles: ["Ceremony reader"] }],
  });

  assert.equal(options[0], "Ceremony reader");
  assert.ok(options.indexOf("Guest") > -1);
  assert.ok(options.indexOf("Client") > -1);
});

test("buildContactRoleOptions suggests close existing and default roles for typed text", () => {
  const options = buildContactRoleOptions({
    context: "wedding",
    query: "ven",
    contacts: [{ id: "1", name: "Venue manager", relationshipKind: "supplier", roles: ["Venue manager"] }],
  });

  assert.ok(options.includes("Vendor"));
  assert.ok(options.includes("Venue contact"));
  assert.ok(options.includes("Venue manager"));
});

test("addContactRole and removeContactRole keep custom roles unique", () => {
  const roles = addContactRole(["Guest"], " guest ");
  assert.deepEqual(roles, ["Guest"]);
  const custom = addContactRole(roles, "ceremony reader");
  assert.deepEqual(custom, ["Guest", "Ceremony reader"]);
  assert.deepEqual(removeContactRole(custom, "guest"), ["Ceremony reader"]);
});

test("collectContactRoleLabels deduplicates stored labels", () => {
  assert.deepEqual(collectContactRoleLabels([
    { id: "1", name: "Ava", relationshipKind: "friend", roles: ["Guest"] },
    { id: "2", name: "Ben", relationshipKind: "team", roles: [" guest ", "Coordinator"] },
  ]), ["Coordinator", "Guest"]);
});
