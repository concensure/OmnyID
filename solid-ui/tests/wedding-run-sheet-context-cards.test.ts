import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("run-sheet contextual cards preserve the A2UI intent and authoritative-command boundary", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/components/WeddingRunSheetContextCards.tsx"), "utf8");
  const database = readFileSync(resolve(process.cwd(), "src/components/DatabaseView.tsx"), "utf8");
  assert.match(panel, /data-a2ui-schema/);
  assert.match(panel, /Review this buffer/);
  assert.match(panel, /does not confirm either item/);
  assert.match(panel, /onApproveBuffer/);
  assert.doesNotMatch(panel, /sendAfpMessage/);
  assert.match(database, /sendDatabaseRecordRevision/);
  assert.match(database, /weddingRunSheetApprovedBufferPatch/);
});
