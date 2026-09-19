import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingAustralianLegalSetupState } from "../src/lib/weddingAustralianLegalSetupState.ts";
import { buildWeddingProjectionQueueState } from "../src/lib/weddingProjectionQueueState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("buildWeddingAustralianLegalSetupState creates a conservative NOIM legal artifact", () => {
  const state = buildWeddingAustralianLegalSetupState({
    metadata,
    weddingDateIso: "2027-10-03",
    dateLabel: "3 Oct 2027",
    location: "Hunter Valley, NSW",
    noimDownloaded: "no",
    celebrantPath: "need_options",
  });

  assert.equal(state.artifact.summary.kind, "legal");
  assert.equal(state.artifact.summary.title, "Australian legal setup");
  assert.ok(state.artifact.summary.linkedTaskIds.some((id) => /download-noim/.test(id)));
  assert.ok(state.artifact.summary.linkedCalendarEventIds.some((id) => /noim-reminder/.test(id)));
  assert.match(state.artifact.markdown, /planning aid, not legal advice/i);
  assert.match(state.artifact.markdown, /How/);
  assert.match(state.artifact.markdown, /When/);
  assert.match(state.artifact.markdown, /Where/);
  assert.match(state.artifact.markdown, /Cost questions/);
  assert.match(state.artifact.markdown, /Jurisdiction focus: NSW/);
  assert.ok(state.artifact.summary.sourceLabels.some((label) => /Attorney-General/i.test(label)));
  assert.ok(state.artifact.summary.sourceLinks.some((source) => /notice-intended-marriage/i.test(source.url)));
  assert.ok(state.artifact.summary.sourceLinks.some((source) => /marriage\.ag\.gov\.au/i.test(source.url)));
  assert.match(state.artifact.markdown, /ag\.gov\.au/);
  assert.ok(state.statusLabels.includes("Jurisdiction: NSW"));
  assert.deepEqual(state.guidanceCards.map((card) => card.id), ["status", "how", "when", "where", "cost"]);
  assert.ok(state.guidanceCards.find((card) => card.id === "cost")?.body.includes("certificate-related fees"));
  assert.ok(state.caveatLabels.some((label) => /No form is lodged/i));
});

test("buildWeddingAustralianLegalSetupState branches to own celebrant coordination", () => {
  const state = buildWeddingAustralianLegalSetupState({
    metadata,
    weddingDateIso: "2027-10-03",
    location: "Sydney, NSW",
    noimDownloaded: true,
    celebrantPath: "own_celebrant",
    celebrantName: "Taylor Smith",
  });
  const task = state.taskItems.find((item) => /chosen celebrant/i.test(item.title));

  assert.ok(task);
  assert.equal(task.approvalState, "pending_user_approval");
  assert.equal(task.kind, "vendor_follow_up");
  assert.match(state.artifact.markdown, /Taylor Smith/);
  assert.ok(state.statusLabels.some((label) => /own celebrant/i.test(label)));
  assert.match(state.guidanceCards.find((card) => card.id === "where")?.body ?? "", /chosen authorised celebrant/i);
});

test("buildWeddingAustralianLegalSetupState branches to public or registry option research", () => {
  const state = buildWeddingAustralianLegalSetupState({
    metadata,
    dateLabel: "Spring 2027",
    location: "Melbourne, VIC",
    noimDownloaded: "unknown",
    celebrantPath: "public_or_registry_celebrant",
  });
  const task = state.taskItems.find((item) => /registry\/public ceremony options/i.test(item.title));
  const calendar = state.scheduleItems[0];

  assert.ok(task);
  assert.equal(task.kind, "research");
  assert.match(task.notes ?? "", /Do not claim booking, live availability, or fee certainty/i);
  assert.equal(calendar.reviewStatus, "needs_review");
  assert.equal(calendar.startAt, null);
  assert.ok(state.statusLabels.includes("Jurisdiction: VIC"));
  assert.match(state.guidanceCards.find((card) => card.id === "when")?.body ?? "", /Keep the NOIM reminder in review/i);
  assert.match(state.guidanceCards.find((card) => card.id === "where")?.body ?? "", /VIC/);
});

test("buildWeddingAustralianLegalSetupState falls back to Australia-wide guidance for unclear location", () => {
  const state = buildWeddingAustralianLegalSetupState({
    metadata,
    dateLabel: "Spring 2027",
    location: "beach ceremony",
    noimDownloaded: "unknown",
    celebrantPath: "unknown",
  });

  assert.ok(state.statusLabels.includes("Jurisdiction: Australia"));
  assert.ok(state.guidanceCards.find((card) => card.id === "status")?.labels.includes("jurisdiction:Australia"));
  assert.match(state.artifact.markdown, /Jurisdiction focus: Australia/);
});

test("Australian legal setup outputs feed the existing projection queue", () => {
  const state = buildWeddingAustralianLegalSetupState({
    metadata,
    weddingDateIso: "2027-10-03",
    location: "Sydney, NSW",
    noimDownloaded: false,
    celebrantPath: "need_options",
  });
  const queue = buildWeddingProjectionQueueState({
    artifacts: [state.artifact],
    scheduleItems: state.scheduleItems,
    taskItems: state.taskItems,
    nowIso: "2026-09-12T00:00:00.000Z",
    storage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  });

  assert.equal(queue.pendingItems.length, 4);
  assert.equal(queue.blockedItems.length, 0);
  assert.ok(queue.pendingItems.some((item) => item.kind === "artifact"));
  assert.ok(queue.pendingItems.some((item) => item.kind === "calendar_event"));
  assert.ok(queue.pendingItems.some((item) => item.kind === "task"));
});
