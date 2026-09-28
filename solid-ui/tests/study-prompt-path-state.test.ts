import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyPromptPathState } from "../src/lib/studyPromptPathState.ts";

test("buildStudyPromptPathState creates comparison path for multi-source connected notes", () => {
  const state = buildStudyPromptPathState({
    knowledgeMode: "connected_notes",
    supportedCount: 2,
    quickStartSeed: {
      label: "Ask from linked ideas",
      description: "",
      query: "",
      notice: "",
      helper: "",
      valuePromise: "",
      recommendedUpload: "",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      focusBadges: ["topic:market_failures", "lens linked ideas"],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.match(state.headline, /study path/i);
  assert.equal(state.recommendedPathId, "compare");
  assert.match(state.recommendationReason ?? "", /multiple related sources/i);
  assert.equal(state.options.some((option) => option.id === "compare"), true);
  assert.equal(state.options.find((option) => option.id === "compare")?.recommended, true);
  assert.match(state.options[0]?.prompt ?? "", /topic:market_failures/i);
});

test("buildStudyPromptPathState omits comparison path for single-source connected notes", () => {
  const state = buildStudyPromptPathState({
    knowledgeMode: "connected_notes",
    supportedCount: 1,
  });

  assert.equal(state.options.some((option) => option.id === "compare"), false);
  assert.equal(state.recommendedPathId, "summary");
  assert.equal(state.options.some((option) => option.id === "summary"), true);
  assert.equal(state.options.find((option) => option.id === "summary")?.prompts.length, 3);
});

test("buildStudyPromptPathState switches to note-development options for zettelkasten", () => {
  const state = buildStudyPromptPathState({
    knowledgeMode: "zettelkasten",
    supportedCount: 1,
    quickStartSeed: {
      label: "Continue this note chain",
      description: "",
      query: "",
      notice: "",
      helper: "",
      valuePromise: "",
      recommendedUpload: "",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      focusBadges: ["course:phil201", "stage source note"],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.match(state.headline, /note-development/i);
  assert.equal(state.recommendedPathId, "notes");
  assert.equal(state.options.some((option) => option.id === "notes"), true);
  assert.equal(state.options.find((option) => option.id === "notes")?.recommended, true);
  assert.match(state.options[0]?.prompt ?? "", /course:phil201/i);
});

test("buildStudyPromptPathState uses normalized report focus labels", () => {
  const state = buildStudyPromptPathState({
    knowledgeMode: "connected_notes",
    supportedCount: 1,
    quickStartSeed: {
      label: "Saved report",
      description: "",
      query: "",
      notice: "",
      helper: "",
      valuePromise: "",
      recommendedUpload: "",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      focusBadges: [
        "report_kind:flashcard_deck",
        "course_tag:course:bio101",
        "session:guided-1",
        "source_need:lecture notes",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.match(state.supportingText, /flashcard deck report, course:bio101, guided session guided-1/i);
  assert.doesNotMatch(state.supportingText, /report_kind:/i);
  assert.doesNotMatch(state.options[0]?.prompt ?? "", /source_need:/i);
});

test("buildStudyPromptPathState recommends revision for medical topology carryover gaps", () => {
  const state = buildStudyPromptPathState({
    knowledgeMode: "connected_notes",
    supportedCount: 2,
    quickStartSeed: {
      label: "Saved medical topology deck",
      description: "",
      query: "",
      notice: "",
      helper: "",
      valuePromise: "",
      recommendedUpload: "",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      focusBadges: [
        "report_kind:flashcard_deck",
        "course_tag:course:med101",
        "medical_topology_coverage",
        "topology_gap:needs_locator",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.equal(state.recommendedPathId, "revise");
  assert.match(state.recommendationReason ?? "", /medical topology carryover/i);
  assert.match(state.supportingText, /medical topology needs source locator/i);
  assert.match(state.options.find((option) => option.id === "revise")?.prompt ?? "", /medical topology needs source locator/i);
  assert.equal(state.options.find((option) => option.id === "compare")?.recommended, false);
});
