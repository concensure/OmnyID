import assert from "node:assert/strict";
import test from "node:test";

import { buildFileLibraryValuePathState } from "../src/lib/fileLibraryValuePathState.ts";

test("buildFileLibraryValuePathState directs empty study views to upload", () => {
  const state = buildFileLibraryValuePathState({
    visibleCount: 3,
    studyCount: 0,
    readyCount: 0,
    developingCount: 0,
    archivalCount: 3,
    linkedCount: 0,
    visibleTagCount: 0,
    knowledgeMode: "all",
    hasActiveFilters: false,
    showingReadyOnly: false,
  });

  assert.equal(state?.grade, "warmup");
  assert.equal(state?.primaryActionId, "open_study_chat");
});

test("buildFileLibraryValuePathState recognizes cross-source ready file sets", () => {
  const state = buildFileLibraryValuePathState({
    visibleCount: 4,
    studyCount: 4,
    readyCount: 2,
    developingCount: 2,
    archivalCount: 0,
    linkedCount: 3,
    visibleTagCount: 5,
    knowledgeMode: "connected_notes",
    hasActiveFilters: true,
    showingReadyOnly: false,
  });

  assert.equal(state?.grade, "ready");
  assert.equal(state?.primaryActionId, "open_study_chat");
  assert.equal(state?.secondaryActionId, "open_matching_graph");
});

test("buildFileLibraryValuePathState steers zettelkasten views to branch continuation", () => {
  const state = buildFileLibraryValuePathState({
    visibleCount: 3,
    studyCount: 3,
    readyCount: 2,
    developingCount: 1,
    archivalCount: 0,
    linkedCount: 2,
    visibleTagCount: 4,
    knowledgeMode: "zettelkasten",
    hasActiveFilters: true,
    showingReadyOnly: false,
  });

  assert.equal(state?.grade, "zettelkasten");
  assert.equal(state?.primaryActionLabel, "Continue note chain");
});

test("buildFileLibraryValuePathState gives single-source developing path", () => {
  const state = buildFileLibraryValuePathState({
    visibleCount: 2,
    studyCount: 2,
    readyCount: 1,
    developingCount: 1,
    archivalCount: 0,
    linkedCount: 1,
    visibleTagCount: 2,
    knowledgeMode: "connected_notes",
    hasActiveFilters: true,
    showingReadyOnly: false,
  });

  assert.equal(state?.grade, "developing");
  assert.equal(state?.primaryActionId, "show_ready_first");
  assert.equal(state?.secondaryActionId, "plan_next_source");
});
