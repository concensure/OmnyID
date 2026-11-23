// @locs-version: 1.0
import type { ReportKind, ReportOutputFormat } from "@/lib/reportGeneratorState";
import { buildMedicalTrustedReferenceArtifactState } from "@/lib/medicalTrustedReferenceState";
import { buildStudyAcademicScopeLabels } from "@/lib/studyAcademicScopeState";
import { extractStudyCsvRowsFromMarkdown } from "@/lib/studyResultCsvState";

export type StudyResultExportTargetAvailability = "ready" | "browser_print" | "planned";
export type StudyResultExportAnswerPolicy = "not_applicable" | "included" | "when_completed";

export type StudyResultExportTarget = {
  id: "markdown" | "html" | "pdf" | "word_doc" | "docx" | "jpg" | "png" | "csv";
  label: string;
  extension: string;
  mimeType: string;
  availability: StudyResultExportTargetAvailability;
  detail: string;
  answerPolicy: StudyResultExportAnswerPolicy;
};

export type StudyResultExportManifestEntry = StudyResultExportTarget & {
  filename: string;
  enabled: boolean;
  action: "download" | "print" | "planned";
};

export type StudyResultExportManifest = {
  title: string;
  baseFilename: string;
  answerPolicyLabel: string;
  metadataLabels: string[];
  entries: StudyResultExportManifestEntry[];
  readyEntries: StudyResultExportManifestEntry[];
  plannedEntries: StudyResultExportManifestEntry[];
};

export type StudyResultExportCapabilitySummary = {
  readyDownloadLabels: string[];
  browserActionLabels: string[];
  plannedConversionLabels: string[];
  studentSummary: string;
  searchLabels: string[];
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function headingForQuery(query: string): string {
  const compact = query.replace(/\s+/g, " ").trim();
  if (!compact) return "Study result";
  return compact.length > 90 ? `${compact.slice(0, 87).trimEnd()}...` : compact;
}

export function htmlFilenameForMarkdownFilename(filename: string): string {
  return filename.replace(/\.md$/i, ".html");
}

export function wordFilenameForMarkdownFilename(filename: string): string {
  return filename.replace(/\.md$/i, ".doc");
}

export function csvFilenameForMarkdownFilename(filename: string): string {
  return filename.replace(/\.md$/i, ".csv");
}

export function filenameForExportTarget(baseMarkdownFilename: string, target: StudyResultExportTarget): string {
  const base = (baseMarkdownFilename || "study-result.md")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "study-result";
  return `${base}${target.extension}`;
}

export function answerPolicyLabel(answerPolicy: StudyResultExportAnswerPolicy): string {
  if (answerPolicy === "included") return "Answers included where generated";
  if (answerPolicy === "when_completed") return "Answers export after completion";
  return "Answer availability follows the saved output";
}

export function answerPolicyFromInput(value: boolean | null | undefined): StudyResultExportAnswerPolicy {
  if (value === false) return "when_completed";
  if (value === true) return "included";
  return "not_applicable";
}

export function defaultStudyResultExportTargets(
  answerPolicy: StudyResultExportAnswerPolicy,
  csvReady = false,
): StudyResultExportTarget[] {
  return [
    {
      id: "markdown",
      label: "Markdown",
      extension: ".md",
      mimeType: "text/markdown;charset=utf-8",
      availability: "ready",
      detail: "Ready now for notes, reports, flashcards, and exam-prep reuse.",
      answerPolicy,
    },
    {
      id: "html",
      label: "HTML",
      extension: ".html",
      mimeType: "text/html;charset=utf-8",
      availability: "ready",
      detail: "Ready now as a printable browser document.",
      answerPolicy,
    },
    {
      id: "pdf",
      label: "PDF",
      extension: ".pdf",
      mimeType: "application/pdf",
      availability: "browser_print",
      detail: "Available through the print dialog using Save as PDF.",
      answerPolicy,
    },
    {
      id: "word_doc",
      label: "Word (.doc)",
      extension: ".doc",
      mimeType: "application/msword;charset=utf-8",
      availability: "ready",
      detail: "Ready now as a Word-openable document generated from the printable HTML.",
      answerPolicy,
    },
    {
      id: "docx",
      label: "Word",
      extension: ".docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      availability: "planned",
      detail: "Requires the document conversion/export worker before direct download.",
      answerPolicy,
    },
    {
      id: "jpg",
      label: "JPG",
      extension: ".jpg",
      mimeType: "image/jpeg",
      availability: "planned",
      detail: "Requires image rendering of the report surface before direct download.",
      answerPolicy,
    },
    {
      id: "png",
      label: "PNG",
      extension: ".png",
      mimeType: "image/png",
      availability: "planned",
      detail: "Requires image rendering of the report surface before direct download.",
      answerPolicy,
    },
    {
      id: "csv",
      label: "CSV",
      extension: ".csv",
      mimeType: "text/csv;charset=utf-8",
      availability: csvReady ? "ready" : "planned",
      detail: csvReady
        ? "Ready now for parseable quiz, practice-question, or flashcard rows."
        : "Use for structured quizzes and flashcards once item extraction is explicit.",
      answerPolicy,
    },
  ];
}

export function buildStudyResultExportManifest(input: {
  title: string;
  filename: string;
  exportTargets?: readonly StudyResultExportTarget[] | null;
  answersIncluded?: boolean | null;
  reportKind?: ReportKind | null;
  outputFormat?: ReportOutputFormat | null;
  markdown?: string | null;
  sourceLabels?: readonly string[] | null;
  policyLabel?: string | null;
  courseTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  moduleLabel?: string | null;
  dueLabel?: string | null;
  deadlineId?: string | null;
  providerId?: string | null;
  academicKind?: string | null;
  sessionId?: string | null;
}): StudyResultExportManifest {
  const answerPolicy = answerPolicyFromInput(input.answersIncluded);
  const csvRows = extractStudyCsvRowsFromMarkdown(clean(input.markdown), {
    answersIncluded: input.answersIncluded,
    sourceLabels: input.sourceLabels,
    courseTag: input.courseTag,
    chapterTag: input.chapterTag,
    unitTag: input.unitTag,
    moduleLabel: input.moduleLabel,
    dueLabel: input.dueLabel,
    deadlineId: input.deadlineId,
    providerId: input.providerId,
  });
  const exportTargets = (input.exportTargets && input.exportTargets.length > 0)
    ? [...input.exportTargets]
    : defaultStudyResultExportTargets(answerPolicy, csvRows.length > 0);
  const entries = exportTargets.map((target): StudyResultExportManifestEntry => ({
    ...target,
    filename: filenameForExportTarget(input.filename, target),
    enabled: target.availability !== "planned",
    action: target.availability === "planned"
      ? "planned"
      : target.availability === "browser_print" ? "print" : "download",
  }));
  const metadataLabels = [
    input.reportKind ? input.reportKind.replace(/_/g, " ") : null,
    input.outputFormat ? input.outputFormat.replace(/_/g, " ") : null,
    ...buildStudyResultMedicalReferenceExportLabels(input),
    ...buildStudyAcademicScopeLabels(input, {
      includeDeadlineId: true,
      includeProviderId: true,
      includeAcademicKind: true,
      includeSessionId: true,
    }),
    clean(input.policyLabel) || null,
    ...(input.sourceLabels ?? []).map(clean).filter(Boolean).slice(0, 4),
  ].filter((value): value is string => Boolean(value));

  return {
    title: headingForQuery(input.title),
    baseFilename: filenameForExportTarget(input.filename, { ...exportTargets[0]!, extension: ".md" }),
    answerPolicyLabel: answerPolicyLabel(answerPolicy),
    metadataLabels,
    entries,
    readyEntries: entries.filter((entry) => entry.enabled),
    plannedEntries: entries.filter((entry) => !entry.enabled),
  };
}

export function buildStudyResultMedicalReferenceExportLabels(input: {
  title?: string | null;
  filename?: string | null;
  markdown?: string | null;
  reportKind?: ReportKind | null;
  outputFormat?: ReportOutputFormat | null;
  sourceLabels?: readonly string[] | null;
  policyLabel?: string | null;
  courseTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  academicKind?: string | null;
}): string[] {
  const title = clean(input.title) || "Study result";
  const filename = clean(input.filename) || "study-result.md";
  const markdown = clean(input.markdown);
  const state = buildMedicalTrustedReferenceArtifactState({
    id: "export-preview",
    title,
    filename,
    markdown: markdown || title,
    mimeType: "text/markdown;charset=utf-8",
    reportKind: input.reportKind ?? null,
    reportLabel: null,
    outputFormat: input.outputFormat ?? null,
    sourceLabels: (input.sourceLabels ?? []).map(clean).filter(Boolean),
    policyLabel: clean(input.policyLabel) || null,
    courseTag: clean(input.courseTag) || null,
    chapterTag: clean(input.chapterTag) || null,
    unitTag: clean(input.unitTag) || null,
    academicKind: clean(input.academicKind) || null,
    sectionCount: 0,
    createdAt: 1,
  });
  return state.hasMedicalTrustedReferenceSignal ? state.labels : [];
}

export function buildStudyResultExportCapabilitySummary(
  manifest: StudyResultExportManifest,
): StudyResultExportCapabilitySummary {
  const readyDownloadLabels = manifest.entries
    .filter((entry) => entry.action === "download")
    .map((entry) => entry.label);
  const browserActionLabels = manifest.entries
    .filter((entry) => entry.action === "print")
    .map((entry) => entry.label);
  const plannedConversionLabels = manifest.entries
    .filter((entry) => entry.action === "planned")
    .map((entry) => entry.label);
  const summaryParts = [
    readyDownloadLabels.length > 0 ? `Ready downloads: ${readyDownloadLabels.join(", ")}` : null,
    browserActionLabels.length > 0 ? `Browser export: ${browserActionLabels.join(", ")}` : null,
    plannedConversionLabels.length > 0 ? `Planned converters: ${plannedConversionLabels.join(", ")}` : null,
    manifest.answerPolicyLabel,
  ].filter((value): value is string => Boolean(value));

  return {
    readyDownloadLabels,
    browserActionLabels,
    plannedConversionLabels,
    studentSummary: summaryParts.join(" | "),
    searchLabels: [
      ...readyDownloadLabels.map((label) => `${label} ready download`),
      ...browserActionLabels.map((label) => `${label} browser export`),
      ...plannedConversionLabels.map((label) => `${label} planned converter`),
      manifest.answerPolicyLabel,
    ],
  };
}
