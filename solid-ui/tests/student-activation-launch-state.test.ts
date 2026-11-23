import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";
import { buildStudentActivationLaunchState } from "../src/lib/studentActivationLaunchState.ts";
import { DEFAULT_STUDENT_ONBOARDING_QUICK_START } from "../src/lib/onboardingQuickStart.ts";

function message(overrides: Partial<AfpMessage>): AfpMessage {
  return {
    id: "msg_1",
    thread_id: "thread_1",
    from: "user",
    timestamp: "2026-09-08T00:00:00Z",
    type: "knowledge_card",
    supertags: [],
    content: {},
    metadata: {},
    views: [],
    attachments: [],
    ...overrides,
  };
}

test("buildStudentActivationLaunchState requires ai before student launch", () => {
  const state = buildStudentActivationLaunchState({
    llmReady: false,
    gmailReady: false,
    recommendedSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  });

  assert.equal(state.tone, "amber");
  assert.equal(state.primaryActionLabel, "Connect AI first");
  assert.match(state.firstUploadTitle, /first upload/i);
  assert.match(state.firstMinuteTitle, /first 60 seconds/i);
  assert.equal(state.firstMinuteChecklist.length, 4);
  assert.equal(state.firstValueChecklist.length, 3);
  assert.equal(state.featuredStarters.length, 3);
  assert.equal(state.featuredStarters[0]?.slot, "primary");
});

test("buildStudentActivationLaunchState prioritizes study value before gmail", () => {
  const state = buildStudentActivationLaunchState({
    llmReady: true,
    gmailReady: false,
    recommendedSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  });

  assert.equal(state.tone, "sky");
  assert.equal(state.primaryActionLabel, "Open study workspace");
  assert.equal(state.secondaryActionLabel, "Connect Gmail later");
  assert.match(state.firstUploadDetail, /lecture pdf/i);
  assert.match(state.firstMinuteDetail, /attach one real class source/i);
  assert.match(state.firstValueChecklist[1] ?? "", /keep extracted notes/i);
  assert.match(state.featuredStarters[1]?.badge ?? "", /lowest effort/i);
  assert.match(state.featuredStarters[2]?.starter.label ?? "", /source-note chain/i);
});

test("buildStudentActivationLaunchState cleans optional report upload guidance", () => {
  const reportSeed = buildReportQuickStartSeed({
    kind: "assignment_plan",
    goal: "Plan my annotated bibliography assignment.",
    messages: [
      message({
        id: "brief",
        supertags: ["course:eng101", "topic:annotated_bibliography"],
        content: { title: "Annotated bibliography brief", summary: "Assessment instructions." },
        metadata: {
          academic_course_tag: "course:eng101",
          knowledge_graph_group_key: "topic:annotated_bibliography",
        },
      }),
    ],
  });
  const state = buildStudentActivationLaunchState({
    llmReady: true,
    gmailReady: false,
    recommendedSeed: reportSeed,
  });

  assert.match(reportSeed.recommendedUpload, /^Optional:/);
  assert.doesNotMatch(state.detail, /upload optional:/i);
  assert.doesNotMatch(state.firstMinuteChecklist[1] ?? "", /^Optional:/i);
  assert.match(state.detail, /assignment brief or rubric/i);
});

test("buildStudentActivationLaunchState exposes saved report memory", () => {
  const state = buildStudentActivationLaunchState({
    llmReady: true,
    gmailReady: false,
    recommendedSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
    savedReportArtifacts: [
      {
        id: "exam",
        title: "ECON101 final exam plan",
        filename: "econ101-final-exam-plan.md",
        markdown: "# Exam preparation report\n",
        mimeType: "text/markdown;charset=utf-8",
        reportKind: "exam_preparation",
        reportLabel: "exam preparation report",
        outputFormat: "print_ready",
        sourceLabels: ["Week 3 slides.pdf"],
        policyLabel: "Keep extracted notes only",
        sectionCount: 4,
        createdAt: 10,
      },
    ],
  });

  assert.equal(state.savedReportMemory?.savedCount, 1);
  assert.match(state.savedReportMemory?.detail ?? "", /ECON101 final exam plan/);
  assert.equal(state.savedReportMemory?.primaryActionLabel, "Continue latest output");
  assert.match(state.savedReportMemory?.primaryQuickStartSeed.query ?? "", /ECON101 final exam plan/);
});
