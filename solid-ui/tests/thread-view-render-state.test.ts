import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "@/lib/api";
import {
  threadViewBuildRawMessageById,
  threadViewBuildRenderEntries,
  threadViewBuildRenderUnits,
  threadViewDateLabel,
  threadViewFilterRenderEntriesByQuery,
  threadViewFilterRenderEntriesBySender,
  isThreadChatVisibleMessage,
  threadViewMessageContentCardId,
  threadViewRenderableEntries,
  threadViewRenderSearchText,
  threadViewRenderUnitMessage,
} from "@/lib/threadViewRenderState";

function message(overrides: Partial<AfpMessage> & Pick<AfpMessage, "id" | "thread_id" | "type">): AfpMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id,
    from: overrides.from ?? "agent/research/Atlas",
    to: overrides.to ?? [],
    timestamp: overrides.timestamp ?? "2026-08-31T12:00:00.000Z",
    type: overrides.type,
    kind: overrides.kind ?? "chat_thread",
    subtype: overrides.subtype ?? null,
    supertags: overrides.supertags ?? [],
    content: overrides.content ?? {},
    metadata: overrides.metadata ?? {},
    views: overrides.views ?? [],
    attachments: overrides.attachments ?? [],
    references: overrides.references ?? [],
    parent_id: overrides.parent_id,
    encryption: overrides.encryption ?? null,
    signature: overrides.signature ?? "",
  };
}

test("thread view render state groups generative cards with matching updates only", () => {
  const card = message({
    id: "card-1",
    thread_id: "t-1",
    type: "generative_card",
    content: { card_id: "alpha", title: "Launch plan" },
  });
  const update = message({
    id: "update-1",
    thread_id: "t-1",
    type: "card_section_update",
    content: { card_id: "alpha", body: "Section update" },
  });
  const orphan = message({
    id: "update-2",
    thread_id: "t-1",
    type: "card_section_update",
    content: { card_id: "missing", body: "Ignored update" },
  });
  const note = message({
    id: "note-1",
    thread_id: "t-1",
    type: "note",
    content: { text: "Standalone note" },
  });

  assert.equal(threadViewMessageContentCardId(card), "alpha");
  const units = threadViewBuildRenderUnits([card, update, orphan, note]);
  assert.equal(units.length, 2);
  assert.equal(units[0].kind, "generative_card");
  assert.deepEqual(units[0].kind === "generative_card" ? units[0].updates.map((entry) => entry.id) : [], ["update-1"]);
  assert.equal(threadViewRenderUnitMessage(units[1]).id, "note-1");
});

test("thread view hides daemon heartbeats from conversation rendering", () => {
  const heartbeat = message({
    id: "heartbeat-1",
    thread_id: "t-1",
    type: "daemon_heartbeat",
    content: { text: "operational liveness" },
  });
  const note = message({ id: "note-1", thread_id: "t-1", type: "note", content: { text: "Couple update" } });

  assert.equal(isThreadChatVisibleMessage(heartbeat), false);
  assert.deepEqual(
    threadViewBuildRenderUnits([heartbeat, note]).map((unit) => threadViewRenderUnitMessage(unit).id),
    ["note-1"],
  );
});

test("thread view render state groups Active-ToDos task updates with their ledger board", () => {
  const board = message({
    id: "task-board-1",
    thread_id: "t-1",
    type: "task",
    subtype: "create",
    content: { task_id: "venue", title: "Confirm venue deposit", status: "pending" },
  });
  const update = message({
    id: "task-update-1",
    thread_id: "t-1",
    parent_id: "task-board-1",
    type: "task",
    subtype: "update",
    content: { task_id: "venue", title: "Confirm venue deposit", assigned_to: "Maya", status: "done" },
    metadata: { task_update_source: "active_todos" },
  });
  const unrelatedUpdate = message({
    id: "task-update-2",
    thread_id: "t-1",
    parent_id: "missing-board",
    type: "task",
    subtype: "update",
    content: { task_id: "other", title: "Unrelated task" },
    metadata: { task_update_source: "active_todos" },
  });

  const units = threadViewBuildRenderUnits([board, update, unrelatedUpdate]);

  assert.equal(units.length, 2);
  assert.equal(units[0]?.kind, "ledger_board");
  assert.deepEqual(units[0]?.kind === "ledger_board" ? units[0].taskUpdates.map((entry) => entry.id) : [], ["task-update-1"]);
  assert.equal(threadViewRenderUnitMessage(units[0]!).id, "task-board-1");
  assert.equal(threadViewRenderUnitMessage(units[1]!).id, "task-update-2");
});

test("thread view render state builds deterministic date and last-visit dividers", () => {
  const units = threadViewBuildRenderUnits([
    message({
      id: "m-1",
      thread_id: "t-1",
      type: "chat",
      timestamp: "2026-08-30T23:30:00.000Z",
      content: { text: "First day" },
    }),
    message({
      id: "m-2",
      thread_id: "t-1",
      type: "chat",
      timestamp: "2026-08-31T01:00:00.000Z",
      content: { text: "Second day" },
    }),
  ]);

  const entries = threadViewBuildRenderEntries(units, "m-1");
  assert.equal(threadViewDateLabel("2026-08-31T23:59:00.000Z"), "Aug 31");
  assert.deepEqual(entries.map((entry) => entry.kind), [
    "date_separator",
    "standalone",
    "date_separator",
    "last_visit_divider",
    "standalone",
  ]);
  assert.equal(entries[0].kind === "date_separator" ? entries[0].label : "", "Aug 30");
  assert.equal(entries[2].kind === "date_separator" ? entries[2].label : "", "Aug 31");
});

test("thread view render state centralizes raw lookup and query filtering", () => {
  const entries = threadViewBuildRenderEntries(
    threadViewBuildRenderUnits([
      message({
        id: "m-1",
        thread_id: "t-1",
        type: "summary",
        from: "agent/research/Atlas",
        content: { title: "Launch summary", body: "Readiness is green" },
      }),
      message({
        id: "m-2",
        thread_id: "t-1",
        type: "note",
        from: "user/human/Alex",
        content: { text: "Need finance review" },
      }),
    ]),
    null,
  );

  const raw = threadViewBuildRawMessageById(threadViewRenderableEntries(entries));
  assert.equal(raw.get("m-1")?.id, "m-1");
  assert.match(threadViewRenderSearchText(raw.get("m-1")!), /launch summary readiness is green summary/i);

  const byQuery = threadViewFilterRenderEntriesByQuery(entries, "finance");
  assert.deepEqual(threadViewRenderableEntries(byQuery).map((entry) => threadViewRenderUnitMessage(entry).id), ["m-2"]);
});

test("thread view render state does not search encrypted payload fields", () => {
  const encrypted = message({
    id: "m-encrypted",
    thread_id: "t-1",
    type: "summary",
    content: { ciphertext: "venue secret", nonce: "nonce secret", title: "Hidden title" },
    encryption: { scheme: "omnyid-envelope-v1" },
  });
  const entries = threadViewBuildRenderEntries(threadViewBuildRenderUnits([encrypted]), null);

  assert.equal(threadViewRenderSearchText(encrypted), "summary");
  assert.deepEqual(threadViewRenderableEntries(threadViewFilterRenderEntriesByQuery(entries, "venue")).map((entry) => threadViewRenderUnitMessage(entry).id), []);
  assert.deepEqual(threadViewRenderableEntries(threadViewFilterRenderEntriesByQuery(entries, "summary")).map((entry) => threadViewRenderUnitMessage(entry).id), ["m-encrypted"]);
});

test("thread view render state centralizes sender filtering without counting dividers as messages", () => {
  const entries = threadViewBuildRenderEntries(
    threadViewBuildRenderUnits([
      message({
        id: "m-1",
        thread_id: "t-1",
        type: "chat",
        from: "agent/research/Atlas",
        content: { text: "Atlas update" },
      }),
      message({
        id: "m-2",
        thread_id: "t-1",
        type: "chat",
        from: "user/human/Alex",
        content: { text: "Alex reply" },
      }),
    ]),
    "m-1",
  );

  assert.equal(threadViewRenderableEntries(entries).length, 2);
  const filtered = threadViewFilterRenderEntriesBySender(entries, "Alex");
  assert.deepEqual(threadViewRenderableEntries(filtered).map((entry) => threadViewRenderUnitMessage(entry).id), ["m-2"]);
});
