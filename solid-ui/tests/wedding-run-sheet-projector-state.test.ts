import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRunSheetProjectionPlan, weddingRunSheetSourceMessageIds } from "../src/lib/weddingRunSheetProjectorState.ts";

function taskMessage(id: string, title: string, planId = "plan-1") {
  return {
    id,
    type: "task",
    timestamp: `2026-10-29T00:00:${id === "task-1" ? "01" : "02"}Z`,
    content: {
      kind: "wedding_task",
      wedding_plan_id: planId,
      task_id: id,
      title,
      wedding_task_kind: title.toLocaleLowerCase().includes("transport") ? "transport" : "run_sheet",
      owner_refs: ["person:partner"],
    },
  };
}

function projectedRow(record: ReturnType<typeof buildWeddingRunSheetProjectionPlan>["records"][number]) {
  return {
    id: record.record_id,
    databaseId: record.database_id,
    table: record.table,
    data: record.data,
    revision: record.revision,
    timestamp: "2026-10-29T00:00:03Z",
  };
}

test("structured wedding facts produce deterministic source-linked rows with zero model calls", () => {
  const plan = buildWeddingRunSheetProjectionPlan({
    databaseId: "database:runsheet",
    weddingPlanId: "plan-1",
    messages: [taskMessage("task-1", "Send final master run sheet to vendors")],
    changedMessageIds: ["task-1"],
    currentRows: [],
  });
  assert.equal(plan.modelCalls, 0);
  assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0].data.status, "needs-confirmation");
  assert.deepEqual(plan.records[0].source_refs, [{ message_id: "task-1", kind: "wedding_task" }]);
  assert.equal(plan.receipt?.kind, "database_projection_receipt");
  assert.equal(plan.nextCheckpoint?.projectorVersion, 1);
});

test("same source replay is fingerprint-idempotent", () => {
  const message = taskMessage("task-1", "Send final master run sheet to vendors");
  const first = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [message], changedMessageIds: [message.id], currentRows: [] });
  const replay = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [message], changedMessageIds: [message.id], currentRows: [projectedRow(first.records[0])] });
  assert.equal(replay.records.length, 0);
  assert.equal(replay.revisions.length, 0);
  assert.equal(replay.skippedUnchanged, 1);
  assert.equal(replay.receipt, null);
});

test("one source change affects only its linked run-sheet row", () => {
  const firstMessages = [taskMessage("task-1", "Send draft run sheet"), taskMessage("task-2", "Confirm transport pickup")];
  const initial = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: firstMessages, changedMessageIds: ["task-1", "task-2"], currentRows: [] });
  const changedMessages = [taskMessage("task-1", "Send final run sheet"), firstMessages[1]];
  const changed = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: changedMessages, changedMessageIds: ["task-1"], currentRows: initial.records.map(projectedRow) });
  assert.equal(changed.records.length, 0);
  assert.equal(changed.revisions.length, 1);
  assert.match(String(changed.revisions[0].patch.title), /final run sheet/i);
});

test("source selection is wedding-plan scoped", () => {
  const plan = buildWeddingRunSheetProjectionPlan({
    databaseId: "database:runsheet",
    weddingPlanId: "plan-1",
    messages: [taskMessage("task-1", "Send run sheet", "plan-2")],
    changedMessageIds: ["task-1"],
    currentRows: [],
  });
  assert.equal(plan.records.length, 0);
  assert.equal(plan.receipt, null);
});

test("user-created detached rows survive replay without projector writes", () => {
  const manualRow = {
    id: "record:manual",
    databaseId: "database:runsheet",
    table: "run_sheet",
    data: { runsheet_item_id: "manual-item", title: "Private note", projection_state: "detached" },
    revision: 1,
    timestamp: "",
  };
  const plan = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [], changedMessageIds: ["missing"], currentRows: [manualRow] });
  assert.equal(plan.revisions.length, 0);
});

test("a removed source marks its projected row stale instead of deleting it", () => {
  const message = taskMessage("task-1", "Send final run sheet");
  const first = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [message], changedMessageIds: [message.id], currentRows: [] });
  const stale = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [], changedMessageIds: [message.id], currentRows: [projectedRow(first.records[0])] });
  assert.equal(stale.revisions.length, 1);
  assert.equal(stale.revisions[0].operation, "upsert");
  assert.equal(stale.revisions[0].patch.projection_state, "stale");
});

test("selectors cover milestone, supplier, logistics, and circulation evidence", () => {
  const messages = [
    { id: "ceremony", type: "wedding_milestone", content: { wedding_plan_id: "plan-1", milestone_kind: "ceremony", title: "Ceremony", start_at: "2027-11-20T15:00:00+11:00", end_at: "2027-11-20T15:30:00+11:00", location: "Garden lawn", status: "confirmed" } },
    { id: "supplier", type: "vendor_booking", content: { wedding_plan_id: "plan-1", vendor_id: "venue-1", vendor_category: "venue", title: "Venue access", start_at: "2027-11-20T10:00:00+11:00", duration_minutes: 90 } },
    { id: "transport", type: "wedding_task", content: { wedding_plan_id: "plan-1", task_id: "bus-1", title: "Confirm bus pickup", due_date: "2027-11-01", participants: ["person:partner"] } },
    { id: "circulation", type: "wedding_task", content: { wedding_plan_id: "plan-1", task_id: "run-sheet-final", title: "Send Final Master Run Sheet to all vendors", wedding_task_kind: "run_sheet", visibility: ["master", "vendor"] } },
  ];
  assert.deepEqual(weddingRunSheetSourceMessageIds(messages, "plan-1").sort(), messages.map((message) => message.id).sort());
  const plan = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages, changedMessageIds: messages.map((message) => message.id), currentRows: [] });
  assert.equal(plan.records.length, 4);
  assert.equal(plan.records.find((record) => record.record_id.includes("ceremony"))?.data.location, "Garden lawn");
  assert.equal(plan.records.find((record) => record.record_id.includes("ceremony"))?.data.status, "confirmed");
  assert.equal(plan.records.find((record) => record.record_id.includes("ceremony"))?.data.time_status, "confirmed");
  assert.equal(plan.records.find((record) => record.record_id.includes("bus-1"))?.data.due_at, "2027-11-01T00:00:00.000Z");
});

test("a source that loses its resolvable meaning marks its row stale", () => {
  const message = taskMessage("task-1", "Confirm transport pickup");
  const first = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [message], changedMessageIds: [message.id], currentRows: [] });
  const unresolved = { ...message, type: "note", content: { wedding_plan_id: "plan-1", task_id: "task-1", title: "Unclassified note" } };
  const changed = buildWeddingRunSheetProjectionPlan({ databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [unresolved], changedMessageIds: [message.id], currentRows: [projectedRow(first.records[0])] });
  assert.equal(changed.revisions.length, 1);
  assert.equal(changed.revisions[0].patch.projection_state, "stale");
});
