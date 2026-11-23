import assert from "node:assert/strict";
import test from "node:test";

import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";
import { buildStudyQuickStartChoiceState } from "../src/lib/studyQuickStartChoiceState.ts";
import { DEFAULT_STUDENT_ONBOARDING_QUICK_START, studentQuickStartForIntent } from "../src/lib/onboardingQuickStart.ts";

test("buildStudyQuickStartChoiceState marks the default connected-notes starter as selected and recommended", () => {
  const state = buildStudyQuickStartChoiceState({
    activeQuickStart: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  });

  assert.equal(state.cards.length, 5);
  assert.equal(state.cards[0]?.intent, "first_upload");
  assert.equal(state.cards[0]?.selected, true);
  assert.equal(state.cards[0]?.recommended, true);
  assert.match(state.cards[0]?.retentionLabel ?? "", /keep extracted/i);
});

test("buildStudyQuickStartChoiceState switches selection to zettelkasten when that flow is active", () => {
  const state = buildStudyQuickStartChoiceState({
    activeQuickStart: studentQuickStartForIntent("zettelkasten_chain"),
  });

  const selected = state.cards.find((card) => card.selected);
  assert.equal(selected?.intent, "zettelkasten_chain");
  assert.match(selected?.knowledgeModeLabel ?? "", /zettelkasten/i);
});

test("buildStudyQuickStartChoiceState recognizes assignment-focused quick starts", () => {
  const state = buildStudyQuickStartChoiceState({
    activeQuickStart: studentQuickStartForIntent("assignment_plan"),
  });

  const selected = state.cards.find((card) => card.selected);
  assert.equal(selected?.intent, "assignment_plan");
  assert.match(selected?.emphasis ?? "", /what to do first on an assignment/i);
});

test("buildStudyQuickStartChoiceState maps report seeds to the nearest existing study path", () => {
  const reportCases = [
    { kind: "exam_preparation", expected: "first_upload" },
    { kind: "assignment_plan", expected: "assignment_plan" },
    { kind: "weekly_revision", expected: "week_summary" },
    { kind: "day_schedule", expected: "week_summary" },
    { kind: "zettelkasten_synthesis", expected: "zettelkasten_chain" },
    { kind: "course_builder", expected: "week_summary" },
    { kind: "quiz_generator", expected: "compare_sources" },
    { kind: "flashcard_deck", expected: "compare_sources" },
    { kind: "cheatsheet", expected: "week_summary" },
    { kind: "lecture_summary", expected: "week_summary" },
    { kind: "practice_questions", expected: "compare_sources" },
    { kind: "guided_study_session", expected: "week_summary" },
  ] as const;

  for (const reportCase of reportCases) {
    const state = buildStudyQuickStartChoiceState({
      activeQuickStart: buildReportQuickStartSeed({
        kind: reportCase.kind,
        goal: "Create a useful report from my study context.",
        messages: [],
      }),
    });
    const selected = state.cards.find((card) => card.selected);
    assert.equal(selected?.intent, reportCase.expected);
  }
});
