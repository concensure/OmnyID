import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingSharedContactDraft,
  buildWeddingSharedContactDrafts,
  DEFAULT_WEDDING_SHARED_CONTACT_FIELDS,
} from "@/lib/weddingSharedContactState";

const contact = {
  id: "contact-1",
  name: "  Priya Singh  ",
  email: " priya@example.test ",
  phone: " +61 400 000 001 ",
  notes: "Private family context",
  agentId: "agent-private",
  relationshipKind: "friend" as const,
  roles: ["Reader", "reader", "Transport"],
};

test("shared-contact drafts include only the fields the account holder confirms", () => {
  const draft = buildWeddingSharedContactDraft(contact, {
    email: true,
    phone: false,
    relationship: false,
    roles: true,
  });

  assert.deepEqual(draft?.contact, {
    name: "Priya Singh",
    email: "priya@example.test",
    roles: ["Reader", "Transport"],
  });
  assert.deepEqual(draft?.includedFieldLabels, ["Name", "Email", "Roles"]);
  assert.deepEqual(draft?.privateFieldLabels, ["Phone", "Relationship", "Notes", "Agent ID"]);
  assert.equal(JSON.stringify(draft).includes("Private family context"), false);
  assert.equal(JSON.stringify(draft).includes("agent-private"), false);
});

test("shared-contact drafts preserve selection order and never add unselected contacts", () => {
  const drafts = buildWeddingSharedContactDrafts([
    contact,
    { ...contact, id: "contact-2", name: "Alex Chen" },
  ], ["contact-2"], DEFAULT_WEDDING_SHARED_CONTACT_FIELDS);

  assert.deepEqual(drafts.map((draft) => draft.contactRef), ["contact-2"]);
  assert.equal(drafts[0]?.contact.name, "Alex Chen");
});

test("contact name is the only mandatory shared field", () => {
  const draft = buildWeddingSharedContactDraft(contact, {
    email: false,
    phone: false,
    relationship: false,
    roles: false,
  });
  assert.deepEqual(draft?.contact, { name: "Priya Singh" });
  assert.deepEqual(draft?.includedFieldLabels, ["Name"]);
});
