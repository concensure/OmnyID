import assert from "node:assert/strict";
import test from "node:test";

import { buildFileExplorerFocusState } from "../src/lib/fileExplorerFocusState.ts";

test("buildFileExplorerFocusState explains broad retained-library search with supertag suggestions", () => {
  const state = buildFileExplorerFocusState({
    matchingCount: 18,
    visibleCount: 18,
    readyCount: 7,
    linkedCount: 12,
    visibleTagCount: 24,
    query: "",
    activeTag: null,
    courseTag: null,
    weekTag: null,
    lectureTag: null,
    knowledgeMode: "all",
    studyReadiness: "all",
    topTags: [
      { tag: "topic:market_failure", count: 4 },
      { tag: "week:3", count: 6 },
      { tag: "course:econ101", count: 8 },
    ],
  });

  assert.match(state.headline, /search all retained files by keyword or supertag/i);
  assert.equal(state.badge, "18 visible");
  assert.equal(state.suggestedTags[0]?.tag, "course:econ101");
  assert.equal(state.suggestedTags[1]?.tag, "week:3");
  assert.ok(state.searchExamples.includes("week 3"));
});

test("buildFileExplorerFocusState explains narrow focused study slices", () => {
  const state = buildFileExplorerFocusState({
    matchingCount: 18,
    visibleCount: 3,
    readyCount: 2,
    linkedCount: 3,
    visibleTagCount: 6,
    query: "market failures",
    activeTag: "course:econ101",
    courseTag: "course:econ101",
    weekTag: "week:3",
    lectureTag: null,
    knowledgeMode: "connected_notes",
    studyReadiness: "ready_now",
    topTags: [
      { tag: "course:econ101", count: 8 },
      { tag: "week:3", count: 6 },
      { tag: "topic:market_failure", count: 4 },
    ],
  });

  assert.match(state.headline, /showing 3 retained files/i);
  assert.match(state.headline, /keyword "market failures"/i);
  assert.match(state.detail, /knowledge graph/i);
  assert.equal(state.badge, "2 study-ready");
  assert.ok(state.appliedFocus.includes("Connected notes"));
  assert.ok(state.appliedFocus.includes("Study ready"));
  assert.equal(state.suggestedTags[0]?.tag, "week:3");
  assert.ok(state.searchExamples.some((value) => /revision|exam/i.test(value)));
});

test("buildFileExplorerFocusState explains no-match states", () => {
  const state = buildFileExplorerFocusState({
    matchingCount: 18,
    visibleCount: 0,
    readyCount: 0,
    linkedCount: 0,
    visibleTagCount: 0,
    query: "mitochondria",
    activeTag: "topic:cells",
    courseTag: null,
    weekTag: null,
    lectureTag: null,
    knowledgeMode: "zettelkasten",
    studyReadiness: "developing",
    topTags: [{ tag: "course:bio101", count: 10 }],
  });

  assert.equal(state.badge, "No matches");
  assert.match(state.detail, /no retained files match/i);
  assert.match(state.nextRefinement, /remove the narrowest filter first/i);
  assert.ok(state.searchExamples.length > 0);
});
