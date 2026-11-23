import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyZeroStateStarterState } from "../src/lib/studyZeroStateStarterState.ts";

test("buildStudyZeroStateStarterState recommends a first-upload path for Files", () => {
  const state = buildStudyZeroStateStarterState({ surface: "files" });
  assert.match(state.headline, /retained study files appear here automatically/i);
  assert.match(state.recommendedRetentionLabel, /keep extracted notes only/i);
  assert.equal(state.starterActions[0]?.intent, "first_upload");
  assert.equal(state.starterActions[0]?.recommended, true);
  assert.ok((state.firstOutputs?.length ?? 0) >= 3);
});

test("buildStudyZeroStateStarterState recommends a comparison path for Knowledge Graph", () => {
  const state = buildStudyZeroStateStarterState({ surface: "graph" });
  assert.match(state.headline, /linked ideas can form automatically/i);
  assert.equal(state.starterActions[0]?.intent, "compare_sources");
  assert.match(state.detail, /lecture source with a nearby reading, note, or voice memo/i);
  assert.equal(state.starterActions.some((action) => action.intent === "assignment_plan"), true);
  assert.equal(state.starterActions.some((action) => action.intent === "zettelkasten_chain"), true);
});
