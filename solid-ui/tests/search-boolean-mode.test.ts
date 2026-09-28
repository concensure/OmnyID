import test from "node:test";
import assert from "node:assert/strict";

import { applySearchBooleanMode } from "../src/lib/searchBooleanMode.ts";

test("applySearchBooleanMode joins plain terms with AND for match-all mode", () => {
  assert.equal(
    applySearchBooleanMode("quarterly revenue report", "all"),
    "quarterly AND revenue AND report",
  );
});

test("applySearchBooleanMode joins plain terms with OR for match-any mode", () => {
  assert.equal(
    applySearchBooleanMode("status blocker owner", "any"),
    "status OR blocker OR owner",
  );
});

test("applySearchBooleanMode prefixes every term for exclude mode", () => {
  assert.equal(
    applySearchBooleanMode("draft archive", "exclude"),
    "-draft -archive",
  );
});

test("applySearchBooleanMode preserves quoted phrases", () => {
  assert.equal(
    applySearchBooleanMode("\"project atlas\" budget", "all"),
    "\"project atlas\" AND budget",
  );
});

test("applySearchBooleanMode leaves explicit operators untouched", () => {
  assert.equal(
    applySearchBooleanMode("tag:#launch OR tag:#roadmap", "all"),
    "tag:#launch OR tag:#roadmap",
  );
});
