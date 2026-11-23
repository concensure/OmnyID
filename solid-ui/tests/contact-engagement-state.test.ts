import assert from "node:assert/strict";
import test from "node:test";

import { buildContactEngagementState } from "../src/lib/contactEngagementState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function contact(input: Partial<Contact> = {}): Contact {
  return {
    id: "contact:venue",
    name: "Harbour Venue",
    relationshipKind: "supplier",
    ...input,
  };
}

test("buildContactEngagementState marks contacts with no outreach as not contacted", () => {
  const state = buildContactEngagementState({ contact: contact() });

  assert.equal(state.status, "not_contacted");
  assert.equal(state.lastContactedLabel, null);
  assert.match(state.detailLabel, /No outreach evidence/i);
});

test("buildContactEngagementState shows awaiting response before SLA expires", () => {
  const state = buildContactEngagementState({
    contact: contact({
      lastContactedAt: "2026-09-14T00:00:00.000Z",
      lastContactedBy: "agent",
      responseSlaHours: 24,
    }),
    now: "2026-09-14T10:00:00.000Z",
  });

  assert.equal(state.status, "awaiting_response");
  assert.equal(state.contactedByLabel, "agent");
  assert.equal(state.hoursSinceContact, 10);
  assert.equal(state.followUpDueAt, "2026-09-15T00:00:00.000Z");
});

test("buildContactEngagementState marks follow-up due after SLA expires without response", () => {
  const state = buildContactEngagementState({
    contact: contact({
      lastContactedAt: "2026-09-14T00:00:00.000Z",
      lastContactedBy: "user",
      responseSlaHours: 5,
    }),
    now: "2026-09-14T07:00:00.000Z",
  });

  assert.equal(state.status, "follow_up_due");
  assert.match(state.detailLabel, /7h after contact/i);
});

test("buildContactEngagementState treats enabled response summary as response evidence", () => {
  const state = buildContactEngagementState({
    contact: contact({
      lastContactedAt: "2026-09-14T00:00:00.000Z",
      responseSlaHours: 5,
      responseSummaryEnabled: true,
      lastResponseAt: "2026-09-14T04:15:00.000Z",
      lastResponseSource: "agent",
      lastResponseSummary: "Asked for guest count and preferred date.",
    }),
    now: "2026-09-16T00:00:00.000Z",
  });

  assert.equal(state.status, "response_recorded");
  assert.equal(state.responseSummaryVisible, true);
  assert.equal(state.responseSummaryLabel, "Asked for guest count and preferred date.");
  assert.equal(state.responseRecordedLabel, "Response recorded by agent on 2026-09-14");
  assert.match(state.detailLabel, /Response recorded by agent on 2026-09-14/i);
});

test("buildContactEngagementState uses relationship defaults when contact SLA is absent", () => {
  const state = buildContactEngagementState({
    contact: contact({
      relationshipKind: "team",
      lastContactedAt: "2026-09-14T00:00:00.000Z",
    }),
    now: "2026-09-14T13:00:00.000Z",
  });

  assert.equal(state.status, "follow_up_due");
  assert.equal(state.followUpDueAt, "2026-09-14T12:00:00.000Z");
});

test("buildContactEngagementState treats follow-up outcomes as closed without response", () => {
  const state = buildContactEngagementState({
    contact: contact({
      lastContactedAt: "2026-09-05T00:00:00.000Z",
      followUpOutcome: "unresponsive",
      followUpOutcomeAt: "2026-09-15T01:00:00.000Z",
      followUpOutcomeNote: "Review alternatives.",
    }),
    now: "2026-09-16T00:00:00.000Z",
  });

  assert.equal(state.status, "closed_without_response");
  assert.equal(state.statusLabel, "Closed");
  assert.equal(state.followUpOutcomeLabel, "Marked unresponsive on 2026-09-15");
  assert.match(state.detailLabel, /do not keep chasing/i);
});
