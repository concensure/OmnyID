import assert from "node:assert/strict";
import test from "node:test";

import {
  extractReportSeedMetadata,
  inferReportKindFromText,
  inferReportOutputFormatFromText,
  isReportQuickStartSeed,
  reportLabelForKind,
  reportKindFromQuickStartSeed,
  reportLabelFromQuickStartSeed,
  reportSourceNeedsFromQuickStartSeed,
  reportChapterTagFromQuickStartSeed,
  reportDeadlineIdFromQuickStartSeed,
  reportDueLabelFromQuickStartSeed,
  reportModuleLabelFromQuickStartSeed,
  reportProviderIdFromQuickStartSeed,
  reportUnitTagFromQuickStartSeed,
} from "../src/lib/reportSeedMetadata.ts";

test("extractReportSeedMetadata reads report badges and source needs", () => {
  const seed = {
    label: "Assignment execution report",
    description: "Create a plan.",
    query: "Create the report.",
    notice: "Loaded.",
    helper: "Attach the brief.",
    valuePromise: "A task breakdown.",
    recommendedUpload: "Assignment brief",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [],
    nextSteps: [],
    focusBadges: [
      "Assignment execution report",
      "report_kind:assignment_plan",
      "course_tag:course:law201",
      "chapter_tag:chapter:8",
      "unit_tag:unit:torts",
      "module:Module 4",
      "due:2026-10-03T22:00:00.000Z",
      "deadline:deadline-42",
      "provider:gcal",
      "academic_kind:study_attempt",
      "session:guided-7",
      "route_source:study_lens",
      "urgency:urgent",
      "stress:overwhelmed",
      "output_format:copyable_outline",
      "readiness:needs_scope",
      "coverage:single_source",
      "source_need:assignment brief",
      "source_need:rubric or marking criteria",
      "source_need:ignored third need",
    ],
  } as const;

  const metadata = extractReportSeedMetadata(seed);

  assert.equal(metadata.kind, "assignment_plan");
  assert.equal(metadata.label, "assignment plan report");
  assert.equal(metadata.courseTag, "course:law201");
  assert.equal(metadata.chapterTag, "chapter:8");
  assert.equal(metadata.unitTag, "unit:torts");
  assert.equal(metadata.moduleLabel, "Module 4");
  assert.equal(metadata.dueLabel, "2026-10-03T22:00:00.000Z");
  assert.equal(metadata.deadlineId, "deadline-42");
  assert.equal(metadata.providerId, "gcal");
  assert.equal(metadata.academicKind, "study_attempt");
  assert.equal(metadata.sessionId, "guided-7");
  assert.equal(metadata.routeSource, "study_lens");
  assert.equal(metadata.urgency, "urgent");
  assert.equal(metadata.stress, "overwhelmed");
  assert.equal(metadata.outputFormat, "copyable_outline");
  assert.equal(metadata.readiness, "needs_scope");
  assert.equal(metadata.coverage, "single_source");
  assert.deepEqual(metadata.sourceNeeds, ["assignment brief", "rubric or marking criteria"]);
  assert.equal(reportKindFromQuickStartSeed(seed), "assignment_plan");
  assert.equal(reportLabelFromQuickStartSeed(seed), "assignment plan report");
  assert.equal(reportChapterTagFromQuickStartSeed(seed), "chapter:8");
  assert.equal(reportUnitTagFromQuickStartSeed(seed), "unit:torts");
  assert.equal(reportModuleLabelFromQuickStartSeed(seed), "Module 4");
  assert.equal(reportDueLabelFromQuickStartSeed(seed), "2026-10-03T22:00:00.000Z");
  assert.equal(reportDeadlineIdFromQuickStartSeed(seed), "deadline-42");
  assert.equal(reportProviderIdFromQuickStartSeed(seed), "gcal");
  assert.deepEqual(reportSourceNeedsFromQuickStartSeed(seed), ["assignment brief", "rubric or marking criteria"]);
  assert.equal(isReportQuickStartSeed(seed), true);
});

test("inferReportOutputFormatFromText recognizes reusable report format prompts", () => {
  assert.equal(inferReportOutputFormatFromText("Requested output format: CSV flashcards. Include front, back, source, difficulty, and tag columns."), "csv_flashcards");
  assert.equal(inferReportOutputFormatFromText("Requested output format: Print-ready. Make this a printable revision sheet."), "print_ready");
  assert.equal(inferReportOutputFormatFromText("Requested output format: Copyable outline with action checkboxes."), "copyable_outline");
  assert.equal(inferReportOutputFormatFromText("Requested output format: Chat report. Format as clean Markdown inside chat."), "chat_markdown");
  assert.equal(inferReportOutputFormatFromText("No reusable format here."), null);
});

test("extractReportSeedMetadata ignores unknown report kinds", () => {
  const seed = {
    label: "Unknown report",
    description: "Create a report.",
    query: "Create the report.",
    notice: "Loaded.",
    helper: "Attach a source.",
    valuePromise: "A report.",
    recommendedUpload: "A source",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [],
    nextSteps: [],
    focusBadges: ["report_kind:unknown_report", "source_need:lecture notes"],
  } as const;

  const metadata = extractReportSeedMetadata(seed);

  assert.equal(metadata.kind, null);
  assert.equal(metadata.label, null);
  assert.equal(metadata.courseTag, null);
  assert.equal(metadata.chapterTag, null);
  assert.equal(metadata.unitTag, null);
  assert.equal(metadata.moduleLabel, null);
  assert.equal(metadata.dueLabel, null);
  assert.equal(metadata.deadlineId, null);
  assert.equal(metadata.providerId, null);
  assert.equal(metadata.academicKind, null);
  assert.equal(metadata.sessionId, null);
  assert.equal(metadata.routeSource, null);
  assert.deepEqual(metadata.sourceNeeds, ["lecture notes"]);
  assert.equal(isReportQuickStartSeed(seed), false);
});

test("extractReportSeedMetadata keeps source labels out of route source metadata", () => {
  const seed = {
    label: "Saved report",
    description: "Continue saved report.",
    query: "Continue.",
    notice: "Loaded.",
    helper: "Run.",
    valuePromise: "Continuation.",
    recommendedUpload: "Optional source",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [],
    nextSteps: [],
    focusBadges: [
      "report_kind:weekly_revision",
      "source:Week 3 slides.pdf",
      "COURSE:bio101",
      "CHAPTER:4",
      "UNIT:respiration",
    ],
  } as const;

  const metadata = extractReportSeedMetadata(seed);

  assert.equal(metadata.kind, "weekly_revision");
  assert.equal(metadata.courseTag, "course:bio101");
  assert.equal(metadata.chapterTag, "chapter:4");
  assert.equal(metadata.unitTag, "unit:respiration");
  assert.equal(metadata.routeSource, null);
});

test("inferReportKindFromText recognizes executed report prompts", () => {
  assert.equal(inferReportKindFromText("Create an exam preparation report with ranked concepts."), "exam_preparation");
  assert.equal(inferReportKindFromText("Create a realistic day schedule for a stressed student."), "day_schedule");
  assert.equal(inferReportKindFromText("Use the assignment brief and rubric to plan my essay."), "assignment_plan");
  assert.equal(inferReportKindFromText("Create a weekly revision report for this course/week."), "weekly_revision");
  assert.equal(inferReportKindFromText("Create a Zettelkasten synthesis report from permanent-note candidates."), "zettelkasten_synthesis");
  assert.equal(inferReportKindFromText("Create an AI course builder report from my syllabus."), "course_builder");
  assert.equal(inferReportKindFromText("Create a quiz generator report with answer key."), "quiz_generator");
  assert.equal(inferReportKindFromText("Create a flashcard deck report with active-recall cards."), "flashcard_deck");
  assert.equal(inferReportKindFromText("Create a cheatsheet builder report for exam cram."), "cheatsheet");
  assert.equal(inferReportKindFromText("Create a lecture summary report to catch up quickly."), "lecture_summary");
  assert.equal(inferReportKindFromText("Create a practice questions report with marking hints."), "practice_questions");
  assert.equal(inferReportKindFromText("Create a guided study session report for 20 minutes."), "guided_study_session");
  assert.equal(inferReportKindFromText("Summarize this unrelated source."), null);
  assert.equal(reportLabelForKind("weekly_revision"), "weekly revision report");
  assert.equal(reportLabelForKind("cheatsheet"), "cheatsheet builder report");
});
