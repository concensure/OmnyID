import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeDatabaseImportInput,
  analyzeDatabaseRecordContent,
  summarizeLineEntries,
} from "../src/lib/structuredTextInputState.ts";

test("analyzeDatabaseImportInput flags invalid JSON instead of falling through to CSV", () => {
  const result = analyzeDatabaseImportInput('{"name": ');
  assert.equal(result.format, "invalid-json");
  assert.equal(result.rowCount, 0);
  assert.match(result.error ?? "", /fix the json syntax/i);
});

test("analyzeDatabaseImportInput counts CSV rows and columns", () => {
  const result = analyzeDatabaseImportInput("Name,Status\nAlice,Active\nBob,Paused");
  assert.equal(result.format, "csv");
  assert.equal(result.rowCount, 2);
  assert.match(result.summary, /2 rows/i);
  assert.match(result.summary, /2 columns/i);
});

test("analyzeDatabaseRecordContent distinguishes valid JSON from plain text", () => {
  assert.equal(analyzeDatabaseRecordContent('{"name":"Alice"}').format, "json");
  assert.equal(analyzeDatabaseRecordContent("follow up with Alice").format, "plain");
  assert.equal(analyzeDatabaseRecordContent("{oops").format, "invalid-json");
});

test("summarizeLineEntries trims blanks and reports duplicates", () => {
  const result = summarizeLineEntries("https://a.com/feed\n\n https://a.com/feed \nhttps://b.com/feed");
  assert.equal(result.total, 3);
  assert.equal(result.unique, 2);
  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(result.normalized, ["https://a.com/feed", "https://b.com/feed"]);
});
