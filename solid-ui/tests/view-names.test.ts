import test from "node:test";
import assert from "node:assert/strict";

import { isViewName, normalizeViewName } from "../src/lib/viewNames.ts";

test("normalizeViewName trims known view names and rejects loose values", () => {
  assert.equal(normalizeViewName(" search "), "search");
  assert.equal(normalizeViewName("workflows"), "workflows");
  assert.equal(normalizeViewName("study"), "study");
  assert.equal(normalizeViewName("reports"), "reports");
  assert.equal(normalizeViewName("HOME"), null);
  assert.equal(normalizeViewName("missing_view"), null);
  assert.equal(normalizeViewName("   "), null);
  assert.equal(normalizeViewName(null), null);
  assert.equal(normalizeViewName(undefined), null);
});

test("isViewName keeps exact case-sensitive view-name narrowing", () => {
  assert.equal(isViewName("home"), true);
  assert.equal(isViewName("study"), true);
  assert.equal(isViewName("reports"), true);
  assert.equal(isViewName(" home "), false);
  assert.equal(isViewName("HOME"), false);
  assert.equal(isViewName("missing_view"), false);
});
