import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  buildReportIntakeState,
  buildReportWorkspaceState,
  defaultReportGoal,
  nextReportGoal,
  shouldReplaceReportGoal,
} from "../src/lib/reportWorkspaceState.ts";

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

test("buildReportWorkspaceState keeps no-source report path actionable", () => {
  const state = buildReportWorkspaceState({
    kind: "exam_preparation",
    goal: "I need to pass my biology exam.",
    upcomingExam: "",
    urgency: "soon",
    stress: "stressed",
    messages: [],
  });

  assert.equal(state.template.kind, "exam_preparation");
  assert.equal(state.hasRetainedContext, false);
  assert.equal(state.canGenerate, true);
  assert.equal(state.primaryActionLabel, "Start with one source");
  assert.match(state.noSourceNotice ?? "", /attach or paste one lecture/i);
  assert.equal(state.context.readinessLevel, "needs_source");
  assert.equal(state.immediateAction.label, "Attach one source");
  assert.equal(state.intake.completionLabel, "Needs source grounding");
  assert.ok(state.intake.turns.some((turn) => /attach or paste one readable lecture/i.test(turn.text)));
  assert.ok(state.sourceRequirements.some((source) => /lecture/i.test(source.label)));
});

test("buildReportWorkspaceState summarizes focused retained context for reports", () => {
  const state = buildReportWorkspaceState({
    kind: "weekly_revision",
    goal: "Help me revise week 3.",
    upcomingExam: "Midterm next Monday",
    urgency: "urgent",
    stress: "overwhelmed",
    focus: {
      source: "knowledge_graph",
      preferredKind: "weekly_revision",
      goalHint: "Create a weekly revision report from week 3.",
      createdAt: Date.now(),
      courseTag: "course:econ101",
      weekTag: "week:3",
      activeTag: "topic:market_failures",
      notice: "Reports opened from your current Knowledge Graph focus.",
    },
    messages: [
      message({
        id: "week_3_market_failure",
        supertags: ["course:econ101", "week:3", "topic:market_failures"],
        content: {
          title: "Week 3 market failures",
          summary: "Externalities and public goods.",
        },
        metadata: {
          academic_course_tag: "course:econ101",
          academic_week_tag: "week:3",
          knowledge_graph_group_key: "topic:market_failures",
          knowledge_graph_link_tags: ["topic:externalities", "week:3"],
        },
      }),
      message({
        id: "unfocused_week",
        supertags: ["course:law101", "week:2"],
        content: {
          title: "Unfocused note",
          summary: "Different subject.",
        },
      }),
    ],
  });

  assert.equal(state.template.kind, "weekly_revision");
  assert.equal(state.hasRetainedContext, true);
  assert.equal(state.primaryActionLabel, "Generate report in Chat");
  assert.equal(state.noSourceNotice, null);
  assert.equal(state.carriedFocusLabel, "course:econ101, week:3, topic:market_failures");
  assert.equal(state.carriedFocusDetail, "from Knowledge Graph | scope: course:econ101");
  assert.equal(state.context.cardCount, 2);
  assert.equal(state.context.focusedCardCount, 1);
  assert.match(state.context.topologySummary, /1 focused knowledge card/i);
  assert.equal(state.immediateAction.label, "Do the smallest useful step");
  assert.equal(state.intake.completionLabel, "Ready to generate");
  assert.ok(state.intake.turns.some((turn) => /Help me revise week 3/i.test(turn.text)));
  assert.ok(state.intake.turns.some((turn) => /Midterm next Monday/i.test(turn.text)));
});

test("buildReportWorkspaceState exposes Study Lens attempt focus detail", () => {
  const state = buildReportWorkspaceState({
    kind: "practice_questions",
    goal: "Target my missed questions.",
    upcomingExam: "",
    urgency: "soon",
    stress: "stressed",
    focus: {
      source: "study_lens",
      preferredKind: "practice_questions",
      goalHint: "Target weak areas from my latest quiz attempt.",
      searchQuery: "quiz attempt 11/20 correct",
      activeTag: "study_attempt:quiz",
      academicKind: "study_attempt",
      courseTag: "course:law101",
      knowledgeGraphLinkTags: ["attempt:quiz", "score:11/20"],
      zettelkastenNextAction: "Use the recorded quiz attempt to generate targeted follow-up practice.",
      notice: "Reports opened from Study Lens.",
      createdAt: Date.now(),
    },
    messages: [],
  });

  assert.equal(state.carriedFocusLabel, "course:law101, study_attempt:quiz");
  assert.match(state.carriedFocusDetail ?? "", /from Study Lens/i);
  assert.match(state.carriedFocusDetail ?? "", /academic kind: study attempt/i);
  assert.match(state.carriedFocusDetail ?? "", /recorded quiz attempt/i);
  assert.match(state.carriedFocusDetail ?? "", /score:11\/20/i);
  assert.ok(state.intake.turns.some((turn) => /Carried focus: from Study Lens/i.test(turn.text)));
});

test("buildReportWorkspaceState exposes Study Lens course planning focus detail", () => {
  const state = buildReportWorkspaceState({
    kind: "course_builder",
    goal: "Build my course plan.",
    upcomingExam: "Final exam in 6 weeks",
    urgency: "soon",
    stress: "stressed",
    focus: {
      source: "study_lens",
      preferredKind: "course_builder",
      goalHint: "Build a course plan from Study Lens course context.",
      searchQuery: "Biology 101 course plan",
      activeTag: "course:bio101",
      academicKind: "study_course",
      courseTag: "course:bio101",
      knowledgeGraphLinkTags: ["course_source:manual", "term:Term 1"],
      zettelkastenNextAction: "Build a course plan for Biology 101 using retained sources and deadlines.",
      notice: "Reports opened from Study Lens.",
      createdAt: Date.now(),
    },
    messages: [],
  });

  assert.equal(state.carriedFocusLabel, "course:bio101");
  assert.match(state.carriedFocusDetail ?? "", /from Study Lens/i);
  assert.match(state.carriedFocusDetail ?? "", /academic kind: study course/i);
  assert.match(state.carriedFocusDetail ?? "", /Build a course plan for Biology 101/i);
  assert.match(state.carriedFocusDetail ?? "", /course_source:manual/i);
  assert.ok(state.intake.turns.some((turn) => /Carried focus: from Study Lens/i.test(turn.text)));
});

test("buildReportWorkspaceState exposes academic calendar object-search focus detail", () => {
  const state = buildReportWorkspaceState({
    kind: "exam_preparation",
    goal: "Prep from this calendar deadline.",
    upcomingExam: "",
    urgency: "soon",
    stress: "stressed",
    focus: {
      source: "object_search",
      preferredKind: "exam_preparation",
      goalHint: "Prepare for BIO101 final exam.",
      searchQuery: "BIO101 final exam",
      activeTag: "course:bio101",
      academicKind: "academic_deadline",
      courseTag: "course:bio101",
      unitTag: "unit:genetics",
      chapterTag: "chapter:4",
      moduleLabel: "Module 2",
      dueLabel: "2026-10-03T22:00:00.000Z",
      deadlineId: "deadline-42",
      providerId: "gcal",
      knowledgeGraphLinkTags: ["provider:gcal", "module:Module 2"],
      notice: "Reports opened from object search.",
      createdAt: Date.now(),
    },
    messages: [],
  });

  assert.equal(state.carriedFocusLabel, "course:bio101, unit:genetics, chapter:4, Module 2, 2026-10-03T22:00:00.000Z");
  assert.match(state.carriedFocusDetail ?? "", /from object search/i);
  assert.match(state.carriedFocusDetail ?? "", /academic kind: academic deadline/i);
  assert.match(state.carriedFocusDetail ?? "", /scope: 2026-10-03T22:00:00.000Z/i);
  assert.match(state.carriedFocusDetail ?? "", /scope: Module 2/i);
  assert.match(state.carriedFocusDetail ?? "", /scope: deadline-42/i);
  assert.ok(state.intake.turns.some((turn) => /Carried focus: from object search/i.test(turn.text)));
});

test("buildReportIntakeState creates chat-like prompts and quick replies", () => {
  const state = buildReportIntakeState({
    kind: "guided_study_session",
    goal: "",
    upcomingExam: "",
    context: {
      cardCount: 0,
      focusedCardCount: 0,
      linkedCardCount: 0,
      zettelkastenCardCount: 0,
      sourceCount: 0,
      sourceCoverageLevel: "none",
      sourceCoverageSummary: "No retained source evidence is available yet.",
      topSupertags: [],
      graphAnchors: [],
      evidenceSources: [],
      missingInputs: [],
      zettelkastenNextActions: [],
      courseTags: [],
      weekTags: [],
      chapterTags: [],
      unitTags: [],
      topologySummary: "No retained knowledge graph is available yet.",
      readinessLevel: "needs_source",
      readinessLabel: "Needs one study source",
    },
  });

  assert.equal(state.completionLabel, "Needs source grounding");
  assert.ok(state.turns[0]?.text.includes("Plan, Review, Recall, Check, Next action"));
  assert.ok(state.quickReplies.some((reply) => reply.target === "goal" && /guided study session/i.test(reply.value)));
  assert.ok(state.quickReplies.some((reply) => reply.target === "upcoming_exam" && /20 minutes/i.test(reply.value)));
  assert.match(state.sourcePrompt, /attach or paste one readable lecture/i);
});

test("buildReportIntakeState summarizes retained context for source-backed reports", () => {
  const state = buildReportIntakeState({
    kind: "flashcard_deck",
    goal: "Make recall cards for psych week 5.",
    upcomingExam: "Midterm in 10 days",
    context: {
      cardCount: 2,
      focusedCardCount: 0,
      linkedCardCount: 2,
      zettelkastenCardCount: 0,
      sourceCount: 2,
      sourceCoverageLevel: "connected_multi_source",
      sourceCoverageSummary: "Uses 2 retained sources with enough graph links for stronger synthesis.",
      topSupertags: ["topic:memory"],
      graphAnchors: ["topic:encoding"],
      evidenceSources: ["Memory lecture"],
      missingInputs: [],
      zettelkastenNextActions: [],
      courseTags: ["course:psych101"],
      weekTags: ["week:5"],
      chapterTags: [],
      unitTags: [],
      topologySummary: "2 knowledge cards.",
      readinessLevel: "grounded_ready",
      readinessLabel: "Ready for linked synthesis",
    },
  });

  assert.equal(state.completionLabel, "Ready to generate");
  assert.equal(state.quickReplies.length, 0);
  assert.ok(state.turns.some((turn) => /Make recall cards/i.test(turn.text)));
  assert.ok(state.turns.some((turn) => /Midterm in 10 days/i.test(turn.text)));
  assert.match(state.sourcePrompt, /uses 2 retained sources/i);
});

test("report goal helpers replace stale defaults but preserve custom student input", () => {
  assert.match(defaultReportGoal("assignment_plan"), /assignment brief/i);
  assert.equal(shouldReplaceReportGoal(""), true);
  assert.equal(shouldReplaceReportGoal(defaultReportGoal("exam_preparation")), true);
  assert.equal(shouldReplaceReportGoal("I need help with my actual ECON101 midterm."), false);

  assert.equal(
    nextReportGoal({
      currentGoal: defaultReportGoal("exam_preparation"),
      nextKind: "day_schedule",
    }),
    defaultReportGoal("day_schedule"),
  );
  assert.equal(
    nextReportGoal({
      currentGoal: "I need help with my actual ECON101 midterm.",
      nextKind: "assignment_plan",
    }),
    "I need help with my actual ECON101 midterm.",
  );
});
