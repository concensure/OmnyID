import assert from "node:assert/strict";
import test from "node:test";

import { buildContactFollowUpQueueState } from "../src/lib/contactFollowUpQueueState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function contact(input: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    relationshipKind: "other",
    ...input,
  };
}

test("buildContactFollowUpQueueState ranks overdue suppliers and clients first", () => {
  const state = buildContactFollowUpQueueState({
    now: "2026-09-15T00:00:00.000Z",
    contacts: [
      contact({
        id: "friend",
        name: "Friend",
        relationshipKind: "friend",
        lastContactedAt: "2026-09-13T00:00:00.000Z",
        responseSlaHours: 12,
      }),
      contact({
        id: "venue",
        name: "Harbour Venue",
        relationshipKind: "supplier",
        email: "events@example.test",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        lastContactedBy: "agent",
        responseSlaHours: 6,
      }),
    ],
  });

  assert.equal(state.dueCount, 2);
  assert.equal(state.items[0]?.contactId, "venue");
  assert.equal(state.items[0]?.priority, "urgent");
  assert.equal(state.items[0]?.escalationStage, "follow_up_due");
  assert.match(state.items[0]?.escalationLabel ?? "", /Day 5/i);
  assert.match(state.items[0]?.title ?? "", /supplier/i);
  assert.ok(state.items[0]?.evidenceLabels.some((label) => /contacted by agent/i.test(label)));
});

test("buildContactFollowUpQueueState excludes awaiting and response-recorded contacts", () => {
  const state = buildContactFollowUpQueueState({
    now: "2026-09-14T10:00:00.000Z",
    contacts: [
      contact({
        id: "awaiting",
        name: "Awaiting Vendor",
        relationshipKind: "supplier",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        responseSlaHours: 24,
      }),
      contact({
        id: "responded",
        name: "Responded Vendor",
        relationshipKind: "supplier",
        lastContactedAt: "2026-09-12T00:00:00.000Z",
        responseSummaryEnabled: true,
        lastResponseSummary: "Confirmed availability.",
      }),
    ],
  });

  assert.equal(state.items.length, 0);
  assert.equal(state.awaitingCount, 1);
  assert.equal(state.responseRecordedCount, 1);
  assert.match(state.summaryLabel, /awaiting response/i);
});

test("buildContactFollowUpQueueState applies day seven and day ten escalation stages", () => {
  const state = buildContactFollowUpQueueState({
    now: "2026-09-15T00:00:00.000Z",
    contacts: [
      contact({
        id: "day-seven",
        name: "Seven Day Vendor",
        relationshipKind: "supplier",
        lastContactedAt: "2026-09-08T00:00:00.000Z",
        responseSlaHours: 24,
      }),
      contact({
        id: "day-ten",
        name: "Ten Day Vendor",
        relationshipKind: "supplier",
        lastContactedAt: "2026-09-05T00:00:00.000Z",
        responseSlaHours: 24,
      }),
    ],
  });

  assert.equal(state.items.find((item) => item.contactId === "day-seven")?.escalationStage, "escalate_to_user");
  assert.match(state.items.find((item) => item.contactId === "day-seven")?.escalationLabel ?? "", /Day 7/i);
  assert.equal(state.items.find((item) => item.contactId === "day-ten")?.escalationStage, "mark_unresponsive");
  assert.match(state.items.find((item) => item.contactId === "day-ten")?.escalationLabel ?? "", /Day 10/i);
});
