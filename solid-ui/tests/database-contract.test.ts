import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalDatabaseArchive,
  buildCanonicalDatabaseDefinition,
  buildCanonicalDatabaseRecord,
  buildCanonicalDatabaseRevision,
  buildCanonicalDatabaseSchema,
} from "../src/lib/databaseContract.ts";

test("definition and archive builders preserve scope and lifecycle revisions", () => {
  const definition = buildCanonicalDatabaseDefinition({
    databaseId: "database:clients",
    accountId: "account-1",
    name: "Client work",
    defaultTable: "clients",
    revision: 2,
  });
  const archive = buildCanonicalDatabaseArchive({
    databaseId: definition.database_id,
    archived: true,
    revision: 1,
  });
  assert.equal(definition.scope.account_id, "account-1");
  assert.equal(definition.revision, 2);
  assert.equal(archive.database_id, definition.database_id);
  assert.equal(archive.archived, true);
});

test("canonical database builders preserve stable identity and revision metadata", () => {
  const record = buildCanonicalDatabaseRecord({
    databaseId: "db-clients",
    recordId: "record-1",
    table: "clients",
    data: { name: "Acme" },
  });
  const revision = buildCanonicalDatabaseRevision({
    databaseId: record.database_id,
    targetRecordId: record.record_id,
    baseRevision: record.revision,
    table: record.table,
    patch: { status: "active" },
  });

  assert.equal(record.contract_version, 1);
  assert.equal(record.idempotency_key, "database-record:record-1:create");
  assert.equal(revision.base_revision, 1);
  assert.equal(revision.revision, 2);
  assert.match(revision.idempotency_key, /^database-revision:/);
});

test("canonical builders reject empty patches and malformed identifiers", () => {
  assert.throws(() => buildCanonicalDatabaseRevision({
    databaseId: "db-clients",
    targetRecordId: "record-1",
    baseRevision: 1,
    table: "clients",
    patch: {},
  }), /must change/);
  assert.throws(() => buildCanonicalDatabaseRecord({
    databaseId: "not allowed!",
    table: "clients",
    data: {},
  }), /database ID/);
});

test("schema writes carry the database identity instead of relying on a table label", () => {
  const schema = buildCanonicalDatabaseSchema({
    databaseId: "db-clients",
    table: "clients",
    column: { key: "follow_up", label: "Follow-up" },
    idempotencyKey: "db-clients-schema-follow-up",
  });
  assert.equal(schema.database_id, "db-clients");
  assert.equal(schema.table, "clients");
  assert.equal(schema.column.key, "follow_up");
});
