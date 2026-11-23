import assert from "node:assert/strict";
import test from "node:test";

import { buildStudentStudyOutcomeState } from "../src/lib/studentStudyOutcomeState.ts";
import { studentQuickStartForIntent } from "../src/lib/onboardingQuickStart.ts";
import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";
import { buildFilesAdjacentSourceSeed, buildFilesStudyContinuationSeed } from "../src/lib/studyWorkspaceContinuationSeed.ts";

test("buildStudentStudyOutcomeState recommends a run when the first study pass is ready", () => {
  const state = buildStudentStudyOutcomeState({
    attachedCount: 2,
    supportedCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "Compare these sources and tell me what to revise first.",
    suggestedPrompt: null,
    quickStartSeed: studentQuickStartForIntent("compare_sources"),
  });

  assert.equal(state.badge, "Immediate student value");
  assert.equal(state.primaryActionId, "run_now");
  assert.match(state.cards[2]?.detail ?? "", /Files|Linked ideas|next session/i);
  assert.match(state.pressureReliefLabel, /reduce pressure/i);
});

test("buildStudentStudyOutcomeState flags unreadable first runs as blocked", () => {
  const state = buildStudentStudyOutcomeState({
    attachedCount: 1,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "",
    suggestedPrompt: "Summarize this week 3 lecture material",
    quickStartSeed: studentQuickStartForIntent("week_summary"),
  });

  assert.equal(state.badge, "One blocker remains");
  assert.equal(state.primaryActionId, "add_supported_file");
  assert.match(state.detail, /readable/i);
});

test("buildStudentStudyOutcomeState warns when nothing is retained", () => {
  const state = buildStudentStudyOutcomeState({
    attachedCount: 1,
    supportedCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_nothing",
    query: "",
    suggestedPrompt: "Turn this file into connected notes",
    quickStartSeed: studentQuickStartForIntent("first_upload"),
  });

  assert.equal(state.primaryActionId, "use_recommended_setup");
  assert.match(state.cards[1]?.detail ?? "", /Nothing is retained/i);
  assert.match(state.pressureReliefLabel, /stops after this chat ends/i);
});

test("buildStudentStudyOutcomeState treats retained-context follow-up as immediate value without attachments", () => {
  const state = buildStudentStudyOutcomeState({
    attachedCount: 0,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "Using course:econ101 and week:3, summarize what matters most next.",
    suggestedPrompt: null,
    quickStartSeed: buildFilesStudyContinuationSeed({
      courseTag: "course:econ101",
      weekTag: "week:3",
    }),
  });

  assert.equal(state.badge, "Immediate student value");
  assert.equal(state.primaryActionId, "run_now");
  assert.match(state.pressureReliefLabel, /retained study context/i);
});

test("buildStudentStudyOutcomeState labels adjacent-source planning as next-source value", () => {
  const state = buildStudentStudyOutcomeState({
    attachedCount: 0,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "Using topic:market_failures, tell me the single best adjacent source I should attach next.",
    suggestedPrompt: null,
    quickStartSeed: buildFilesAdjacentSourceSeed({
      activeTag: "topic:market_failures",
    }),
  });

  assert.equal(state.badge, "Next-source value");
  assert.equal(state.primaryActionId, "run_now");
  assert.match(state.primaryActionLabel, /plan next source/i);
  assert.match(state.continuationLabel, /attach the recommended adjacent/i);
});

test("buildStudentStudyOutcomeState uses report action copy for report seeds", () => {
  const reportSeed = buildReportQuickStartSeed({
    kind: "exam_preparation",
    goal: "Prepare for my biology exam.",
    messages: [],
  });
  const state = buildStudentStudyOutcomeState({
    attachedCount: 1,
    supportedCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: reportSeed.query,
    suggestedPrompt: null,
    quickStartSeed: reportSeed,
  });

  assert.equal(state.primaryActionId, "run_now");
  assert.equal(state.primaryActionLabel, "Generate report");
  assert.match(state.headline, /report/i);
  assert.match(state.detail, /exam preparation report/i);
});

test("buildStudentStudyOutcomeState loads report prompts when a report query is missing", () => {
  const reportSeed = buildReportQuickStartSeed({
    kind: "assignment_plan",
    goal: "Plan my essay.",
    messages: [],
  });
  const state = buildStudentStudyOutcomeState({
    attachedCount: 1,
    supportedCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    query: "",
    suggestedPrompt: reportSeed.query,
    quickStartSeed: reportSeed,
  });

  assert.equal(state.primaryActionId, "load_suggested_prompt");
  assert.equal(state.primaryActionLabel, "Load report prompt");
});
