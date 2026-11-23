import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphStudentFocusState } from "../src/lib/knowledgeGraphStudentFocusState.ts";

test("knowledge graph student focus prioritizes review queue for zettelkasten-heavy views", () => {
  const state = buildKnowledgeGraphStudentFocusState({
    visibleCount: 6,
    totalCount: 10,
    linkedCount: 4,
    strongCount: 2,
    denseCount: 1,
    visibleSupertagCount: 5,
    connectedNotesCount: 1,
    zettelkastenCount: 4,
    reviewQueueCount: 3,
    permanentNotesCount: 0,
    recommendedTag: "topic:memory",
    activeTag: null,
    activeLens: "all",
    activeConnectionStrength: null,
    hasActiveFilters: false,
  });

  assert.equal(state?.primaryActionId, "focus_review_queue");
  assert.match(state?.badge ?? "", /review queue ready/i);
});

test("knowledge graph student focus prefers strongest cluster for revision-ready graphs", () => {
  const state = buildKnowledgeGraphStudentFocusState({
    visibleCount: 8,
    totalCount: 12,
    linkedCount: 6,
    strongCount: 3,
    denseCount: 2,
    visibleSupertagCount: 7,
    connectedNotesCount: 5,
    zettelkastenCount: 0,
    reviewQueueCount: 0,
    permanentNotesCount: 0,
    recommendedTag: "topic:market-failures",
    activeTag: null,
    activeLens: "linked_ideas",
    activeConnectionStrength: null,
    hasActiveFilters: true,
  });

  assert.equal(state?.primaryActionId, "focus_cluster");
  assert.match(state?.headline ?? "", /strong enough/i);
});

test("knowledge graph student focus pushes next-source planning for shallow graphs", () => {
  const state = buildKnowledgeGraphStudentFocusState({
    visibleCount: 2,
    totalCount: 4,
    linkedCount: 0,
    strongCount: 0,
    denseCount: 0,
    visibleSupertagCount: 1,
    connectedNotesCount: 1,
    zettelkastenCount: 0,
    reviewQueueCount: 0,
    permanentNotesCount: 0,
    recommendedTag: null,
    activeTag: null,
    activeLens: "all",
    activeConnectionStrength: null,
    hasActiveFilters: false,
  });

  assert.equal(state?.primaryActionId, "plan_next_source");
  assert.match(state?.badge ?? "", /needs one more anchor/i);
});
