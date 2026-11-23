import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  selectStudentAttachmentQuickStart,
  selectStudentAttachmentQuickStartForFiles,
  studentQuickStartForIntent,
} from "../src/lib/onboardingQuickStart.ts";

test("studentQuickStartForIntent returns the default first-upload study flow", () => {
  assert.equal(
    studentQuickStartForIntent("first_upload").label,
    DEFAULT_STUDENT_ONBOARDING_QUICK_START.label,
  );
});

test("studentQuickStartForIntent returns the week-summary study flow", () => {
  assert.equal(
    studentQuickStartForIntent("week_summary").label,
    "Summarize week 3",
  );
});

test("studentQuickStartForIntent returns the compare-sources study flow", () => {
  assert.equal(
    studentQuickStartForIntent("compare_sources").label,
    "Compare lecture and reading",
  );
});

test("studentQuickStartForIntent returns the assignment planning flow", () => {
  assert.equal(
    studentQuickStartForIntent("assignment_plan").label,
    "Turn assignment brief into plan",
  );
});

test("studentQuickStartForIntent returns the lecture-audio flow", () => {
  assert.equal(
    studentQuickStartForIntent("lecture_audio").label,
    "Turn lecture recording into revision notes",
  );
});

test("studentQuickStartForIntent returns the zettelkasten starter flow", () => {
  const seed = studentQuickStartForIntent("zettelkasten_chain");
  assert.equal(seed.label, "Start a source-note chain");
  assert.equal(seed.knowledgeMode, "zettelkasten");
  assert.equal(seed.retentionMode, "keep_extracted_only");
});

test("selectStudentAttachmentQuickStart upgrades to comparison when more than one source is attached", () => {
  assert.equal(selectStudentAttachmentQuickStart(2).label, "Compare lecture and reading");
  assert.equal(selectStudentAttachmentQuickStart(1).label, DEFAULT_STUDENT_ONBOARDING_QUICK_START.label);
});

test("selectStudentAttachmentQuickStartForFiles chooses week summary for a scoped lecture file", () => {
  assert.equal(
    selectStudentAttachmentQuickStartForFiles([
      { name: "Econ101 Week 3 Lecture Slides.pdf", type: "application/pdf" },
    ]).label,
    "Summarize week 3",
  );
});

test("selectStudentAttachmentQuickStartForFiles chooses comparison for lecture plus reading pair", () => {
  assert.equal(
    selectStudentAttachmentQuickStartForFiles([
      { name: "Week 3 Lecture Slides.pdf", type: "application/pdf" },
      { name: "Week 3 Reading Chapter 2.pdf", type: "application/pdf" },
    ]).label,
    "Compare lecture and reading",
  );
});

test("selectStudentAttachmentQuickStartForFiles chooses assignment planning for brief-like files", () => {
  assert.equal(
    selectStudentAttachmentQuickStartForFiles([
      { name: "Assessment 2 Assignment Brief.pdf", type: "application/pdf" },
    ]).label,
    "Turn assignment brief into plan",
  );
});

test("selectStudentAttachmentQuickStartForFiles chooses lecture-audio for standalone recordings", () => {
  assert.equal(
    selectStudentAttachmentQuickStartForFiles([
      { name: "Week 5 lecture recording.m4a", type: "audio/mp4" },
    ]).label,
    "Turn lecture recording into revision notes",
  );
});
