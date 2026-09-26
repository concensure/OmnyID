import assert from "node:assert/strict";
import test from "node:test";

import { buildContactImportState } from "../src/lib/contactImportState.ts";

test("buildContactImportState imports Gmail or CSV-style contact rows", () => {
  const state = buildContactImportState({
    source: "gmail",
    defaultRelationshipKind: "supplier",
    text: [
      "Harbour Venue, events@harbour.example, +61 2 9000 0000",
      "Florist Studio <hello@florist.example>",
    ].join("\n"),
  });

  assert.equal(state.title, "Gmail contact import");
  assert.equal(state.importableContacts.length, 2);
  assert.equal(state.importableContacts[0]?.relationshipKind, "supplier");
  assert.equal(state.importableContacts[0]?.email, "events@harbour.example");
  assert.equal(state.importableContacts[0]?.phone, "+61 2 9000 0000");
  assert.match(state.importableContacts[0]?.notes ?? "", /Gmail contact import/i);
});

test("buildContactImportState skips duplicates from existing contacts", () => {
  const state = buildContactImportState({
    source: "contact_file",
    existingContacts: [{
      id: "contact:venue",
      name: "Harbour Venue",
      email: "events@harbour.example",
      relationshipKind: "supplier",
    }],
    text: "Harbour Venue, events@harbour.example",
  });

  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0]?.duplicateOfContactId, "contact:venue");
  assert.equal(state.importableContacts.length, 0);
  assert.ok(state.blockerLabels.some((label) => /Duplicate contacts/i.test(label)));
});

test("buildContactImportState skips phone duplicates with different formatting", () => {
  const state = buildContactImportState({
    source: "contact_file",
    existingContacts: [{
      id: "contact:ava",
      name: "Ava Smith",
      phone: "+61 400 111 222",
      relationshipKind: "friend",
    }],
    text: "Ava S, +61 (400) 111-222",
  });

  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0]?.duplicateOfContactId, "contact:ava");
  assert.equal(state.importableContacts.length, 0);
});

test("buildContactImportState marks arbitrary files for AI extraction when no contact structure is visible", () => {
  const state = buildContactImportState({
    source: "ai_file",
    text: "This invoice mentions several vendors but no clear contact lines.",
  });

  assert.equal(state.aiHandoffRequired, true);
  assert.equal(state.importableContacts.length, 0);
  assert.ok(state.blockerLabels.some((label) => /AI extraction/i.test(label)));
});
