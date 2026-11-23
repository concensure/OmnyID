import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphExplorerFocusState } from "../src/lib/knowledgeGraphExplorerFocusState.ts";

test("buildKnowledgeGraphExplorerFocusState suggests the strongest cluster when unfocused", () => {
  const state = buildKnowledgeGraphExplorerFocusState({
    visibleCount: 12,
    totalCount: 12,
    linkedCount: 7,
    strongCount: 3,
    denseCount: 2,
    visibleSupertagCount: 6,
    searchQuery: "",
    activeTag: null,
    activeLens: "all",
    activeConnectionStrength: null,
    courseTag: "ECON101",
    weekTag: "Week 3",
    lectureTag: null,
    recommendedTag: "topic:market failure",
    clusterTags: ["topic:market failure", "topic:public goods", "course:ECON101"],
  });

  assert.match(state?.headline ?? "", /Showing 12 graph cards/i);
  assert.equal(state?.suggestedTags[0], "topic:market failure");
  assert.match(state?.nextRefinement ?? "", /market failure/i);
});

test("buildKnowledgeGraphExplorerFocusState describes an active focused slice", () => {
  const state = buildKnowledgeGraphExplorerFocusState({
    visibleCount: 5,
    totalCount: 12,
    linkedCount: 4,
    strongCount: 2,
    denseCount: 1,
    visibleSupertagCount: 3,
    searchQuery: "opportunity cost",
    activeTag: "topic:market failure",
    activeLens: "linked_ideas",
    activeConnectionStrength: "high",
    courseTag: "ECON101",
    weekTag: "Week 3",
    lectureTag: "Lecture 3",
    recommendedTag: "topic:market failure",
    clusterTags: ["topic:market failure", "topic:public goods"],
  });

  assert.match(state?.headline ?? "", /Showing 5 graph cards/i);
  assert.deepEqual(state?.appliedFocus.includes('keyword "opportunity cost"'), true);
  assert.deepEqual(state?.appliedFocus.includes("Linked ideas"), true);
  assert.equal(state?.badge, "2 strong");
  assert.match(state?.nextRefinement ?? "", /concept keyword|cluster|widen/i);
});

test("buildKnowledgeGraphExplorerFocusState returns null for empty graph slices", () => {
  const state = buildKnowledgeGraphExplorerFocusState({
    visibleCount: 0,
    totalCount: 0,
    linkedCount: 0,
    strongCount: 0,
    denseCount: 0,
    visibleSupertagCount: 0,
    searchQuery: "",
    activeTag: null,
    activeLens: "all",
    activeConnectionStrength: null,
    courseTag: null,
    weekTag: null,
    lectureTag: null,
    recommendedTag: null,
    clusterTags: [],
  });

  assert.equal(state, null);
});
