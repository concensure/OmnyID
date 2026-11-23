import assert from "node:assert/strict";
import test from "node:test";

import { buildStudySessionKickoffState } from "../src/lib/studySessionKickoffState.ts";
import { DEFAULT_STUDENT_ONBOARDING_QUICK_START } from "../src/lib/onboardingQuickStart.ts";
import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";
import { buildFilesAdjacentSourceSeed, buildFilesStudyContinuationSeed } from "../src/lib/studyWorkspaceContinuationSeed.ts";

test("buildStudySessionKickoffState asks for files first when none are attached", () => {
  const state = buildStudySessionKickoffState({
    quickStartSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
    attachedCount: 0,
    supportedCount: 0,
    queryReady: true,
    recommendedSetupReady: true,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state?.primaryActionId, "pick_files");
  assert.equal(state?.tone, "sky");
});

test("buildStudySessionKickoffState uses report-specific source guidance", () => {
  const state = buildStudySessionKickoffState({
    quickStartSeed: buildReportQuickStartSeed({
      kind: "assignment_plan",
      goal: "Plan my essay assignment.",
      messages: [],
    }),
    attachedCount: 0,
    supportedCount: 0,
    queryReady: true,
    recommendedSetupReady: true,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state?.primaryActionId, "pick_files");
  assert.match(state?.detail ?? "", /assignment brief/i);
  assert.match(state?.detail ?? "", /rubric/i);
  assert.doesNotMatch(state?.detail ?? "", /^Use Best with/i);
});

test("buildStudySessionKickoffState fixes retention before encouraging a run", () => {
  const state = buildStudySessionKickoffState({
    quickStartSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
    attachedCount: 1,
    supportedCount: 1,
    queryReady: true,
    recommendedSetupReady: false,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_nothing",
  });

  assert.equal(state?.primaryActionId, "use_recommended_setup");
  assert.equal(state?.secondaryActionId, "run_now");
  assert.equal(state?.tone, "amber");
});

test("buildStudySessionKickoffState allows immediate run when the session is ready", () => {
  const state = buildStudySessionKickoffState({
    quickStartSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
    attachedCount: 2,
    supportedCount: 2,
    queryReady: true,
    recommendedSetupReady: true,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state?.primaryActionId, "run_now");
  assert.equal(state?.tone, "emerald");
});

test("buildStudySessionKickoffState treats retained-context follow-up as run-ready without new attachments", () => {
  const state = buildStudySessionKickoffState({
    quickStartSeed: buildFilesStudyContinuationSeed({
      courseTag: "course:econ101",
      weekTag: "week:3",
    }),
    attachedCount: 0,
    supportedCount: 0,
    queryReady: true,
    recommendedSetupReady: true,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state?.primaryActionId, "run_now");
  assert.equal(state?.tone, "emerald");
  assert.match(state?.headline ?? "", /retained study focus/i);
  assert.equal(state?.steps[0]?.status, "upcoming");
});

test("buildStudySessionKickoffState treats adjacent-source planning as immediate value", () => {
  const state = buildStudySessionKickoffState({
    quickStartSeed: buildFilesAdjacentSourceSeed({
      courseTag: "course:phil201",
      zettelkastenStage: "source_note",
      knowledgeMode: "zettelkasten",
    }),
    attachedCount: 0,
    supportedCount: 0,
    queryReady: true,
    recommendedSetupReady: true,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state?.primaryActionId, "run_now");
  assert.match(state?.primaryActionLabel ?? "", /plan next source/i);
  assert.match(state?.headline ?? "", /next source/i);
});
