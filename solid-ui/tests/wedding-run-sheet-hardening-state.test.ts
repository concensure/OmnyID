import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingRunSheetProjectionBatchSeries,
  buildWeddingRunSheetProjectionPlan,
  weddingRunSheetEffectiveRows,
} from "../src/lib/weddingRunSheetProjectorState.ts";
import {
  buildWeddingRunSheetOfflineSnapshot,
  readWeddingRunSheetOfflineSnapshot,
  weddingRunSheetOfflineMessages,
  weddingRunSheetProjectionTelemetry,
  writeWeddingRunSheetOfflineSnapshot,
} from "../src/lib/weddingRunSheetOfflineState.ts";

function taskMessage(index: number, planId = "plan-1") {
  return {
    id: `task-${index}`,
    type: "wedding_task",
    timestamp: new Date(Date.UTC(2026, 9, 30, 0, index)).toISOString(),
    content: {
      kind: "wedding_task",
      wedding_plan_id: planId,
      task_id: `task-${index}`,
      title: `Run sheet task ${index}`,
      wedding_task_kind: "run_sheet",
    },
  };
}

function projectedRow(input: {
  id: string;
  itemId: string;
  revision: number;
  timestamp: string;
  fingerprint?: string;
  state?: string;
}) {
  return {
    id: input.id,
    databaseId: "database:runsheet",
    table: "run_sheet",
    revision: input.revision,
    timestamp: input.timestamp,
    data: {
      runsheet_item_id: input.itemId,
      projection_state: input.state ?? "projected",
      source_fingerprint: input.fingerprint ?? "fingerprint",
      source_refs: [{ message_id: "task-1", kind: "wedding_task" }],
    },
  };
}

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("legacy and replayed projected rows resolve to one deterministic effective row", () => {
  const older = projectedRow({ id: "legacy-row", itemId: "runsheet:task:one", revision: 1, timestamp: "2026-10-29T00:00:00Z", state: "" });
  const newer = projectedRow({ id: "current-row", itemId: "runsheet:task:one", revision: 3, timestamp: "2026-10-30T00:00:00Z" });
  const manual = projectedRow({ id: "manual-row", itemId: "manual:one", revision: 1, timestamp: "", state: "detached" });
  const effective = weddingRunSheetEffectiveRows([newer, manual, older]);
  assert.deepEqual(effective.map((row) => row.id).sort(), ["current-row", "manual-row"]);
});

test("the projector revises the effective legacy row instead of creating a duplicate", () => {
  const source = taskMessage(1);
  const initial = buildWeddingRunSheetProjectionPlan({
    databaseId: "database:runsheet",
    weddingPlanId: "plan-1",
    messages: [source],
    changedMessageIds: [source.id],
    currentRows: [],
  });
  const legacy = projectedRow({
    id: "legacy-row",
    itemId: String(initial.records[0].data.runsheet_item_id),
    revision: 2,
    timestamp: "2026-10-29T00:00:00Z",
    fingerprint: "old-fingerprint",
    state: "",
  });
  const plan = buildWeddingRunSheetProjectionPlan({
    databaseId: "database:runsheet",
    weddingPlanId: "plan-1",
    messages: [source],
    changedMessageIds: [source.id],
    currentRows: [legacy],
  });
  assert.equal(plan.records.length, 0);
  assert.equal(plan.revisions.length, 1);
  assert.equal(plan.revisions[0].target_record_id, "legacy-row");
  assert.equal(plan.revisions[0].base_revision, 2);
});

test("large rebuilds are deterministic bounded batches with zero model calls", () => {
  const messages = Array.from({ length: 205 }, (_, index) => taskMessage(index + 1));
  const started = performance.now();
  const series = buildWeddingRunSheetProjectionBatchSeries({
    databaseId: "database:runsheet",
    weddingPlanId: "plan-1",
    messages,
    changedMessageIds: messages.map((message) => message.id),
    currentRows: [],
    maxWritesPerBatch: 80,
  });
  assert.equal(series.modelCalls, 0);
  assert.equal(series.sourceCount, 205);
  assert.equal(series.writeCount, 205);
  assert.equal(series.batches.length, 3);
  assert.ok(series.batches.every((batch) => batch.plan.records.length + batch.plan.revisions.length <= 80));
  assert.deepEqual(series.batches[1].expectedCheckpoint, series.batches[0].plan.nextCheckpoint);
  assert.deepEqual(series.batches[2].expectedCheckpoint, series.batches[1].plan.nextCheckpoint);
  assert.ok(performance.now() - started < 1_500);
});

test("plan and database scoping leave other weddings and generic rows untouched", () => {
  const genericRows = Array.from({ length: 500 }, (_, index) => ({
    id: `generic-row-${index}`, databaseId: `database:generic-${index}`, table: "default", revision: 1, timestamp: "",
    data: { title: `Ordinary database row ${index}` },
  }));
  const series = buildWeddingRunSheetProjectionBatchSeries({
    databaseId: "database:runsheet",
    weddingPlanId: "plan-1",
    messages: [taskMessage(1, "plan-2")],
    changedMessageIds: ["task-1"],
    currentRows: genericRows,
  });
  assert.equal(series.writeCount, 0);
  assert.deepEqual(weddingRunSheetEffectiveRows(genericRows), genericRows);
});

test("offline snapshots are account scoped, expiring, sanitized, and read-only shaped", () => {
  const storage = new MemoryStorage();
  const now = new Date("2026-10-30T10:00:00Z");
  const messages = [{
    id: "record-1",
    type: "database_record",
    timestamp: "2026-10-30T09:00:00Z",
    content: {
      kind: "database_record", contract_version: 1, database_id: "database:runsheet",
      record_id: "record-1", revision: 1, table: "run_sheet",
      data: {
        runsheet_item_id: "runsheet:task:one", title: "Venue access", start_at: "2027-11-20T09:00:00Z",
        projection_state: "projected", private_notes: "door code", couple_phone: "0400000000",
        source_fingerprint: "internal", source_refs: [{ message_id: "private-source" }],
      },
      source_refs: [{ message_id: "private-source", kind: "task" }], idempotency_key: "record-1",
    },
  }];
  const written = writeWeddingRunSheetOfflineSnapshot(storage, {
    accountId: "account-a", databaseId: "database:runsheet", weddingPlanId: "plan-1", messages, now,
  });
  assert.ok(written);
  assert.equal(written.rows[0].data.private_notes, undefined);
  assert.equal(written.rows[0].data.couple_phone, undefined);
  assert.equal(written.rows[0].data.source_refs, undefined);
  assert.equal(readWeddingRunSheetOfflineSnapshot(storage, {
    accountId: "account-b", databaseId: "database:runsheet", weddingPlanId: "plan-1", now,
  }), null);
  const loaded = readWeddingRunSheetOfflineSnapshot(storage, {
    accountId: "account-a", databaseId: "database:runsheet", weddingPlanId: "plan-1", now,
  });
  assert.ok(loaded);
  assert.equal(weddingRunSheetOfflineMessages(loaded)[0].metadata?.offline_read_only, true);
  assert.equal(readWeddingRunSheetOfflineSnapshot(storage, {
    accountId: "account-a", databaseId: "database:runsheet", weddingPlanId: "plan-1",
    now: new Date("2026-11-03T10:00:00Z"),
  }), null);
});

test("telemetry contains counts and explicit zero-cost fields, not wedding content", () => {
  assert.deepEqual(weddingRunSheetProjectionTelemetry({ sourceCount: 12, batchCount: 2, writeCount: 10 }), {
    sourceCount: 12, batchCount: 2, writeCount: 10,
    modelCalls: 0, inputTokens: 0, outputTokens: 0, modelCostUsd: 0,
  });
  assert.doesNotMatch(JSON.stringify(weddingRunSheetProjectionTelemetry({ sourceCount: 1, batchCount: 1, writeCount: 1 })), /title|email|phone|source_ref/i);
});

test("snapshot builder refuses an unscoped account", () => {
  assert.equal(buildWeddingRunSheetOfflineSnapshot({
    accountId: "", databaseId: "database:runsheet", weddingPlanId: "plan-1", messages: [],
  }), null);
});
