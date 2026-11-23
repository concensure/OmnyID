import assert from "node:assert/strict";
import test from "node:test";

import { buildContactFollowUpQueueState } from "../src/lib/contactFollowUpQueueState.ts";
import { applyContactFollowUpOutcome } from "../src/lib/contactFollowUpOutcomeState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function contact(input: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    relationshipKind: "supplier",
    ...input,
  };
}

test("applyContactFollowUpOutcome records non-response decisions and closes due queue", () => {
  const contacts = [
    contact({
      id: "venue-1",
      name: "Harbour Venue",
      lastContactedAt: "2026-09-05T00:00:00.000Z",
      responseSlaHours: 24,
    }),
  ];
  assert.equal(buildContactFollowUpQueueState({
    contacts,
    now: "2026-09-15T00:00:00.000Z",
  }).dueCount, 1);

  const result = applyContactFollowUpOutcome({
    contacts,
    contactId: "venue-1",
    outcome: "unresponsive",
    note: "Review alternatives.",
    decidedAt: "2026-09-15T01:00:00.000Z",
  });

  assert.equal(result.updated, true);
  assert.equal(result.contacts[0]?.followUpOutcome, "unresponsive");
  assert.equal(result.contacts[0]?.followUpOutcomeAt, "2026-09-15T01:00:00.000Z");
  assert.equal(result.contacts[0]?.followUpOutcomeNote, "Review alternatives.");
  assert.equal(buildContactFollowUpQueueState({
    contacts: result.contacts,
    now: "2026-09-15T00:00:00.000Z",
  }).dueCount, 0);
});

test("applyContactFollowUpOutcome rejects missing contact or outcome", () => {
  const contacts = [contact({ id: "venue-1", name: "Harbour Venue" })];
  const result = applyContactFollowUpOutcome({
    contacts,
    contactId: "",
    outcome: "move_on",
  });

  assert.equal(result.updated, false);
  assert.deepEqual(result.contacts, contacts);
  assert.match(result.summaryLabel, /required/i);
});
