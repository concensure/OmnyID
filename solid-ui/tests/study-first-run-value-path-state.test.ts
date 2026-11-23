import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyFirstRunValuePathState } from "../src/lib/studyFirstRunValuePathState.ts";

test("buildStudyFirstRunValuePathState explains retained connected-notes value path", () => {
  const state = buildStudyFirstRunValuePathState({
    supportedCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.match(state.headline, /immediate value and a reusable study trail/i);
  assert.equal(state.badge, "Answer + linked memory");
  assert.equal(state.steps[0]?.label, "Answer now");
  assert.match(state.steps[1]?.detail ?? "", /extracted notes, academic tags, and supertags/i);
  assert.match(state.steps[2]?.detail ?? "", /review the retained sources in Files, then inspect Linked ideas/i);
});

test("buildStudyFirstRunValuePathState explains zettelkasten follow-through", () => {
  const state = buildStudyFirstRunValuePathState({
    supportedCount: 1,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state.badge, "First source note");
  assert.match(state.steps[0]?.detail ?? "", /one usable source note/i);
  assert.match(state.steps[2]?.label ?? "", /continue the note chain/i);
  assert.match(state.steps[2]?.detail ?? "", /strengthen the Zettelkasten chain/i);
});

test("buildStudyFirstRunValuePathState warns when nothing is retained", () => {
  const state = buildStudyFirstRunValuePathState({
    supportedCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_nothing",
  });

  assert.equal(state.badge, "Session only");
  assert.equal(state.primaryActionLabel, "Use Keep extracted notes first");
  assert.match(state.detail, /will not build the reusable study system/i);
  assert.equal(state.steps[1]?.label, "Nothing stays");
  assert.equal(state.steps[2]?.tone, "amber");
});
