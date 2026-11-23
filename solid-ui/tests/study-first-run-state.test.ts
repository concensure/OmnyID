import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyFirstRunState } from "../src/lib/studyFirstRunState.ts";
import { buildFilesAdjacentSourceSeed, buildFilesStudyContinuationSeed } from "../src/lib/studyWorkspaceContinuationSeed.ts";

test("study first-run state flags a fully ready connected-notes first run", () => {
  const state = buildStudyFirstRunState({
    attachedCount: 2,
    supportedCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "Compare these sources. Show the overlap, what is new, and what I should revise first.",
    suggestedPrompt: "Compare these sources. Show the overlap, what is new, and what I should revise first.",
  });

  assert.match(state.headline, /immediate value/i);
  assert.equal(state.recommendedSetupReady, true);
  assert.equal(state.suggestedPromptReady, true);
  assert.equal(state.steps[0]?.status, "complete");
  assert.equal(state.steps[1]?.status, "complete");
  assert.equal(state.steps[2]?.status, "complete");
  assert.equal(state.steps[3]?.status, "upcoming");
});

test("study first-run state warns when attached files are not readable yet", () => {
  const state = buildStudyFirstRunState({
    attachedCount: 1,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "",
    suggestedPrompt: "Summarize this study material. Show the main concepts, definitions, and what I should revise first.",
  });

  assert.match(state.headline, /blocking/i);
  assert.equal(state.steps[0]?.status, "attention");
  assert.equal(state.steps[2]?.status, "in_progress");
});

test("study first-run state warns when nothing will be retained", () => {
  const state = buildStudyFirstRunState({
    attachedCount: 1,
    supportedCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_nothing",
    query: "Summarize this study material.",
    suggestedPrompt: "Summarize this study material.",
  });

  assert.equal(state.recommendedSetupReady, false);
  assert.equal(state.steps[1]?.status, "attention");
  assert.match(state.steps[1]?.detail ?? "", /nothing will stay/i);
});

test("study first-run state treats retained-context follow-up as ready without new attachments", () => {
  const seed = buildFilesStudyContinuationSeed({
    courseTag: "course:econ101",
    weekTag: "week:3",
  });
  const state = buildStudyFirstRunState({
    attachedCount: 0,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: seed.query,
    suggestedPrompt: seed.query,
    flowKind: seed.flowKind,
  });

  assert.match(state.headline, /retained-context study run/i);
  assert.equal(state.steps[0]?.status, "complete");
  assert.match(state.steps[0]?.detail ?? "", /Files or graph context/i);
});

test("study first-run state gives adjacent-source planning a dedicated follow-through step", () => {
  const seed = buildFilesAdjacentSourceSeed({
    courseTag: "course:phil201",
    knowledgeMode: "zettelkasten",
    zettelkastenStage: "source_note",
  });
  const state = buildStudyFirstRunState({
    attachedCount: 0,
    supportedCount: 0,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    query: seed.query,
    suggestedPrompt: seed.query,
    flowKind: seed.flowKind,
    preferredKnowledgeMode: seed.knowledgeMode,
  });

  assert.match(state.headline, /next-source planning run/i);
  assert.match(state.steps[3]?.label ?? "", /recommended adjacent source/i);
  assert.match(state.supportingText, /single best adjacent source/i);
});
