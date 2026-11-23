import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphTrustState } from "../src/lib/knowledgeGraphTrustState.ts";

test("buildKnowledgeGraphTrustState recognizes trustworthy reinforced graph slices", () => {
  const state = buildKnowledgeGraphTrustState({
    visibleCount: 6,
    linkedCount: 5,
    strongCount: 2,
    mediumCount: 2,
    topicalDenseCount: 3,
    corroboratedCount: 3,
    diverseSourceCount: 2,
    contradictionCount: 1,
    activeLens: "linked_ideas",
    activeTag: null,
    courseTag: "course:bio101",
    weekTag: "week:3",
  });

  assert.equal(state?.grade, "trusted");
  assert.equal(state?.badge, "Trusted focus");
  assert.match(state?.headline ?? "", /trustworthy enough for fast revision/i);
  assert.match(state?.signals[0]?.label ?? "", /Corroborated cards/i);
});

test("buildKnowledgeGraphTrustState marks partially reinforced slices as developing", () => {
  const state = buildKnowledgeGraphTrustState({
    visibleCount: 4,
    linkedCount: 2,
    strongCount: 1,
    mediumCount: 0,
    topicalDenseCount: 1,
    corroboratedCount: 1,
    diverseSourceCount: 0,
    contradictionCount: 0,
    activeLens: "connected_notes",
    activeTag: "topic:market_failure",
    courseTag: "course:econ101",
    weekTag: null,
  });

  assert.equal(state?.grade, "developing");
  assert.match(state?.detail ?? "", /not yet dense enough/i);
  assert.match(state?.signals[1]?.value ?? "", /adding a different source type/i);
});

test("buildKnowledgeGraphTrustState marks shallow slices as fragile", () => {
  const state = buildKnowledgeGraphTrustState({
    visibleCount: 3,
    linkedCount: 0,
    strongCount: 0,
    mediumCount: 0,
    topicalDenseCount: 0,
    corroboratedCount: 0,
    diverseSourceCount: 0,
    contradictionCount: 0,
    activeLens: "study_materials",
    activeTag: null,
    courseTag: null,
    weekTag: "week:7",
  });

  assert.equal(state?.grade, "fragile");
  assert.equal(state?.badge, "Fragile focus");
  assert.match(state?.detail ?? "", /lacks enough corroboration or overlap/i);
  assert.match(state?.signals[0]?.label ?? "", /Corroboration gap/i);
});
