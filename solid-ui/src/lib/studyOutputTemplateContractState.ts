// @locs-version: 1.0
import type { ReportKind } from "@/lib/reportGeneratorState";

export type StudyOutputScopeRequirement =
  | "course"
  | "week"
  | "lecture"
  | "chapter"
  | "unit"
  | "file_group"
  | "graph_cluster"
  | "deadline"
  | "attempt_evidence";

export type StudyOutputExportFormat =
  | "markdown"
  | "html"
  | "browser_pdf"
  | "word_doc"
  | "csv"
  | "native_docx_planned"
  | "image_export_planned";

export type StudyOutputStructureRequirement =
  | "source_citations"
  | "chapter_unit_metadata"
  | "answer_policy"
  | "structured_rows"
  | "readiness_without_mastery"
  | "next_action";

export type StudyOutputTemplateContract = {
  kind: ReportKind;
  scopeRequirements: StudyOutputScopeRequirement[];
  exportFormats: StudyOutputExportFormat[];
  structureRequirements: StudyOutputStructureRequirement[];
  promptInstruction: string;
};

const DRILL_EXPORTS: StudyOutputExportFormat[] = [
  "markdown",
  "html",
  "browser_pdf",
  "word_doc",
  "csv",
  "native_docx_planned",
  "image_export_planned",
];

const REPORT_EXPORTS: StudyOutputExportFormat[] = [
  "markdown",
  "html",
  "browser_pdf",
  "word_doc",
  "native_docx_planned",
  "image_export_planned",
];

const BASE_STRUCTURE: StudyOutputStructureRequirement[] = [
  "source_citations",
  "chapter_unit_metadata",
  "next_action",
];

const CONTRACTS: Record<ReportKind, StudyOutputTemplateContract> = {
  exam_preparation: {
    kind: "exam_preparation",
    scopeRequirements: ["course", "chapter", "unit", "deadline", "graph_cluster", "attempt_evidence"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "readiness_without_mastery"],
    promptInstruction: "Scope exam prep to the selected course, unit, chapter, deadline, and attempt evidence before broad revision advice.",
  },
  day_schedule: {
    kind: "day_schedule",
    scopeRequirements: ["course", "deadline"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "readiness_without_mastery"],
    promptInstruction: "Schedule work from accepted deadline and calendar evidence only; do not infer mastery from generated plans.",
  },
  assignment_plan: {
    kind: "assignment_plan",
    scopeRequirements: ["course", "deadline", "file_group"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: BASE_STRUCTURE,
    promptInstruction: "Anchor assignment planning in the brief, rubric, course context, and accepted deadline evidence.",
  },
  weekly_revision: {
    kind: "weekly_revision",
    scopeRequirements: ["course", "week", "lecture", "chapter", "unit", "graph_cluster"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: BASE_STRUCTURE,
    promptInstruction: "Tie weekly revision to retained sources and graph links, preserving week, lecture, unit, and chapter scope.",
  },
  zettelkasten_synthesis: {
    kind: "zettelkasten_synthesis",
    scopeRequirements: ["course", "file_group", "graph_cluster"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: BASE_STRUCTURE,
    promptInstruction: "Convert sources into linked thinking notes with explicit source citations and rhetorical relationships.",
  },
  course_builder: {
    kind: "course_builder",
    scopeRequirements: ["course", "deadline", "chapter", "unit", "file_group"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "readiness_without_mastery"],
    promptInstruction: "Build a modular course path from retained sources, accepted deadlines, chapter/unit scope, and explicit gaps.",
  },
  quiz_generator: {
    kind: "quiz_generator",
    scopeRequirements: ["course", "week", "lecture", "chapter", "unit", "file_group", "graph_cluster"],
    exportFormats: DRILL_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "answer_policy", "structured_rows"],
    promptInstruction: "Produce parseable quiz rows with question, answer, source, difficulty, and course/unit/chapter tags; withhold answers only when an unanswered attempt is requested.",
  },
  flashcard_deck: {
    kind: "flashcard_deck",
    scopeRequirements: ["course", "week", "lecture", "chapter", "unit", "file_group", "graph_cluster"],
    exportFormats: DRILL_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "answer_policy", "structured_rows"],
    promptInstruction: "Produce parseable flashcard rows with front, back, source, difficulty, and course/unit/chapter tags for CSV export.",
  },
  cheatsheet: {
    kind: "cheatsheet",
    scopeRequirements: ["course", "week", "lecture", "chapter", "unit", "file_group"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: BASE_STRUCTURE,
    promptInstruction: "Keep the cheatsheet print-ready and scoped to the selected course, unit, chapter, week, or file group.",
  },
  lecture_summary: {
    kind: "lecture_summary",
    scopeRequirements: ["course", "week", "lecture", "chapter", "unit", "file_group"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: BASE_STRUCTURE,
    promptInstruction: "Summarize the selected lecture, source, unit, or chapter without losing retained source labels.",
  },
  practice_questions: {
    kind: "practice_questions",
    scopeRequirements: ["course", "week", "lecture", "chapter", "unit", "file_group", "graph_cluster"],
    exportFormats: DRILL_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "answer_policy", "structured_rows"],
    promptInstruction: "Produce parseable practice-question rows with answer guidance, source, difficulty, and course/unit/chapter tags.",
  },
  guided_study_session: {
    kind: "guided_study_session",
    scopeRequirements: ["course", "deadline", "chapter", "unit", "graph_cluster", "attempt_evidence"],
    exportFormats: REPORT_EXPORTS,
    structureRequirements: [...BASE_STRUCTURE, "readiness_without_mastery", "answer_policy"],
    promptInstruction: "Run the Plan, Review, Recall, Check, Next action loop from source, deadline, and attempt evidence only.",
  },
};

function labels(values: readonly string[]): string {
  return values.map((value) => value.replaceAll("_", " ")).join(", ");
}

export function studyOutputContractForReportKind(kind: ReportKind): StudyOutputTemplateContract {
  return CONTRACTS[kind];
}

export function studyOutputContractPromptLines(kind: ReportKind): string[] {
  const contract = studyOutputContractForReportKind(kind);
  return [
    `Study output contract: ${contract.promptInstruction}`,
    `Scope inputs allowed: ${labels(contract.scopeRequirements)}.`,
    `Export contract: ${labels(contract.exportFormats)}.`,
    `Structure contract: ${labels(contract.structureRequirements)}.`,
  ];
}
