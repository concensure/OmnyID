import assert from "node:assert/strict";
import test from "node:test";

import type { ReportKind } from "../src/lib/reportGeneratorState.ts";
import {
  studyOutputContractForReportKind,
  studyOutputContractPromptLines,
} from "../src/lib/studyOutputTemplateContractState.ts";

const ALL_REPORT_KINDS: ReportKind[] = [
  "exam_preparation",
  "day_schedule",
  "assignment_plan",
  "weekly_revision",
  "zettelkasten_synthesis",
  "course_builder",
  "quiz_generator",
  "flashcard_deck",
  "cheatsheet",
  "lecture_summary",
  "practice_questions",
  "guided_study_session",
];

test("study output contracts cover every report kind with scope and export rules", () => {
  for (const kind of ALL_REPORT_KINDS) {
    const contract = studyOutputContractForReportKind(kind);
    assert.equal(contract.kind, kind);
    assert.ok(contract.scopeRequirements.length > 0);
    assert.ok(contract.exportFormats.includes("markdown"));
    assert.ok(contract.exportFormats.includes("html"));
    assert.ok(contract.exportFormats.includes("browser_pdf"));
    assert.ok(contract.exportFormats.includes("word_doc"));
    assert.ok(contract.structureRequirements.includes("source_citations"));
    assert.ok(contract.structureRequirements.includes("chapter_unit_metadata"));
    assert.ok(contract.promptInstruction.trim().length > 0);
  }
});

test("drill output contracts require parseable rows and CSV exports", () => {
  for (const kind of ["quiz_generator", "flashcard_deck", "practice_questions"] as const) {
    const contract = studyOutputContractForReportKind(kind);
    assert.ok(contract.scopeRequirements.includes("chapter"));
    assert.ok(contract.scopeRequirements.includes("unit"));
    assert.ok(contract.exportFormats.includes("csv"));
    assert.ok(contract.exportFormats.includes("native_docx_planned"));
    assert.ok(contract.exportFormats.includes("image_export_planned"));
    assert.ok(contract.structureRequirements.includes("answer_policy"));
    assert.ok(contract.structureRequirements.includes("structured_rows"));
  }
});

test("study output contract prompt lines are concise and student-output specific", () => {
  const lines = studyOutputContractPromptLines("flashcard_deck");

  assert.equal(lines.length, 4);
  assert.match(lines.join("\n"), /Study output contract:/);
  assert.match(lines.join("\n"), /course, week, lecture, chapter, unit, file group, graph cluster/i);
  assert.match(lines.join("\n"), /markdown, html, browser pdf, word doc, csv/i);
  assert.match(lines.join("\n"), /structured rows/i);
});
