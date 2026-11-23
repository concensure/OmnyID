import assert from "node:assert/strict";
import test from "node:test";

import { buildContactOutreachHealthState } from "../src/lib/contactOutreachHealthState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function contact(input: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    relationshipKind: "supplier",
    ...input,
  };
}

test("buildContactOutreachHealthState asks for contacts before outreach can start", () => {
  const state = buildContactOutreachHealthState({ contacts: [] });

  assert.equal(state.status, "needs_contacts");
  assert.equal(state.contactCount, 0);
  assert.match(state.nextActionLabel, /Import contacts/i);
});

test("buildContactOutreachHealthState distinguishes first outreach from follow-up work", () => {
  const state = buildContactOutreachHealthState({
    contacts: [
      contact({ id: "venue", name: "Harbour Venue" }),
      contact({ id: "photo", name: "Photo Studio" }),
    ],
  });

  assert.equal(state.status, "needs_outreach");
  assert.equal(state.notContactedCount, 2);
  assert.match(state.summaryLabel, /need first outreach/i);
});

test("buildContactOutreachHealthState prioritizes task-ready due follow-ups", () => {
  const state = buildContactOutreachHealthState({
    now: "2026-09-15T00:00:00.000Z",
    contacts: [
      contact({
        id: "venue",
        name: "Harbour Venue",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        responseSlaHours: 6,
      }),
    ],
  });

  assert.equal(state.status, "task_ready");
  assert.equal(state.dueCount, 1);
  assert.equal(state.taskReadyCount, 1);
  assert.match(state.nextActionLabel, /Save follow-up tasks/i);
});

test("buildContactOutreachHealthState surfaces response evidence before declaring healthy", () => {
  const state = buildContactOutreachHealthState({
    contacts: [
      contact({
        id: "venue",
        name: "Harbour Venue",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        responseSummaryEnabled: true,
        lastResponseAt: "2026-09-15T00:00:00.000Z",
        lastResponseSummary: "Confirmed availability.",
      }),
    ],
  });

  assert.equal(state.status, "evidence_ready");
  assert.equal(state.responseRecordedCount, 1);
  assert.equal(state.evidenceReadyCount, 1);
  assert.match(state.nextActionLabel, /Save response or outcome evidence/i);
});

test("buildContactOutreachHealthState surfaces follow-up outcome evidence before declaring healthy", () => {
  const state = buildContactOutreachHealthState({
    contacts: [
      contact({
        id: "venue",
        name: "Harbour Venue",
        lastContactedAt: "2026-09-01T00:00:00.000Z",
        followUpOutcome: "unresponsive",
        followUpOutcomeAt: "2026-09-11T00:00:00.000Z",
        followUpOutcomeNote: "No reply after escalation window.",
      }),
    ],
  });

  assert.equal(state.status, "evidence_ready");
  assert.equal(state.outcomeReadyCount, 1);
  assert.equal(state.evidenceReadyCount, 1);
  assert.match(state.nextActionLabel, /response or outcome evidence/i);
});

test("buildContactOutreachHealthState reports waiting while replies are still within SLA", () => {
  const state = buildContactOutreachHealthState({
    now: "2026-09-14T10:00:00.000Z",
    contacts: [
      contact({
        id: "venue",
        name: "Harbour Venue",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        responseSlaHours: 24,
      }),
    ],
  });

  assert.equal(state.status, "waiting");
  assert.equal(state.awaitingCount, 1);
});
