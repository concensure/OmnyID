import assert from "node:assert/strict";
import test from "node:test";

import { buildStudentReportMemoryState } from "../src/lib/studentReportMemoryState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact>): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Exam prep",
    filename: "exam-prep.md",
    markdown: "# Exam preparation report\n",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "exam_preparation",
    reportLabel: "exam preparation report",
    outputFormat: "print_ready",
    sourceLabels: ["Week 3 slides.pdf"],
    policyLabel: "Keep extracted notes only",
    sectionCount: 3,
    createdAt: 1,
    ...overrides,
  };
}

test("buildStudentReportMemoryState returns null without saved artifacts", () => {
  assert.equal(buildStudentReportMemoryState([]), null);
});

test("buildStudentReportMemoryState summarizes latest saved study output", () => {
  const state = buildStudentReportMemoryState([
    artifact({ id: "old", title: "Old quiz", createdAt: 1, reportKind: "quiz_generator", reportLabel: "quiz generator report" }),
    artifact({
      id: "new",
      title: "Economics cheatsheet",
      createdAt: 5,
      reportKind: "cheatsheet",
      reportLabel: "cheatsheet builder report",
      courseTag: "course:econ101",
      sessionId: "session-1",
    }),
  ]);

  assert.equal(state?.savedCount, 2);
  assert.equal(state?.latestTitle, "Economics cheatsheet");
  assert.match(state?.headline ?? "", /2 saved study outputs/i);
  assert.match(state?.detail ?? "", /Open Reports/i);
  assert.ok(state?.chips.includes("cheatsheet builder report"));
  assert.ok(state?.chips.includes("course:econ101"));
  assert.ok(state?.chips.includes("browser pdf ready"));
  assert.ok(state?.chips.includes("guided session linked"));
  assert.ok(state?.chips.includes("Week 3 slides.pdf"));
  assert.equal(state?.primaryActionLabel, "Continue latest output");
  assert.match(state?.primaryQuickStartSeed.query ?? "", /Economics cheatsheet/);
  assert.match(state?.primaryQuickStartSeed.query ?? "", /course:econ101/);
  assert.equal(state?.primaryQuickStartSeed.originLabel, "From saved report");
});

test("buildStudentReportMemoryState exposes scoped recovery items from the shared saved-artifact projection", () => {
  const state = buildStudentReportMemoryState([
    artifact({
      id: "chapter-quiz",
      title: "LAW101 Chapter 4 quiz",
      filename: "law101-chapter-4-quiz.md",
      markdown: "# Quiz generator report\n\n- Question 1: What is consideration? Answer: Value exchanged.",
      reportKind: "quiz_generator",
      reportLabel: "quiz generator report",
      outputFormat: "copyable_outline",
      courseTag: "course:law101",
      chapterTag: "chapter:4",
      unitTag: "unit:contracts",
      sessionId: "session-4",
      answersIncluded: true,
      structuredItemCount: 1,
      createdAt: 20,
    }),
  ]);

  const item = state?.recoveryItems[0];
  assert.equal(item?.title, "LAW101 Chapter 4 quiz");
  assert.equal(item?.subtitle, "quiz generator report - course:law101 - unit:contracts - chapter:4");
  assert.ok(item?.chips.includes("course:law101"));
  assert.ok(item?.chips.includes("unit:contracts"));
  assert.ok(item?.chips.includes("chapter:4"));
  assert.ok(item?.chips.includes("answers included"));
  assert.ok(item?.chips.includes("csv ready"));
  assert.ok(item?.chips.includes("browser pdf ready"));
  assert.ok(item?.actions.includes("continue"));
  assert.ok(item?.actions.includes("download_csv"));
  assert.match(item?.quickStartSeed.query ?? "", /chapter:4/);
  assert.match(item?.quickStartSeed.query ?? "", /unit:contracts/);
  assert.match(item?.quickStartSeed.query ?? "", /session-4/);
});

test("buildStudentReportMemoryState caps recovery items to avoid onboarding bloat", () => {
  const state = buildStudentReportMemoryState([
    artifact({ id: "one", title: "One", createdAt: 5 }),
    artifact({ id: "two", title: "Two", createdAt: 4 }),
    artifact({ id: "three", title: "Three", createdAt: 3 }),
    artifact({ id: "four", title: "Four", createdAt: 2 }),
  ]);

  assert.deepEqual(state?.recoveryItems.map((item) => item.title), ["One", "Two", "Three"]);
});
