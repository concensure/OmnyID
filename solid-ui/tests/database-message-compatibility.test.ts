import assert from "node:assert/strict";
import test from "node:test";

import {
  compatibleDatabaseRecordFromMessage,
  projectCompatibleDatabaseMessages,
} from "../src/lib/databaseMessageCompatibility.ts";

test("neutral and mounted database shapes normalize to the same logical record", () => {
  const mounted = compatibleDatabaseRecordFromMessage({
    id: "mounted-message",
    type: "database_record",
    content: {
      kind: "database_record",
      database_id: "db-clients",
      record_id: "record-1",
      table: "clients",
      data: { name: "Acme" },
    },
  });
  const neutral = compatibleDatabaseRecordFromMessage({
    id: "neutral-message",
    type: "database",
    content: { name: "Acme" },
    metadata: {
      database_id: "db-clients",
      record_id: "record-1",
      database_table: "clients",
    },
  });

  assert.deepEqual(mounted, neutral);
});

test("projection applies out-of-order canonical revisions once and rejects conflicts", () => {
  const projection = projectCompatibleDatabaseMessages([
    {
      id: "revision-2",
      type: "note:ledger_update",
      timestamp: "2026-09-01T07:00:00Z",
      content: {
        kind: "database_record_update",
        contract_version: 1,
        database_id: "db-clients",
        target_record_id: "record-1",
        base_revision: 1,
        revision: 2,
        table: "clients",
        patch: { status: "active" },
        operation: "upsert",
        idempotency_key: "record-1-revision-2",
      },
    },
    {
      id: "record-message",
      type: "database_record",
      timestamp: "2026-09-01T08:00:00Z",
      content: {
        kind: "database_record",
        contract_version: 1,
        database_id: "db-clients",
        record_id: "record-1",
        revision: 1,
        table: "clients",
        data: { name: "Acme" },
        idempotency_key: "record-1-revision-1",
      },
    },
    {
      id: "revision-conflict",
      type: "note:ledger_update",
      timestamp: "2026-09-01T09:00:00Z",
      content: {
        kind: "database_record_update",
        contract_version: 1,
        database_id: "db-clients",
        target_record_id: "record-1",
        base_revision: 1,
        revision: 2,
        table: "clients",
        patch: { status: "wrong" },
        operation: "upsert",
        idempotency_key: "record-1-conflicting-revision-2",
      },
    },
  ]);

  assert.equal(projection.records.length, 1);
  assert.deepEqual(projection.records[0].data, { name: "Acme", status: "active" });
  assert.equal(projection.records[0].revision, 2);
  assert.deepEqual(projection.conflicts, [{
    messageId: "revision-conflict",
    recordId: "record-1",
    reason: "revision_conflict",
  }]);
});

test("idempotent retries and tombstones have one effective result", () => {
  const base = {
    id: "base",
    type: "database_record",
    timestamp: "2026-09-01T08:00:00Z",
    content: {
      kind: "database_record",
      contract_version: 1,
      database_id: "db-clients",
      record_id: "record-1",
      revision: 1,
      table: "clients",
      data: { name: "Acme" },
      idempotency_key: "record-1-revision-1",
    },
  };
  const tombstone = {
    id: "delete-1",
    type: "note:ledger_update",
    timestamp: "2026-09-01T09:00:00Z",
    content: {
      kind: "database_record_update",
      contract_version: 1,
      database_id: "db-clients",
      target_record_id: "record-1",
      base_revision: 1,
      revision: 2,
      table: "clients",
      patch: {},
      operation: "tombstone",
      idempotency_key: "record-1-revision-2",
    },
  };
  const projection = projectCompatibleDatabaseMessages([
    base,
    { ...base, id: "base-retry" },
    tombstone,
    { ...tombstone, id: "delete-retry" },
  ]);
  assert.deepEqual(projection.records, []);
  assert.deepEqual(projection.conflicts, []);
});

test("a revision cannot target a record in another logical database", () => {
  const projection = projectCompatibleDatabaseMessages([
    {
      id: "base",
      type: "database_record",
      content: {
        kind: "database_record",
        contract_version: 1,
        database_id: "db-private",
        record_id: "record-1",
        revision: 1,
        table: "items",
        data: { name: "Private" },
        idempotency_key: "db-private-record-1-create",
      },
    },
    {
      id: "foreign-revision",
      type: "note:ledger_update",
      content: {
        kind: "database_record_update",
        contract_version: 1,
        database_id: "db-foreign",
        target_record_id: "record-1",
        base_revision: 1,
        revision: 2,
        table: "items",
        patch: { name: "Leaked" },
        operation: "upsert",
        idempotency_key: "db-foreign-record-1-revision-2",
      },
    },
  ]);
  assert.equal(projection.records[0].data.name, "Private");
  assert.deepEqual(projection.conflicts, [{
    messageId: "foreign-revision",
    recordId: "record-1",
    reason: "database_mismatch",
  }]);
});

test("unsupported or incomplete canonical versions fail closed instead of becoming legacy", () => {
  assert.equal(compatibleDatabaseRecordFromMessage({
    id: "future",
    type: "database_record",
    content: {
      kind: "database_record",
      contract_version: 2,
      database_id: "db-clients",
      record_id: "record-1",
      revision: 1,
      data: { name: "Acme" },
      idempotency_key: "future-record-create",
    },
  }), null);
  assert.equal(compatibleDatabaseRecordFromMessage({
    id: "incomplete",
    type: "database_record",
    content: {
      kind: "database_record",
      contract_version: 1,
      data: { name: "Acme" },
    },
  }), null);
});
