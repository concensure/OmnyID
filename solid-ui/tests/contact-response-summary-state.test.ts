import assert from "node:assert/strict";
import test from "node:test";

import { buildContactFollowUpQueueState } from "../src/lib/contactFollowUpQueueState.ts";
import { applyContactResponseSummary } from "../src/lib/contactResponseSummaryState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function contact(input: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    relationshipKind: "other",
    ...input,
  };
}

test("applyContactResponseSummary records reply evidence and closes follow-up queue status", () => {
  const contacts = [
    contact({
      id: "venue-1",
      name: "Harbour Venue",
      relationshipKind: "supplier",
      lastContactedAt: "2026-09-14T00:00:00.000Z",
      responseSlaHours: 6,
    }),
  ];

  assert.equal(buildContactFollowUpQueueState({
    contacts,
    now: "2026-09-15T00:00:00.000Z",
  }).dueCount, 1);

  const result = applyContactResponseSummary({
    contacts,
    contactId: "venue-1",
    summary: "Confirmed availability and asked for package details.",
    respondedAt: "2026-09-15T02:30:00.000Z",
    source: "user",
  });

  assert.equal(result.updated, true);
  assert.equal(result.contacts[0]?.lastResponseSummary, "Confirmed availability and asked for package details.");
  assert.equal(result.contacts[0]?.lastResponseAt, "2026-09-15T02:30:00.000Z");
  assert.equal(result.contacts[0]?.lastResponseSource, "user");
  assert.equal(result.contacts[0]?.responseSummaryEnabled, true);
  assert.equal(buildContactFollowUpQueueState({
    contacts: result.contacts,
    now: "2026-09-15T00:00:00.000Z",
  }).dueCount, 0);
  assert.match(result.summaryLabel, /counts as replied/i);
});

test("applyContactResponseSummary rejects empty summaries without mutating contacts", () => {
  const contacts = [contact({ id: "venue-1", name: "Harbour Venue" })];
  const result = applyContactResponseSummary({
    contacts,
    contactId: "venue-1",
    summary: "   ",
  });

  assert.equal(result.updated, false);
  assert.deepEqual(result.contacts, contacts);
  assert.match(result.summaryLabel, /required/i);
});
