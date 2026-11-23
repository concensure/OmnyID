import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../src/lib/local-router-schema.sql');
const refreshPath = path.resolve(__dirname, '../src/lib/local-router-refresh.sql');

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const metadataTermFallbackSql = `EXISTS (
  SELECT 1
  FROM unnest($1::text[]) AS term
  WHERE split_part(term, ':', 1) <> ''
    AND (
      coalesce(searchable_metadata ->> split_part(term, ':', 1), '') = split_part(term, ':', 2)
      OR (
        jsonb_typeof(searchable_metadata -> split_part(term, ':', 1)) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(searchable_metadata -> split_part(term, ':', 1)) AS array_value(value)
          WHERE lower(array_value.value) = lower(split_part(term, ':', 2))
        )
      )
    )
)`;

test('local router schema bootstraps metadata term indexing and fallback matching', async () => {
  const db = await PGlite.create({ dataDir: 'memory://' });
  const sql = await readFile(schemaPath, 'utf8');
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await db.exec(statement);
  }

  await db.query(
    `INSERT INTO router_index (
        message_id, thread_id, from_agent, ts, type, kind,
        searchable_metadata, metadata_terms, summary_tsv
     ) VALUES (
        $1, $2, $3, NOW(), $4, $5,
        $6::jsonb, $7::text[], to_tsvector('simple', $8)
     )`,
    [
      'msg_exact',
      'thread_1',
      'watcher',
      'ledger',
      'task',
      JSON.stringify({ memory_space: 'work', suggested_actions: ['reply', 'review'] }),
      ['memory_space:work', 'suggested_actions:reply', 'suggested_actions:review'],
      'reply review work task',
    ],
  );

  await db.query(
    `INSERT INTO router_index (
        message_id, thread_id, from_agent, ts, type, kind,
        searchable_metadata, metadata_terms, summary_tsv
     ) VALUES (
        $1, $2, $3, NOW(), $4, $5,
        $6::jsonb, $7::text[], to_tsvector('simple', $8)
     )`,
    [
      'msg_fallback',
      'thread_2',
      'watcher',
      'ledger',
      'note',
      JSON.stringify({ suggested_actions: ['archive'], author_type: 'human' }),
      [],
      'archive human note',
    ],
  );

  const exact = await db.query(
    `SELECT message_id
     FROM router_index
     WHERE metadata_terms && $1::text[]`,
    [['suggested_actions:reply']],
  );

  const fallbackBeforeBackfill = await db.query(
    `SELECT message_id
     FROM router_index
     WHERE cardinality(metadata_terms) = 0
       AND ${metadataTermFallbackSql}`,
    [['suggested_actions:archive']],
  );

  await db.exec(splitSqlStatements(sql).at(-1));

  const backfilled = await db.query(
    `SELECT metadata_terms
     FROM router_index
     WHERE message_id = $1`,
    ['msg_fallback'],
  );

  const exactAfterBackfill = await db.query(
    `SELECT message_id
     FROM router_index
     WHERE metadata_terms && $1::text[]`,
    [['suggested_actions:archive']],
  );

  assert.deepEqual(exact.rows, [{ message_id: 'msg_exact' }]);
  assert.deepEqual(fallbackBeforeBackfill.rows, [{ message_id: 'msg_fallback' }]);
  assert.deepEqual(backfilled.rows[0]?.metadata_terms, ['author_type:human', 'suggested_actions:archive']);
  assert.deepEqual(exactAfterBackfill.rows, [{ message_id: 'msg_fallback' }]);

  await db.close();
});

test('local router refresh projects messages into router index and topology links', async () => {
  const db = await PGlite.create({ dataDir: 'memory://' });
  const schemaSql = await readFile(schemaPath, 'utf8');
  const refreshSql = await readFile(refreshPath, 'utf8');

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
        id, thread_id, from_agent, timestamp, type, kind, subtype, supertags,
        reference_targets, reference_types, link_types, content, metadata, summary
     ) VALUES (
        $1, $2, $3, NOW(), $4, $5, $6, $7::text[], $8::text[], $9::text[], $10::text[], $11::jsonb, $12::jsonb, $13
     )`,
    [
      'msg_task',
      'thread_task',
      'watcher',
      'ledger',
      'task',
      'prepared_draft',
      ['aurora', 'project/aurora'],
      ['msg_project'],
      ['message'],
      ['supports'],
      JSON.stringify({
        title: 'Reply to Aurora vendor',
        status: 'active',
        suggested_actions: ['reply', 'review'],
        supertags: ['followup/vendor'],
      }),
      JSON.stringify({
        memory_space: 'work',
        author_type: 'human',
        searchable_metadata: {
          owner: 'ozan',
        },
      }),
      'Prepared vendor reply',
    ],
  );

  await db.query(
    `INSERT INTO messages (
        id, thread_id, from_agent, timestamp, type, kind, subtype, content, metadata, summary
     ) VALUES (
        $1, $2, $3, NOW(), $4, $5, $6, $7::jsonb, $8::jsonb, $9
     )`,
    [
      'msg_link',
      'thread_task',
      'watcher',
      'relation_link',
      'relation_link',
      null,
      JSON.stringify({
        source_message_id: 'msg_task',
        target_message_id: 'msg_project',
        link_type: 'supports',
        weight: 0.9,
        label: 'supports project thread',
      }),
      JSON.stringify({}),
      'Relationship edge',
    ],
  );

  for (const statement of splitSqlStatements(refreshSql)) {
    await db.exec(statement);
  }
  for (const statement of splitSqlStatements(refreshSql)) {
    await db.exec(statement);
  }

  const routerRows = await db.query(
    `SELECT message_id, kind, supertags, metadata_terms, reference_targets
       FROM router_index
      WHERE message_id = 'msg_task'`,
  );
  const linkRows = await db.query(
    `SELECT link_message_id, source_message_id, target_message_id, link_type, weight
       FROM router_links`,
  );
  const routerCounts = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_index
      WHERE message_id = 'msg_task'`,
  );
  const linkCounts = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_links
      WHERE link_message_id = 'msg_link'`,
  );

  assert.deepEqual(routerRows.rows[0]?.message_id, 'msg_task');
  assert.deepEqual(routerRows.rows[0]?.kind, 'task');
  assert.deepEqual(routerRows.rows[0]?.reference_targets, ['msg_project']);
  assert.deepEqual(routerRows.rows[0]?.supertags, ['aurora', 'followup/vendor', 'project/aurora']);
  assert.deepEqual(
    routerRows.rows[0]?.metadata_terms,
    [
      'author_type:human',
      'kind:task',
      'memory_space:work',
      'message_type:ledger',
      'owner:ozan',
      'status:active',
      'subtype:prepared_draft',
      'suggested_actions:reply',
      'suggested_actions:review',
      'title:reply to aurora vendor',
    ],
  );
  assert.deepEqual(linkRows.rows, [
    {
      link_message_id: 'msg_link',
      source_message_id: 'msg_task',
      target_message_id: 'msg_project',
      link_type: 'supports',
      weight: 0.9,
    },
  ]);
  assert.deepEqual(routerCounts.rows, [{ count: 1 }]);
  assert.deepEqual(linkCounts.rows, [{ count: 1 }]);

  await db.query(`DELETE FROM messages WHERE id = $1`, ['msg_task']);
  for (const statement of splitSqlStatements(refreshSql)) {
    await db.exec(statement);
  }

  const deletedRouterCounts = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_index
      WHERE message_id = 'msg_task'`,
  );
  const preservedLinkCounts = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_links
      WHERE link_message_id = 'msg_link'`,
  );

  assert.deepEqual(deletedRouterCounts.rows, [{ count: 0 }]);
  assert.deepEqual(preservedLinkCounts.rows, [{ count: 1 }]);

  await db.query(`DELETE FROM messages WHERE id = $1`, ['msg_link']);
  for (const statement of splitSqlStatements(refreshSql)) {
    await db.exec(statement);
  }

  const deletedLinkCounts = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM router_links
      WHERE link_message_id = 'msg_link'`,
  );

  assert.deepEqual(deletedLinkCounts.rows, [{ count: 0 }]);

  await db.close();
});
