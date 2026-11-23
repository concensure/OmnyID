import assert from "node:assert/strict";
import test from "node:test";

import { buildFileLibraryNextActionState } from "../src/lib/fileLibraryNextActionState.ts";

test("buildFileLibraryNextActionState pushes students back to upload when no study files are visible", () => {
  const state = buildFileLibraryNextActionState({
    visibleCount: 4,
    studyCount: 0,
    readyCount: 0,
    developingCount: 0,
    archivalCount: 4,
    knowledgeMode: "all",
    hasActiveFilters: false,
    showingReadyOnly: false,
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.primaryActionLabel, "Start study upload");
});

test("buildFileLibraryNextActionState highlights multi-source readiness", () => {
  const state = buildFileLibraryNextActionState({
    visibleCount: 5,
    studyCount: 4,
    readyCount: 2,
    developingCount: 2,
    archivalCount: 1,
    knowledgeMode: "connected_notes",
    hasActiveFilters: true,
    showingReadyOnly: false,
  });

  assert.equal(state?.tone, "emerald");
  assert.equal(state?.primaryActionLabel, "Ask from this study focus");
  assert.equal(state?.secondaryActionLabel, "Open matching graph view");
});

test("buildFileLibraryNextActionState recommends ready-only filter for single strong source", () => {
  const state = buildFileLibraryNextActionState({
    visibleCount: 3,
    studyCount: 3,
    readyCount: 1,
    developingCount: 1,
    archivalCount: 1,
    knowledgeMode: "zettelkasten",
    hasActiveFilters: true,
    showingReadyOnly: false,
  });

  assert.equal(state?.tone, "sky");
  assert.equal(state?.secondaryActionId, "show_ready_first");
  assert.equal(state?.primaryActionLabel, "Continue note chain");
});
