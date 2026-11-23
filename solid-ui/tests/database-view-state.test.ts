import assert from "node:assert/strict";
import test from "node:test";

import {
  databaseCellFocusId,
  databaseColumnDefs,
  databaseImportPreviewRows,
  databaseImportRows,
  databaseRecordFromMessage,
  databaseRecordsForDatabase,
  databaseRecordUpdateFromMessage,
  databaseRecordsFromMessages,
  databaseSchemaColumnsFromMessages,
  databaseSchemaUpdateFromMessage,
  formatDatabaseEditableValue,
  parseDatabaseEditedValue,
} from "../src/lib/databaseViewState.ts";

test("database view state creates stable keyboard focus targets", () => {
  assert.equal(
    databaseCellFocusId("runsheet:task:Venue walkthrough", "start_at"),
    "database-cell-runsheet-task-venue-walkthrough-start-at",
  );
  assert.equal(databaseCellFocusId("***", ""), "database-cell-cell-cell");
});

test("database view state normalizes base records and record updates from unknown messages", () => {
  assert.deepEqual(
    databaseRecordFromMessage({
      id: "row-1",
      timestamp: "2026-09-01T08:00:00.000Z",
      content: {
        kind: "database_record",
        table: "clients",
        data: { name: "Acme", seats: 3 },
      },
    }),
    {
      id: "row-1",
      databaseId: "database:legacy",
      table: "clients",
      data: { name: "Acme", seats: 3 },
      revision: 1,
      timestamp: "2026-09-01T08:00:00.000Z",
    },
  );

  assert.deepEqual(
    databaseRecordUpdateFromMessage({
      timestamp: "2026-09-01T09:00:00.000Z",
      content: {
        kind: "database_record_update",
        table: "clients",
        target_record_id: "row-1",
        patch: { seats: 4 },
      },
    }),
    {
      databaseId: "database:legacy",
      targetRecordId: "row-1",
      table: "clients",
      patch: { seats: 4 },
      baseRevision: null,
      revision: null,
      operation: "upsert",
      timestamp: "2026-09-01T09:00:00.000Z",
    },
  );
});

test("database view state folds updates over base rows and ignores orphan updates", () => {
  const rows = databaseRecordsFromMessages([
    {
      id: "update-orphan",
      timestamp: "2026-09-01T07:00:00.000Z",
      content: {
        kind: "database_record_update",
        table: "clients",
        target_record_id: "missing",
        patch: { seats: 2 },
      },
    },
    {
      id: "row-1",
      timestamp: "2026-09-01T08:00:00.000Z",
      content: {
        kind: "database_record",
        table: "clients",
        data: { name: "Acme", seats: 3 },
      },
    },
    {
      id: "update-1",
      timestamp: "2026-09-01T09:00:00.000Z",
      content: {
        kind: "database_record_update",
        table: "clients",
        target_record_id: "row-1",
        patch: { seats: 4, stage: "active" },
      },
    },
  ]);

  assert.deepEqual(rows, [
    {
      id: "row-1",
      databaseId: "database:legacy",
      table: "clients",
      data: { name: "Acme", seats: 4, stage: "active" },
      revision: 2,
      timestamp: "2026-09-01T09:00:00.000Z",
    },
  ]);
});

test("database view state parses import rows and preview rows consistently", () => {
  const csvRows = databaseImportRows("Name, Seats\nAcme, 4\nBeta, 8");
  assert.deepEqual(csvRows, [
    { Name: "Acme", Seats: "4" },
    { Name: "Beta", Seats: "8" },
  ]);

  const jsonRows = databaseImportRows('[{"name":"Acme"},{"name":"Beta","stage":"active"}]');
  assert.deepEqual(databaseImportPreviewRows(jsonRows), [
    ["name", "stage"],
    ["Acme", ""],
    ["Beta", "active"],
  ]);
});

test("database view state derives fallback columns and edited value coercion deterministically", () => {
  assert.deepEqual(
    databaseColumnDefs([], ["Name", "Status"]),
    [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
    ],
  );
  assert.equal(formatDatabaseEditableValue({ name: "Acme" }), '{\n  "name": "Acme"\n}');
  assert.equal(parseDatabaseEditedValue("42", 1), 42);
  assert.equal(parseDatabaseEditedValue("true", false), true);
  assert.deepEqual(parseDatabaseEditedValue('{"ok":true}', null), { ok: true });
  assert.equal(parseDatabaseEditedValue("raw text", null), "raw text");
});

test("database view state keeps durable user-created column definitions", () => {
  const message = {
    content: {
      kind: "database_schema_update",
      table: "clients",
      column: { key: "follow_up", label: "Follow-up" },
    },
  };
  assert.deepEqual(databaseSchemaUpdateFromMessage(message), {
    databaseId: "database:legacy",
    table: "clients",
    column: { key: "follow_up", label: "Follow-up" },
  });
  assert.deepEqual(databaseSchemaColumnsFromMessages([message], "clients"), [
    { key: "follow_up", label: "Follow-up" },
  ]);
  assert.deepEqual(databaseColumnDefs([], [], databaseSchemaColumnsFromMessages([message], "clients")), [
    { key: "follow_up", label: "Follow-up" },
  ]);
});

test("database selection cannot leak rows from another logical database", () => {
  const rows = [
    { id: "row-a", databaseId: "database:a", table: "items", data: { name: "A" }, revision: 1, timestamp: "" },
    { id: "row-b", databaseId: "database:b", table: "items", data: { name: "B" }, revision: 1, timestamp: "" },
  ];
  assert.deepEqual(databaseRecordsForDatabase(rows, "database:a").map((row) => row.id), ["row-a"]);
  assert.deepEqual(databaseRecordsForDatabase(rows, null), []);
});
