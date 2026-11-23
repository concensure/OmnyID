import test from "node:test";
import assert from "node:assert/strict";

import {
  applyThreadSelection,
  pruneThreadSelectionToVisible,
} from "../src/lib/threadMultiSelect.ts";

test("applyThreadSelection toggles a single thread without shift", () => {
  const result = applyThreadSelection(new Set(["t1"]), ["t1", "t2", "t3"], "t2", true, "t1", false);
  assert.deepEqual([...result], ["t1", "t2"]);
});

test("applyThreadSelection selects a visible range with shift", () => {
  const result = applyThreadSelection(new Set(["t1"]), ["t1", "t2", "t3", "t4"], "t4", true, "t2", true);
  assert.deepEqual([...result], ["t1", "t2", "t3", "t4"]);
});

test("applyThreadSelection clears a visible range with shift", () => {
  const result = applyThreadSelection(new Set(["t1", "t2", "t3", "t4"]), ["t1", "t2", "t3", "t4"], "t3", false, "t2", true);
  assert.deepEqual([...result], ["t1", "t4"]);
});

test("pruneThreadSelectionToVisible removes hidden thread ids", () => {
  const result = pruneThreadSelectionToVisible(new Set(["t1", "t2", "t3"]), ["t2", "t4"]);
  assert.deepEqual([...result], ["t2"]);
});

