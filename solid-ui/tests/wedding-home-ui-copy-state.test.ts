import assert from "node:assert/strict";
import test from "node:test";

import {
  containsTechnicalWeddingUiCopy,
  safeWeddingUiText,
  weddingPlanningNeedLabel,
  weddingVendorSearchBlockedCopy,
  weddingVendorSearchNoticeCopy,
} from "../src/lib/weddingHomeUiCopyState.ts";

test("vendor-search UI copy never returns backend or protocol details", () => {
  const values = [
    weddingVendorSearchNoticeCopy("HTTP 500 from vendor_provider payload"),
    weddingVendorSearchNoticeCopy("Postgres timeout while reading vendor_search_results"),
    weddingVendorSearchBlockedCopy("AFP projection schema is missing vendor_category"),
  ].filter((value): value is string => Boolean(value));

  assert.equal(values.length, 3);
  for (const value of values) assert.equal(containsTechnicalWeddingUiCopy(value), false, value);
  assert.match(values[0], /try again/i);
  assert.match(values[1], /connection|try again/i);
  assert.match(values[2], /search by name/i);
});

test("wedding decision copy replaces technical content but preserves readable guidance", () => {
  assert.equal(safeWeddingUiText("Invalid AFP payload", "Review this choice."), "Review this choice.");
  assert.equal(safeWeddingUiText("Fits your relaxed garden style.", "Review this choice."), "Fits your relaxed garden style.");
});

test("planning needs are translated into couple-friendly labels", () => {
  assert.equal(weddingPlanningNeedLabel("vendor_fit_preferences"), "what matters most to you");
  assert.equal(weddingPlanningNeedLabel("database_schema"), "a little more wedding detail");
  assert.equal(weddingPlanningNeedLabel("Guest count"), "your expected guest count");
});
