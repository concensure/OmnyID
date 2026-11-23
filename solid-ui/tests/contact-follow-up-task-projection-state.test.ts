import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContactFollowUpTaskProjectionState,
  contactFollowUpTaskProjectionId,
  hasSentContactFollowUpTaskProjection,
  markContactFollowUpTaskProjectionSent,
} from "../src/lib/contactFollowUpTaskProjectionState.ts";
import type { Contact } from "../src/lib/contactsLocalState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function contact(input: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    relationshipKind: "other",
    ...input,
  };
}

test("buildContactFollowUpTaskProjectionState creates approval-gated AFP task payloads for due follow-ups", () => {
  const state = buildContactFollowUpTaskProjectionState({
    now: "2026-09-15T00:00:00.000Z",
    nowIso: "2026-09-15T01:00:00.000Z",
    contacts: [
      contact({
        id: "venue-1",
        name: "Harbour Venue",
        relationshipKind: "supplier",
        email: "events@example.test",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        lastContactedBy: "agent",
        responseSlaHours: 6,
      }),
    ],
  });

  assert.equal(state.taskCount, 1);
  const task = state.tasks[0];
  assert.equal(task?.type, "task");
  assert.equal(task?.kind, "task");
  assert.equal(task?.subtype, "contact_follow_up_task");
  assert.equal(task?.thread_id, "contact_follow_up:venue-1");
  assert.deepEqual(task?.to, ["agent://tasks", "agent://decision-os", "agent://contacts", "agent://search"]);
  assert.equal(task?.store_in_relational, true);

  const content = task?.content as Record<string, unknown>;
  assert.equal(content.kind, "contact_follow_up_task");
  assert.equal(content.contact_id, "venue-1");
  assert.equal(content.relationship_kind, "supplier");
  assert.equal(content.contacted_by, "agent");
  assert.equal(content.task_type, "contact_follow_up");
  assert.equal(content.due_at, "2026-09-14T06:00:00.000Z");
  assert.equal(content.due_date, "2026-09-14T06:00:00.000Z");
  assert.equal(content.outreach_escalation_stage, "follow_up_due");
  assert.equal(content.no_spam_policy, true);
  assert.equal(content.approval_required_before_send, true);
  assert.equal(task?.views?.[0] && typeof task.views[0] === "object" ? (task.views[0] as Record<string, unknown>).format : null, "task_card");
  const viewContent = task?.views?.[0] && typeof task.views[0] === "object"
    ? (task.views[0] as Record<string, unknown>).content as Record<string, unknown>
    : {};
  assert.equal(viewContent.task_type, "contact_follow_up");
  assert.equal(viewContent.priority, "urgent");
  assert.equal(viewContent.due_date, "2026-09-14T06:00:00.000Z");
  assert.equal(viewContent.outreach_escalation_stage, "follow_up_due");

  const metadata = task?.metadata ?? {};
  assert.equal(metadata.origin, "contacts");
  assert.equal(metadata.projection, "contact_follow_up_queue_to_task");
  assert.equal(typeof metadata.projection_id, "string");
  assert.equal(metadata.no_spam_policy, true);
  assert.equal(metadata.outreach_escalation_stage, "follow_up_due");
  assert.equal(metadata.provider_send_blocked_until_user_approval, true);
  assert.ok(Array.isArray(metadata.searchable_terms));
});

test("buildContactFollowUpTaskProjectionState excludes contacts that are not due", () => {
  const state = buildContactFollowUpTaskProjectionState({
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

  assert.equal(state.taskCount, 0);
  assert.deepEqual(state.tasks, []);
  assert.match(state.summaryLabel, /no follow-up tasks/i);
});

test("buildContactFollowUpTaskProjectionState suppresses locally saved projection IDs", () => {
  const storage = memoryStorage();
  const projectionId = contactFollowUpTaskProjectionId({
    contactId: "venue-1",
    dueAt: "2026-09-14T06:00:00.000Z",
    priority: "urgent",
  });
  markContactFollowUpTaskProjectionSent(projectionId, storage, "user-1");

  const state = buildContactFollowUpTaskProjectionState({
    now: "2026-09-15T00:00:00.000Z",
    storage,
    userId: "user-1",
    contacts: [
      contact({
        id: "venue-1",
        name: "Harbour Venue",
        relationshipKind: "supplier",
        lastContactedAt: "2026-09-14T00:00:00.000Z",
        responseSlaHours: 6,
      }),
    ],
  });

  assert.equal(hasSentContactFollowUpTaskProjection(projectionId, storage, "user-1"), true);
  assert.equal(state.taskCount, 0);
  assert.equal(state.sentTaskCount, 1);
  assert.match(state.summaryLabel, /already been saved/i);
});
