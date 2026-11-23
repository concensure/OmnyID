import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import {
  localRouterProjectionHealth,
  refreshLocalRouterDerivedStateIfStale,
  splitSqlStatements,
} from "../src/lib/localRouterProjectorCore.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../src/lib/local-router-schema.sql");
const refreshPath = path.resolve(__dirname, "../src/lib/local-router-refresh.sql");

test("local router projector tracks per-message fingerprints for partial refresh", async () => {
  const db = await PGlite.create({ dataDir: "memory://" });
  const schemaSql = await readFile(schemaPath, "utf8");
  const refreshSql = await readFile(refreshPath, "utf8");

  for (const statement of splitSqlStatements(schemaSql)) {
    await db.exec(statement);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      type TEXT NOT NULL,
      kind TEXT,
      subtype TEXT,
      supertags TEXT[] NOT NULL DEFAULT '{}',
      reference_targets TEXT[] NOT NULL DEFAULT '{}',
      reference_types TEXT[] NOT NULL DEFAULT '{}',
      link_types TEXT[] NOT NULL DEFAULT '{}',
      content JSONB NOT NULL,
      metadata JSONB,
      summary TEXT
    )
  `);

  await db.query(
    `INSERT INTO messages (
        id, thread_id, from_agent, timestamp, type, kind, subtype,
        supertags, reference_targets, reference_types, link_types,
        content, metadata, summary
     ) VALUES (
        $1, $2, $3, $4::timestamptz, $5, $6, $7,
        $8::text[], $9::text[], $10::text[], $11::text[],
        $12::jsonb, $13::jsonb, $14
     )`,
    [
      "msg_task",
      "thread_task",
      "watcher",
      "2026-06-26T10:00:00Z",
      "ledger",
      "task",
      "prepared_draft",
      ["aurora"],
      [],
      [],
      [],
      JSON.stringify({
        title: "Reply to Aurora vendor",
        status: "active",
        suggested_actions: ["reply"],
      }),
      JSON.stringify({
        memory_space: "work",
        searchable_metadata: {
          owner: "ozan",
        },
      }),
      "Prepared vendor reply",
    ],
  );
  await db.query(
    `INSERT INTO messages (
        id, thread_id, from_agent, timestamp, type, kind, subtype,
        supertags, reference_targets, reference_types, link_types,
        content, metadata, summary
     ) VALUES (
        $1, $2, $3, $4::timestamptz, $5, $6, $7,
        $8::text[], $9::text[], $10::text[], $11::text[],
        $12::jsonb, $13::jsonb, $14
     )`,
    [
      "msg_note",
      "thread_task",
      "watcher",
      "2026-06-26T10:01:00Z",
      "ledger",
      "note",
      null,
      ["aurora"],
      [],
      [],
      [],
      JSON.stringify({
        title: "Aurora notes",
        status: "captured",
      }),
      JSON.stringify({
        memory_space: "work",
      }),
      "Aurora note summary",
    ],
  );
  await db.query(
    `INSERT INTO router_index (
        message_id, thread_id, from_agent, ts, type, kind,
        searchable_summary, metadata_terms, summary_tsv
     ) VALUES (
        $1, $2, $3, $4::timestamptz, $5, $6, $7, $8::text[], to_tsvector('simple', $9)
     )`,
    [
      "stale_legacy",
      "thread_legacy",
      "watcher",
      "2026-06-25T10:00:00Z",
      "ledger",
      "note",
      "Legacy stale row",
      ["message_type:ledger"],
      "Legacy stale row",
    ],
  );
  await db.query(
    `INSERT INTO router_links (
        link_message_id, source_message_id, target_message_id, link_type, weight, label
     ) VALUES (
        $1, $2, $3, $4, $5, $6
     )`,
    ["stale_link", "stale_legacy", "msg_task", "supports", 0.5, "stale link"],
  );

  const firstRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const secondRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);

  await db.query(
    `UPDATE messages
        SET content = $2::jsonb,
            summary = $3,
            timestamp = $4::timestamptz
      WHERE id = $1`,
    [
      "msg_task",
      JSON.stringify({
        title: "Review Aurora contract",
        status: "active",
        suggested_actions: ["review"],
      }),
      "Prepared contract review",
      "2026-06-26T10:00:00Z",
    ],
  );

  const thirdRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const projectedRow = await db.query(
    `SELECT searchable_summary, metadata_terms
       FROM router_index
      WHERE message_id = $1`,
    ["msg_task"],
  );
  const projectionState = await db.query(
    `SELECT source_message_count,
            source_latest_timestamp::text AS source_latest_timestamp,
            source_fingerprint,
            last_refresh_mode,
            last_changed_count,
            last_removed_count
       FROM router_projection_state
      WHERE projection_name = 'router_index'`,
  );
  const projectionInputs = await db.query(
    `SELECT message_id, is_link
       FROM router_projection_inputs
      ORDER BY message_id`,
  );
  const healthAfterUpdate = await localRouterProjectionHealth(db);
  const untouchedRow = await db.query(
    `SELECT searchable_summary, metadata_terms
       FROM router_index
      WHERE message_id = $1`,
    ["msg_note"],
  );
  const staleLegacyRow = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_index
      WHERE message_id = $1`,
    ["stale_legacy"],
  );
  const staleLegacyLink = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_links
      WHERE link_message_id = $1`,
    ["stale_link"],
  );

  assert.equal(firstRefresh, true);
  assert.equal(secondRefresh, false);
  assert.equal(thirdRefresh, true);
  assert.deepEqual(projectedRow.rows[0]?.searchable_summary, "Prepared contract review");
  assert.deepEqual(projectedRow.rows[0]?.metadata_terms, [
    "kind:task",
    "memory_space:work",
    "message_type:ledger",
    "owner:ozan",
    "status:active",
    "subtype:prepared_draft",
    "suggested_actions:review",
    "title:review aurora contract",
  ]);
  assert.deepEqual(untouchedRow.rows[0]?.searchable_summary, "Aurora note summary");
  assert.deepEqual(untouchedRow.rows[0]?.metadata_terms, [
    "kind:note",
    "memory_space:work",
    "message_type:ledger",
    "status:captured",
    "title:aurora notes",
  ]);
  assert.deepEqual(staleLegacyRow.rows, [{ count: 0 }]);
  assert.deepEqual(staleLegacyLink.rows, [{ count: 0 }]);
  assert.equal(projectionState.rows[0]?.source_message_count, 2);
  assert.equal(projectionState.rows[0]?.source_latest_timestamp, "2026-06-26 10:01:00+00");
  assert.equal(typeof projectionState.rows[0]?.source_fingerprint, "string");
  assert.ok((projectionState.rows[0]?.source_fingerprint?.length ?? 0) > 0);
  assert.equal(projectionState.rows[0]?.last_refresh_mode, "partial");
  assert.equal(projectionState.rows[0]?.last_changed_count, 1);
  assert.equal(projectionState.rows[0]?.last_removed_count, 0);
  assert.equal(healthAfterUpdate?.lastRefreshMode, "partial");
  assert.equal(healthAfterUpdate?.lastChangedCount, 1);
  assert.equal(healthAfterUpdate?.lastRemovedCount, 0);
  assert.equal(healthAfterUpdate?.consecutiveFullRefreshes, 0);
  assert.equal(typeof healthAfterUpdate?.lastPartialRefreshAt, "string");
  assert.equal(healthAfterUpdate?.sourceMessageCount, 2);
  assert.deepEqual(projectionInputs.rows, [
    { message_id: "msg_note", is_link: false },
    { message_id: "msg_task", is_link: false },
  ]);

  await db.query(`DELETE FROM messages WHERE id = $1`, ["msg_note"]);
  const fourthRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const deletedInput = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_projection_inputs
      WHERE message_id = $1`,
    ["msg_note"],
  );
  const deletedRow = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_index
      WHERE message_id = $1`,
    ["msg_note"],
  );
  const projectionStateAfterDelete = await db.query(
    `SELECT last_refresh_mode, last_changed_count, last_removed_count
       FROM router_projection_state
      WHERE projection_name = 'router_index'`,
  );
  const healthAfterDelete = await localRouterProjectionHealth(db);

  assert.equal(fourthRefresh, true);
  assert.deepEqual(deletedInput.rows, [{ count: 0 }]);
  assert.deepEqual(deletedRow.rows, [{ count: 0 }]);
  assert.equal(projectionStateAfterDelete.rows[0]?.last_refresh_mode, "partial");
  assert.equal(projectionStateAfterDelete.rows[0]?.last_changed_count, 0);
  assert.equal(projectionStateAfterDelete.rows[0]?.last_removed_count, 1);
  assert.equal(healthAfterDelete?.lastRefreshMode, "partial");
  assert.equal(healthAfterDelete?.lastChangedCount, 0);
  assert.equal(healthAfterDelete?.lastRemovedCount, 1);
  assert.equal(healthAfterDelete?.consecutiveFullRefreshes, 0);
  assert.equal(typeof healthAfterDelete?.lastPartialRefreshAt, "string");
  assert.equal(healthAfterDelete?.sourceMessageCount, 1);

  await db.close();
});

test("local router projector can force a refresh even when state is unchanged", async () => {
  const db = await PGlite.create({ dataDir: "memory://" });
  const schemaSql = await readFile(schemaPath, "utf8");
  const refreshSql = await readFile(refreshPath, "utf8");

  for (const statement of splitSqlStatements(schemaSql)) {
    await db.exec(statement);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      type TEXT NOT NULL,
      kind TEXT,
      subtype TEXT,
      supertags TEXT[] NOT NULL DEFAULT '{}',
      reference_targets TEXT[] NOT NULL DEFAULT '{}',
      reference_types TEXT[] NOT NULL DEFAULT '{}',
      link_types TEXT[] NOT NULL DEFAULT '{}',
      content JSONB NOT NULL,
      metadata JSONB,
      summary TEXT
    )
  `);

  await db.query(
    `INSERT INTO messages (
        id, thread_id, from_agent, timestamp, type, kind, subtype,
        supertags, reference_targets, reference_types, link_types,
        content, metadata, summary
     ) VALUES (
        $1, $2, $3, $4::timestamptz, $5, $6, $7,
        $8::text[], $9::text[], $10::text[], $11::text[],
        $12::jsonb, $13::jsonb, $14
     )`,
    [
      "msg_force",
      "thread_force",
      "watcher",
      "2026-06-26T13:00:00Z",
      "ledger",
      "note",
      null,
      [],
      [],
      [],
      [],
      JSON.stringify({ title: "Force refresh note", status: "active" }),
      JSON.stringify({ memory_space: "work" }),
      "Force refresh summary",
    ],
  );

  const firstRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const skippedRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const forcedRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql, { force: true });
  const healthAfterForce = await localRouterProjectionHealth(db);

  assert.equal(firstRefresh, true);
  assert.equal(skippedRefresh, false);
  assert.equal(forcedRefresh, true);
  assert.equal(healthAfterForce?.lastRefreshMode, "partial");
  assert.equal(healthAfterForce?.lastChangedCount, 0);
  assert.equal(healthAfterForce?.lastRemovedCount, 0);
  assert.equal(typeof healthAfterForce?.lastForcedRefreshAt, "string");
  assert.equal(healthAfterForce?.lastForcedRefreshReducedWarning, false);
  assert.equal(healthAfterForce?.lastForcedRefreshClearedWarning, false);

  await db.close();
});

test("local router projector tracks consecutive broad refresh streaks", async () => {
  const db = await PGlite.create({ dataDir: "memory://" });
  const schemaSql = await readFile(schemaPath, "utf8");
  const refreshSql = await readFile(refreshPath, "utf8");

  for (const statement of splitSqlStatements(schemaSql)) {
    await db.exec(statement);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      type TEXT NOT NULL,
      kind TEXT,
      subtype TEXT,
      supertags TEXT[] NOT NULL DEFAULT '{}',
      reference_targets TEXT[] NOT NULL DEFAULT '{}',
      reference_types TEXT[] NOT NULL DEFAULT '{}',
      link_types TEXT[] NOT NULL DEFAULT '{}',
      content JSONB NOT NULL,
      metadata JSONB,
      summary TEXT
    )
  `);

  for (let index = 0; index < 101; index += 1) {
    await db.query(
      `INSERT INTO messages (
          id, thread_id, from_agent, timestamp, type, kind, subtype,
          supertags, reference_targets, reference_types, link_types,
          content, metadata, summary
       ) VALUES (
          $1, $2, $3, $4::timestamptz, $5, $6, $7,
          $8::text[], $9::text[], $10::text[], $11::text[],
          $12::jsonb, $13::jsonb, $14
       )`,
      [
        `msg_${index}`,
        "thread_bulk",
        "watcher",
        "2026-06-26T12:00:00Z",
        "ledger",
        "note",
        null,
        [],
        [],
        [],
        [],
        JSON.stringify({
          title: `Bulk note ${index}`,
          status: "active",
        }),
        JSON.stringify({
          memory_space: "work",
        }),
        `Bulk summary ${index}`,
      ],
    );
  }

  const firstRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);

  for (let index = 0; index < 101; index += 1) {
    await db.query(
      `UPDATE messages
          SET summary = $2,
              content = $3::jsonb
        WHERE id = $1`,
      [
        `msg_${index}`,
        `Bulk summary updated ${index}`,
        JSON.stringify({
          title: `Bulk note updated ${index}`,
          status: "active",
        }),
      ],
    );
  }

  const secondRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  for (let index = 0; index < 101; index += 1) {
    await db.query(
      `UPDATE messages
          SET summary = $2,
              content = $3::jsonb
        WHERE id = $1`,
      [
        `msg_${index}`,
        `Bulk summary updated again ${index}`,
        JSON.stringify({
          title: `Bulk note updated again ${index}`,
          status: "active",
        }),
      ],
    );
  }

  const thirdRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const healthAfterFullStreak = await localRouterProjectionHealth(db);

  assert.equal(firstRefresh, true);
  assert.equal(secondRefresh, true);
  assert.equal(thirdRefresh, true);
  assert.equal(healthAfterFullStreak?.lastRefreshMode, "full");
  assert.equal(healthAfterFullStreak?.lastChangedCount, 101);
  assert.equal(healthAfterFullStreak?.lastRemovedCount, 0);
  assert.equal(healthAfterFullStreak?.consecutiveFullRefreshes, 2);
  assert.equal(typeof healthAfterFullStreak?.lastPartialRefreshAt, "string");
  assert.equal(healthAfterFullStreak?.lastForcedRefreshAt, null);
  assert.equal(healthAfterFullStreak?.sourceMessageCount, 101);

  await db.query(
    `UPDATE messages
        SET summary = $2,
            content = $3::jsonb
      WHERE id = $1`,
    [
      "msg_0",
      "Bulk summary stabilized",
      JSON.stringify({
        title: "Bulk note stabilized",
        status: "active",
      }),
    ],
  );

  const fourthRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const healthAfterPartialReset = await localRouterProjectionHealth(db);

  assert.equal(fourthRefresh, true);
  assert.equal(healthAfterPartialReset?.lastRefreshMode, "partial");
  assert.equal(healthAfterPartialReset?.lastChangedCount, 1);
  assert.equal(healthAfterPartialReset?.consecutiveFullRefreshes, 0);
  assert.equal(typeof healthAfterPartialReset?.lastPartialRefreshAt, "string");

  for (let index = 0; index < 101; index += 1) {
    await db.query(
      `UPDATE messages
          SET summary = $2,
              content = $3::jsonb
        WHERE id = $1`,
      [
        `msg_${index}`,
        `Bulk summary unstable again ${index}`,
        JSON.stringify({
          title: `Bulk note unstable again ${index}`,
          status: "active",
        }),
      ],
    );
  }

  const fifthRefresh = await refreshLocalRouterDerivedStateIfStale(db, refreshSql);
  const healthAfterNewFull = await localRouterProjectionHealth(db);

  assert.equal(fifthRefresh, true);
  assert.equal(healthAfterNewFull?.lastRefreshMode, "full");
  assert.equal(healthAfterNewFull?.consecutiveFullRefreshes, 1);
  assert.equal(typeof healthAfterNewFull?.lastPartialRefreshAt, "string");
  assert.equal(healthAfterNewFull?.lastForcedRefreshAt, null);

  await db.close();
});
