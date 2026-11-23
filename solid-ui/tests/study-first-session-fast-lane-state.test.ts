import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyFirstSessionFastLaneState } from "../src/lib/studyFirstSessionFastLaneState.ts";
import { buildFilesStudyContinuationSeed } from "../src/lib/studyWorkspaceContinuationSeed.ts";

test("study first-session fast lane prioritizes setup repair when retention is session-only", () => {
  const state = buildStudyFirstSessionFastLaneState({
    quickStartSeed: buildFilesStudyContinuationSeed({ courseTag: "course:econ101" }),
    attachedCount: 0,
    supportedCount: 0,
    queryReady: true,
    recommendedSetupReady: false,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_nothing",
  });

  assert.equal(state.primaryActionId, "use_recommended_setup");
  assert.match(state.badge, /fix setup first/i);
  assert.match(state.cards[1]?.detail ?? "", /Nothing stays/i);
});

test("study first-session fast lane asks for prompt loading when source is ready but prompt is missing", () => {
  const state = buildStudyFirstSessionFastLaneState({
    quickStartSeed: buildFilesStudyContinuationSeed({ courseTag: "course:econ101" }),
    attachedCount: 1,
    supportedCount: 1,
    queryReady: false,
    recommendedSetupReady: true,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state.primaryActionId, "load_prompt");
  assert.match(state.headline, /grounded prompt/i);
});

test("study first-session fast lane marks retained-context follow-up as ready to run", () => {
  const seed = buildFilesStudyContinuationSeed({
    courseTag: "course:econ101",
    weekTag: "week:3",
  });
  const state = buildStudyFirstSessionFastLaneState({
    quickStartSeed: seed,
    attachedCount: 0,
    supportedCount: 0,
    queryReady: true,
    recommendedSetupReady: true,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state.primaryActionId, "run_now");
  assert.match(state.badge, /Retained context ready/i);
});
