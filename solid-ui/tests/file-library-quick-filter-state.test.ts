import assert from "node:assert/strict";
import test from "node:test";

import { buildFileLibraryQuickFilterState } from "../src/lib/fileLibraryQuickFilterState.ts";

test("buildFileLibraryQuickFilterState prioritizes week-ready study slices", () => {
  const state = buildFileLibraryQuickFilterState({
    matchingCount: 18,
    readyCount: 6,
    connectedNotesCount: 5,
    zettelkastenCount: 3,
    assignmentCount: 2,
    lectureCount: 9,
    reviewQueueCount: 1,
    topWeekTag: "Week 3",
    activeWeekTag: null,
    hasActiveFilters: false,
  });

  assert.equal(state?.shortcuts[0]?.id, "focus_this_week_ready");
  assert.match(state?.shortcuts[0]?.detail ?? "", /Week 3/i);
  assert.equal(state?.badge, "Quick retrieval");
});

test("buildFileLibraryQuickFilterState adapts to an active week focus", () => {
  const state = buildFileLibraryQuickFilterState({
    matchingCount: 10,
    readyCount: 4,
    connectedNotesCount: 3,
    zettelkastenCount: 0,
    assignmentCount: 0,
    lectureCount: 4,
    reviewQueueCount: 0,
    topWeekTag: "Week 2",
    activeWeekTag: "Week 5",
    hasActiveFilters: true,
  });

  assert.equal(state?.shortcuts[0]?.label, "Stay in this week");
  assert.equal(state?.shortcuts[0]?.id, "focus_this_week_ready");
});

test("buildFileLibraryQuickFilterState falls back to clearing when no shortcut fits", () => {
  const state = buildFileLibraryQuickFilterState({
    matchingCount: 3,
    readyCount: 0,
    connectedNotesCount: 0,
    zettelkastenCount: 0,
    assignmentCount: 0,
    lectureCount: 0,
    reviewQueueCount: 0,
    topWeekTag: null,
    activeWeekTag: null,
    hasActiveFilters: true,
  });

  assert.equal(state?.shortcuts[0]?.id, "clear_filters");
  assert.match(state?.headline ?? "", /Reset the library/i);
});

test("buildFileLibraryQuickFilterState returns null when nothing useful is available", () => {
  const state = buildFileLibraryQuickFilterState({
    matchingCount: 0,
    readyCount: 0,
    connectedNotesCount: 0,
    zettelkastenCount: 0,
    assignmentCount: 0,
    lectureCount: 0,
    reviewQueueCount: 0,
    topWeekTag: null,
    activeWeekTag: null,
    hasActiveFilters: false,
  });

  assert.equal(state, null);
});

test("buildFileLibraryQuickFilterState offers Zettelkasten continuation when source chains exist", () => {
  const state = buildFileLibraryQuickFilterState({
    matchingCount: 8,
    readyCount: 0,
    connectedNotesCount: 0,
    zettelkastenCount: 4,
    assignmentCount: 0,
    lectureCount: 0,
    reviewQueueCount: 0,
    topWeekTag: null,
    activeWeekTag: null,
    hasActiveFilters: false,
  });

  assert.equal(state?.shortcuts[0]?.id, "show_zettelkasten_sources");
  assert.match(state?.shortcuts[0]?.label ?? "", /note chains/i);
  assert.match(state?.shortcuts[0]?.detail ?? "", /developing a branch/i);
});
