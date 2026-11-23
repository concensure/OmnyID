import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphRobustnessState } from "../src/lib/knowledgeGraphRobustnessState.ts";

test("buildKnowledgeGraphRobustnessState flags early sparse graphs", () => {
  const state = buildKnowledgeGraphRobustnessState({
    totalCards: 2,
    linkedCards: 0,
    strongCount: 0,
    mediumCount: 0,
    lightCount: 0,
    courseCount: 1,
    weekCount: 1,
    lectureCount: 1,
    topicalDenseCount: 0,
    corroboratedCount: 0,
    diverseSourceCount: 0,
    zettelkastenCount: 0,
    permanentCount: 0,
    reviewQueueCount: 0,
    activeConnectionStrength: null,
    activeLens: "all",
  });

  assert.equal(state?.grade, "warming_up");
  assert.equal(state?.primaryActionLabel, "Open retained sources");
});

test("buildKnowledgeGraphRobustnessState focuses review queues before permanent notes exist", () => {
  const state = buildKnowledgeGraphRobustnessState({
    totalCards: 6,
    linkedCards: 4,
    strongCount: 1,
    mediumCount: 1,
    lightCount: 2,
    courseCount: 1,
    weekCount: 2,
    lectureCount: 2,
    topicalDenseCount: 2,
    corroboratedCount: 1,
    diverseSourceCount: 1,
    zettelkastenCount: 4,
    permanentCount: 0,
    reviewQueueCount: 2,
    activeConnectionStrength: null,
    activeLens: "zettelkasten",
  });

  assert.equal(state?.grade, "developing");
  assert.equal(state?.primaryActionId, "focus_review_queue");
});

test("buildKnowledgeGraphRobustnessState recognizes robust graph coverage", () => {
  const state = buildKnowledgeGraphRobustnessState({
    totalCards: 8,
    linkedCards: 6,
    strongCount: 3,
    mediumCount: 2,
    lightCount: 1,
    courseCount: 2,
    weekCount: 3,
    lectureCount: 3,
    topicalDenseCount: 4,
    corroboratedCount: 3,
    diverseSourceCount: 2,
    zettelkastenCount: 2,
    permanentCount: 1,
    reviewQueueCount: 0,
    activeConnectionStrength: null,
    activeLens: "all",
  });

  assert.equal(state?.grade, "robust");
  assert.equal(state?.primaryActionLabel, "Show strongest links");
});
