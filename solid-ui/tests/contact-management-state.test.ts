import test from "node:test";
import assert from "node:assert/strict";

import { findDuplicateContact, replaceContact } from "../src/lib/contactManagementState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

const contacts: Contact[] = [
  { id: "1", name: "Ava Smith", email: "ava@example.com", phone: "+61 400 111 222", relationshipKind: "friend" },
  { id: "2", name: "Venue Desk", email: "events@venue.test", relationshipKind: "supplier" },
];

test("findDuplicateContact matches email and phone before name", () => {
  assert.deepEqual(findDuplicateContact(contacts, {
    name: "New Ava",
    email: " AVA@example.com ",
    phone: "",
  }), { contact: contacts[0], reason: "email" });
  assert.deepEqual(findDuplicateContact(contacts, {
    name: "Someone",
    phone: "+61 400 111 222",
  }), { contact: contacts[0], reason: "phone" });
});

test("findDuplicateContact only uses name when email and phone are blank", () => {
  assert.deepEqual(findDuplicateContact(contacts, { name: " ava smith " }), { contact: contacts[0], reason: "name" });
  assert.equal(findDuplicateContact(contacts, { name: "Ava Smith", email: "different@example.com" }), null);
});

test("findDuplicateContact ignores the edited contact id", () => {
  assert.equal(findDuplicateContact(contacts, {
    name: "Ava Smith",
    email: "ava@example.com",
  }, "1"), null);
});

test("replaceContact updates one contact without changing order", () => {
  assert.deepEqual(replaceContact(contacts, {
    ...contacts[1],
    phone: "+61 2 9999 0000",
  }), [
    contacts[0],
    { ...contacts[1], phone: "+61 2 9999 0000" },
  ]);
});
