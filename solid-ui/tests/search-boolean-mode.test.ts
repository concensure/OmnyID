import test from "node:test";
import assert from "node:assert/strict";

import { applySearchBooleanMode, searchSubmissionText } from "../src/lib/searchBooleanMode.ts";

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

test("searchSubmissionText preserves natural-language agent requests", () => {
  assert.equal(
    searchSubmissionText("plan a family trip to Tokyo from Sydney for five days", "all"),
    "plan a family trip to Tokyo from Sydney for five days",
  );
});

test("searchSubmissionText preserves conversational follow-up questions", () => {
  assert.equal(
    searchSubmissionText("Anything I should follow up next week?", "all"),
    "Anything I should follow up next week?",
  );
});
