import assert from "node:assert/strict";
import test from "node:test";

import { buildStudySourceMixState } from "../src/lib/studySourceMixState.ts";

test("buildStudySourceMixState guides empty student workspace toward file selection", () => {
  const state = buildStudySourceMixState({
    files: [],
    supportedCount: 0,
  });

  assert.equal(state?.tone, "sky");
  assert.equal(state?.primaryActionId, "pick_files");
  assert.match(state?.headline ?? "", /Start with one real class source/i);
});

test("buildStudySourceMixState recognizes rich lecture plus reading mix", () => {
  const state = buildStudySourceMixState({
    files: [
      { name: "Week 3 Lecture Slides.pdf", type: "application/pdf" },
      { name: "Week 3 Reading Chapter 2.pdf", type: "application/pdf" },
    ],
    supportedCount: 2,
  });

  assert.equal(state?.tone, "emerald");
  assert.equal(state?.primaryActionId, "run_now");
  assert.equal(state?.secondaryActionId, "compare_path");
  assert.match(state?.graphOutcome ?? "", /stronger topic, week, and concept links/i);
});

test("buildStudySourceMixState nudges a lecture-only upload toward a second source", () => {
  const state = buildStudySourceMixState({
    files: [
      { name: "Week 5 Lecture Deck.pdf", type: "application/pdf" },
    ],
    supportedCount: 1,
  });

  assert.equal(state?.tone, "sky");
  assert.equal(state?.primaryActionLabel, "Run from lecture source");
  assert.equal(state?.secondaryActionLabel, "Add reading or note");
});

test("buildStudySourceMixState warns when attachments are unreadable", () => {
  const state = buildStudySourceMixState({
    files: [
      { name: "scan.heic", type: "image/heic" },
    ],
    supportedCount: 0,
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.primaryActionLabel, "Replace files");
  assert.match(state?.supertagOutcome ?? "", /cannot classify/i);
});
