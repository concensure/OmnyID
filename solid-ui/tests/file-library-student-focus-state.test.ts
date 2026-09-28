import assert from "node:assert/strict";
import test from "node:test";

import { buildFileLibraryStudentFocusState } from "../src/lib/fileLibraryStudentFocusState.ts";

test("buildFileLibraryStudentFocusState highlights ready connected study retrieval", () => {
  const state = buildFileLibraryStudentFocusState({
    visibleCount: 6,
    matchingCount: 6,
    readyCount: 3,
    developingCount: 2,
    archivalCount: 1,
    extractedOnlyCount: 2,
    keptFileCount: 2,
    connectedNotesCount: 3,
    zettelkastenCount: 0,
    reviewQueueCount: 0,
    linkedCount: 4,
    visibleTagCount: 9,
    hasActiveFilters: false,
    activeKnowledgeMode: "connected_notes",
    activeStudyReadiness: "all",
    activeRetention: "all",
    activeZettelkastenStage: "all",
  });

  assert.match(state?.headline ?? "", /strong enough for same-topic study retrieval/i);
  assert.equal(state?.primaryActionId, "show_ready_only");
  assert.equal(state?.secondaryActionId, "show_extracted_only");
});

test("buildFileLibraryStudentFocusState prioritizes zettelkasten review queues", () => {
  const state = buildFileLibraryStudentFocusState({
    visibleCount: 4,
    matchingCount: 4,
    readyCount: 1,
    developingCount: 3,
    archivalCount: 0,
    extractedOnlyCount: 3,
    keptFileCount: 0,
    connectedNotesCount: 0,
    zettelkastenCount: 4,
    reviewQueueCount: 2,
    linkedCount: 2,
    visibleTagCount: 5,
    hasActiveFilters: true,
    activeKnowledgeMode: "zettelkasten",
    activeStudyReadiness: "developing",
    activeRetention: "keep_extracted_only",
    activeZettelkastenStage: "review_pending",
  });

  assert.equal(state?.badge, "Review queue ready");
  assert.equal(state?.primaryActionId, "show_review_queue");
  assert.equal(state?.secondaryActionId, "clear_filters");
});

test("buildFileLibraryStudentFocusState recommends narrower filtering for mixed noisy views", () => {
  const state = buildFileLibraryStudentFocusState({
    visibleCount: 5,
    matchingCount: 5,
    readyCount: 1,
    developingCount: 1,
    archivalCount: 3,
    extractedOnlyCount: 2,
    keptFileCount: 1,
    connectedNotesCount: 1,
    zettelkastenCount: 0,
    reviewQueueCount: 0,
    linkedCount: 1,
    visibleTagCount: 2,
    hasActiveFilters: false,
    activeKnowledgeMode: "all",
    activeStudyReadiness: "all",
    activeRetention: "all",
    activeZettelkastenStage: "all",
  });

  assert.equal(state?.badge, "Needs narrower focus");
  assert.equal(state?.primaryActionId, "show_extracted_only");
});
