import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportIntentFromFocus,
  consumeReportNavigationIntent,
  normalizeReportNavigationIntent,
  REPORT_NAVIGATION_STATE_KEY,
  saveReportNavigationIntent,
} from "../src/lib/reportNavigationState.ts";

const sessionStorageState = new Map<string, string>();

Object.assign(globalThis, {
  sessionStorage: {
    getItem(key: string) {
      return sessionStorageState.has(key) ? sessionStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value);
    },
    removeItem(key: string) {
      sessionStorageState.delete(key);
    },
  },
});

test("buildReportIntentFromFocus prefers Zettelkasten synthesis for note-chain focus", () => {
  const intent = buildReportIntentFromFocus({
    source: "knowledge_graph",
    activeLens: "zettelkasten",
    knowledgeMode: "zettelkasten",
    courseTag: "course:phil201",
    zettelkastenNextAction: "Write how this changes the previous argument note.",
    knowledgeGraphGroupKey: "topic:phenomenology",
    knowledgeGraphLinkTags: ["topic:phenomenology", "course:phil201"],
  });

  assert.equal(intent.preferredKind, "zettelkasten_synthesis");
  assert.equal(intent.source, "knowledge_graph");
  assert.equal(intent.courseTag, "course:phil201");
  assert.equal(intent.knowledgeGraphGroupKey, "topic:phenomenology");
  assert.ok(intent.knowledgeGraphLinkTags.includes("topic:phenomenology"));
  assert.match(intent.goalHint, /argument trail/i);
  assert.match(intent.goalHint, /course:phil201/i);
});

test("buildReportIntentFromFocus chooses weekly or assignment reports from academic focus", () => {
  const weekly = buildReportIntentFromFocus({
    source: "files",
    academicKind: "lecture_slides",
    courseTag: "course:econ101",
    weekTag: "week:3",
    chapterTag: "chapter:4",
    unitTag: "unit:market-failures",
  });
  assert.equal(weekly.preferredKind, "weekly_revision");
  assert.match(weekly.goalHint, /weekly revision report/i);
  assert.match(weekly.goalHint, /week:3/i);
  assert.match(weekly.goalHint, /chapter:4/i);
  assert.match(weekly.goalHint, /unit:market-failures/i);

  const assignment = buildReportIntentFromFocus({
    source: "files",
    academicKind: "assignment",
    courseTag: "course:law101",
  });
  assert.equal(assignment.preferredKind, "assignment_plan");
  assert.match(assignment.goalHint, /assignment material/i);
});

test("buildReportIntentFromFocus recognizes briefs, rubrics, and schedule pressure", () => {
  const rubric = buildReportIntentFromFocus({
    source: "files",
    academicKind: "rubric",
    activeTag: "assessment:essay",
    courseTag: "course:eng101",
  });
  assert.equal(rubric.preferredKind, "assignment_plan");
  assert.match(rubric.goalHint, /assignment material/i);

  const briefQuery = buildReportIntentFromFocus({
    source: "files",
    searchQuery: "assessment 2 brief",
  });
  assert.equal(briefQuery.preferredKind, "assignment_plan");

  const scheduleQuery = buildReportIntentFromFocus({
    source: "files",
    searchQuery: "what should I do first today before the exam",
  });
  assert.equal(scheduleQuery.preferredKind, "day_schedule");
  assert.match(scheduleQuery.goalHint, /realistic study schedule/i);
});

test("buildReportIntentFromFocus recognizes first-class study output intents", () => {
  const cases = [
    { query: "build a course plan from my syllabus", kind: "course_builder", hint: /structured AI course plan/i },
    { query: "quiz me with an answer key", kind: "quiz_generator", hint: /source-grounded quiz/i },
    { query: "make flashcards from these notes", kind: "flashcard_deck", hint: /Generate flashcards/i },
    { query: "make a one-page cheatsheet", kind: "cheatsheet", hint: /compact cheatsheet/i },
    { query: "lecture summary so I can catch up", kind: "lecture_summary", hint: /catch up quickly/i },
    { query: "exam-style practice questions with worked answers", kind: "practice_questions", hint: /practice questions/i },
    { query: "guided study session for 20 minutes", kind: "guided_study_session", hint: /next study session/i },
  ] as const;

  for (const entry of cases) {
    const intent = buildReportIntentFromFocus({
      source: "files",
      searchQuery: entry.query,
      courseTag: "course:psych101",
    });
    assert.equal(intent.preferredKind, entry.kind);
    assert.match(intent.goalHint, entry.hint);
    assert.match(intent.goalHint, /course:psych101/i);
  }
});

test("buildReportIntentFromFocus infers medical topology deck and vignette report intents", () => {
  const sourceOnly = buildReportIntentFromFocus({
    source: "knowledge_graph",
    activeLens: "linked_ideas",
    academicKind: "medical_cloze_vignette",
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    activeTag: "system:cardiovascular",
    knowledgeGraphLinkTags: [
      "medical_topology_coverage",
      "readiness:Source only",
      "topology_gap:source_only",
      "pharm",
      "management",
    ],
  });
  assert.equal(sourceOnly.preferredKind, "flashcard_deck");
  assert.match(sourceOnly.goalHint, /medical cloze\/vignette cards/i);
  assert.match(sourceOnly.goalHint, /source locators, chapter\/unit tags, and concept supertags/i);
  assert.match(sourceOnly.goalHint, /chapter:heart-failure/i);

  const timedBlock = buildReportIntentFromFocus({
    source: "knowledge_graph",
    activeLens: "linked_ideas",
    academicKind: "medical_cloze_vignette",
    courseTag: "course:med101",
    activeTag: "system:cardiovascular",
    knowledgeGraphLinkTags: [
      "medical_topology_coverage",
      "readiness:Ready for timed block",
      "medical_vignette_block",
    ],
  });
  assert.equal(timedBlock.preferredKind, "practice_questions");
  assert.match(timedBlock.goalHint, /freshly phrased medical vignette\/application questions/i);
  assert.match(timedBlock.goalHint, /no copied proprietary QBank text/i);
});

test("buildReportIntentFromFocus honors explicit preferred kind from graph actions", () => {
  const intent = buildReportIntentFromFocus({
    source: "knowledge_graph",
    preferredKind: "flashcard_deck",
    activeLens: "zettelkasten",
    knowledgeMode: "zettelkasten",
    activeTag: "topic:elasticity",
  });

  assert.equal(intent.preferredKind, "flashcard_deck");
  assert.match(intent.goalHint, /Generate flashcards/i);
  assert.match(intent.goalHint, /topic:elasticity/i);
});

test("buildReportIntentFromFocus supports Study Lens as a focused report source", () => {
  const intent = buildReportIntentFromFocus({
    source: "study_lens",
    preferredKind: "day_schedule",
    searchQuery: "deadline queue",
  });

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "day_schedule");
  assert.equal(intent.notice, "Reports opened from Study Lens.");
});

test("buildReportIntentFromFocus supports object search as a focused report source", () => {
  const intent = buildReportIntentFromFocus({
    source: "object_search",
    preferredKind: "exam_preparation",
    searchQuery: "BIO101 final exam",
    courseTag: "course:bio101",
    chapterTag: "chapter:4",
    unitTag: "unit:genetics",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "calendar:gcal:event-42",
    providerId: "gcal",
  });

  assert.equal(intent.source, "object_search");
  assert.equal(intent.notice, "Reports opened from object search.");
  assert.equal(intent.moduleLabel, "Module 2");
  assert.equal(intent.dueLabel, "2026-10-03T22:00:00.000Z");
  assert.equal(intent.deadlineId, "calendar:gcal:event-42");
  assert.equal(intent.providerId, "gcal");
  assert.match(intent.goalHint, /course:bio101/i);
  assert.match(intent.goalHint, /chapter:4/i);
  assert.match(intent.goalHint, /unit:genetics/i);
  assert.match(intent.goalHint, /Module 2/i);
  assert.match(intent.goalHint, /2026-10-03/i);
});


test("report navigation intent is stored, consumed once, and expires", () => {
  sessionStorageState.clear();
  const now = Date.now();
  saveReportNavigationIntent({
    preferredKind: "exam_preparation",
    goalHint: "Prepare for biology.",
    source: "files",
    searchQuery: "biology",
    activeTag: "topic:cells",
    academicKind: "lecture_notes",
    courseTag: "course:bio101",
    weekTag: "week:4",
    lectureTag: null,
    chapterTag: "chapter:7",
    unitTag: "unit:genetics",
    moduleLabel: null,
    dueLabel: "Friday",
    deadlineId: "deadline-7",
    providerId: "canvas-lms",
    zettelkastenStage: null,
    zettelkastenNextAction: null,
    knowledgeGraphGroupKey: "topic:cells",
    knowledgeGraphLinkTags: ["topic:cells"],
    notice: "Reports opened from your current Files focus.",
    createdAt: now,
  });

  const consumed = consumeReportNavigationIntent();
  assert.equal(consumed?.preferredKind, "exam_preparation");
  assert.equal(consumed?.courseTag, "course:bio101");
  assert.equal(consumed?.chapterTag, "chapter:7");
  assert.equal(consumed?.unitTag, "unit:genetics");
  assert.equal(consumed?.dueLabel, "Friday");
  assert.equal(consumed?.deadlineId, "deadline-7");
  assert.equal(consumed?.providerId, "canvas-lms");
  assert.equal(consumed?.activeTag, "topic:cells");
  assert.equal(sessionStorageState.has(REPORT_NAVIGATION_STATE_KEY), false);
  assert.equal(consumeReportNavigationIntent(), null);

  sessionStorageState.set(
    REPORT_NAVIGATION_STATE_KEY,
    JSON.stringify({
      preferredKind: "weekly_revision",
      goalHint: "Old focus",
      source: "files",
      createdAt: now - 6 * 60 * 1000,
    }),
  );
  assert.equal(consumeReportNavigationIntent(), null);
  assert.equal(sessionStorageState.has(REPORT_NAVIGATION_STATE_KEY), false);
});

test("report navigation normalization discards invalid JSON records safely", () => {
  assert.equal(normalizeReportNavigationIntent(null), null);
  const normalized = normalizeReportNavigationIntent({
    preferredKind: "unknown",
    goalHint: "  ",
    source: "bad",
    knowledgeGraphLinkTags: [" topic:valid ", "", 7],
    createdAt: "bad",
  });

  assert.equal(normalized?.preferredKind, "exam_preparation");
  assert.equal(normalized?.source, "onboarding");
  assert.deepEqual(normalized?.knowledgeGraphLinkTags, ["topic:valid"]);
  assert.equal(normalized?.dueLabel, null);
  assert.equal(normalized?.deadlineId, null);

  const newKind = normalizeReportNavigationIntent({
    preferredKind: "cheatsheet",
    goalHint: "Make an exam cram sheet.",
    source: "files",
  });
  assert.equal(newKind?.preferredKind, "cheatsheet");

  sessionStorageState.clear();
  sessionStorageState.set(REPORT_NAVIGATION_STATE_KEY, "{bad-json");
  assert.equal(consumeReportNavigationIntent(), null);
  assert.equal(sessionStorageState.has(REPORT_NAVIGATION_STATE_KEY), false);
});
