import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWeddingHomeSectionOrder,
  shouldShowWeddingHomeSection,
  WEDDING_HOME_SECTION_IDS,
} from "../src/lib/weddingHomeSectionPolicyState.ts";

test("wedding home keeps the essential decision surfaces visible", () => {
  assert.equal(shouldShowWeddingHomeSection("vendor_search"), true);
  assert.equal(shouldShowWeddingHomeSection("planning_basics"), true);
  assert.equal(shouldShowWeddingHomeSection("quote_replies"), true);
  assert.equal(shouldShowWeddingHomeSection("decision_focus"), true);
  assert.equal(shouldShowWeddingHomeSection("overview"), true);
});

test("wedding home suppresses competing operational sections", () => {
  assert.equal(shouldShowWeddingHomeSection("threads"), false);
  assert.equal(shouldShowWeddingHomeSection("resilience"), false);
  assert.equal(shouldShowWeddingHomeSection("approval"), false);
  assert.equal(shouldShowWeddingHomeSection("status"), false);
  assert.equal(shouldShowWeddingHomeSection("notice"), false);
  assert.equal(shouldShowWeddingHomeSection("next_step"), false);
});

test("wedding home order puts quote replies above top decisions", () => {
  const order = normalizeWeddingHomeSectionOrder([]);

  assert.deepEqual(order.slice(0, 5), [
    "vendor_search",
    "planning_basics",
    "quote_replies",
    "decision_focus",
    "overview",
  ]);
  assert.equal(order.length, WEDDING_HOME_SECTION_IDS.length);
});

test("wedding home order keeps user ordering while removing duplicates and bad ids", () => {
  const order = normalizeWeddingHomeSectionOrder([
    "overview",
    "not-real",
    "quote_replies",
    "overview",
    "vendor_search",
  ]);

  assert.deepEqual(order.slice(0, 3), ["overview", "quote_replies", "vendor_search"]);
  assert.equal(new Set(order).size, WEDDING_HOME_SECTION_IDS.length);
});
