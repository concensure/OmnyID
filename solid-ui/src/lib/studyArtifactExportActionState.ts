// @locs-version: 1.0
import {
  buildStudyReportArtifactExportManifest,
  type StudyReportArtifact,
} from "@/lib/studyReportArtifactLocalState";
import {
  buildStudyResultExportCapabilitySummary,
  csvFilenameForMarkdownFilename,
  csvForStudyRows,
  extractStudyCsvRowsFromMarkdown,
  htmlFilenameForMarkdownFilename,
  printableHtmlForMarkdown,
  wordFilenameForMarkdownFilename,
} from "@/lib/studyResultExportState";

export type StudyArtifactSearchResultAction =
  | "continue"
  | "copy"
  | "download_markdown"
  | "download_html"
  | "download_word"
  | "download_csv"
  | "print_pdf"
  | "planned_docx"
  | "planned_jpg"
  | "planned_png";

export type StudyArtifactExportLabelState = {
  readyLabels: string[];
  plannedLabels: string[];
  browserLabels: string[];
  groundingLabels: string[];
  summary: string;
};

export type StudyArtifactActionTone =
  | "primary"
  | "csv"
  | "pdf"
  | "html"
  | "word"
  | "markdown"
  | "planned"
  | "neutral";

export type StudyArtifactCsvDownloadState = {
  filename: string;
  mimeType: "text/csv;charset=utf-8";
  csv: string;
  rowCount: number;
};

export type StudyArtifactDocumentDownloadState = {
  markdown: string;
  html: string;
  htmlFilename: string;
  wordFilename: string;
  htmlMimeType: "text/html;charset=utf-8";
  wordMimeType: "application/msword;charset=utf-8";
  groundingLabels: string[];
};

function medicalGroundingLabels(labels: readonly string[]): string[] {
  return labels.filter((label) =>
    /^Medical trusted grounding$/i.test(label)
    || /^Detail zoom:/i.test(label)
    || /^Trusted reference supported$/i.test(label)
    || /^Student-source primary$/i.test(label)
    || /^No internal-knowledge citations$/i.test(label)
    || /^Clinical dataset restricted$/i.test(label)
  );
}

export function buildStudyArtifactExportLabelState(
  artifact: StudyReportArtifact,
): StudyArtifactExportLabelState {
  const manifest = buildStudyReportArtifactExportManifest(artifact);
  const capability = buildStudyResultExportCapabilitySummary(manifest);
  const groundingLabels = medicalGroundingLabels(manifest.metadataLabels);
  return {
    readyLabels: manifest.readyEntries.map((entry) =>
      entry.action === "print" ? `${entry.label} via print` : `${entry.label} ready`,
    ),
    browserLabels: capability.browserActionLabels.map((label) => `${label} via browser`),
    plannedLabels: manifest.plannedEntries.map((entry) => `${entry.label} planned`),
    groundingLabels,
    summary: capability.studentSummary,
  };
}

export function buildStudyArtifactAvailableActions(
  artifact: StudyReportArtifact,
): StudyArtifactSearchResultAction[] {
  const manifest = buildStudyReportArtifactExportManifest(artifact);
  const readyIds = new Set(manifest.readyEntries.map((entry) => entry.id));
  const actions: StudyArtifactSearchResultAction[] = [
    "continue",
    "copy",
    "download_markdown",
    "download_html",
    "download_word",
    "print_pdf",
  ];
  if (readyIds.has("csv")) actions.push("download_csv");
  if (manifest.plannedEntries.some((entry) => entry.id === "docx")) actions.push("planned_docx");
  if (manifest.plannedEntries.some((entry) => entry.id === "jpg")) actions.push("planned_jpg");
  if (manifest.plannedEntries.some((entry) => entry.id === "png")) actions.push("planned_png");
  return actions;
}

export function buildStudyArtifactCsvDownloadState(
  artifact: StudyReportArtifact,
): StudyArtifactCsvDownloadState | null {
  const rows = extractStudyCsvRowsFromMarkdown(artifact.markdown, {
    answersIncluded: artifact.answersIncluded,
    sourceLabels: artifact.sourceLabels,
    courseTag: artifact.courseTag,
    chapterTag: artifact.chapterTag,
    unitTag: artifact.unitTag,
    moduleLabel: artifact.moduleLabel,
    dueLabel: artifact.dueLabel,
    deadlineId: artifact.deadlineId,
    providerId: artifact.providerId,
  });
  if (rows.length === 0) return null;
  return {
    filename: csvFilenameForMarkdownFilename(artifact.filename),
    mimeType: "text/csv;charset=utf-8",
    csv: csvForStudyRows(rows),
    rowCount: rows.length,
  };
}

export function buildStudyArtifactDocumentDownloadState(
  artifact: StudyReportArtifact,
): StudyArtifactDocumentDownloadState {
  const manifest = buildStudyReportArtifactExportManifest(artifact);
  const groundingLabels = medicalGroundingLabels(manifest.metadataLabels);
  const hasVisibleGroundingSection = /(^|\n)##\s+Medical grounding\b/i.test(artifact.markdown);
  const groundingSection = groundingLabels.length > 0 && !hasVisibleGroundingSection
    ? `\n\n## Medical grounding\n\n${groundingLabels.map((label) => `- ${label}`).join("\n")}\n`
    : "";
  const markdown = `${artifact.markdown.trimEnd()}${groundingSection}\n`;
  return {
    markdown,
    html: printableHtmlForMarkdown(artifact.title, markdown),
    htmlFilename: htmlFilenameForMarkdownFilename(artifact.filename),
    wordFilename: wordFilenameForMarkdownFilename(artifact.filename),
    htmlMimeType: "text/html;charset=utf-8",
    wordMimeType: "application/msword;charset=utf-8",
    groundingLabels,
  };
}

export function studyArtifactActionLabel(
  action: StudyArtifactSearchResultAction,
  input?: { copied?: boolean | null },
): string {
  switch (action) {
    case "continue":
      return "Continue";
    case "copy":
      return input?.copied ? "Copied" : "Copy";
    case "download_markdown":
      return "Markdown";
    case "download_html":
      return "HTML";
    case "download_word":
      return "Word";
    case "download_csv":
      return "CSV";
    case "print_pdf":
      return "Print/PDF";
    case "planned_docx":
      return "DOCX planned";
    case "planned_jpg":
      return "JPG planned";
    case "planned_png":
      return "PNG planned";
  }
}

export function studyArtifactActionTone(
  action: StudyArtifactSearchResultAction,
): StudyArtifactActionTone {
  switch (action) {
    case "continue":
      return "primary";
    case "download_csv":
      return "csv";
    case "print_pdf":
      return "pdf";
    case "download_html":
      return "html";
    case "download_word":
      return "word";
    case "download_markdown":
      return "markdown";
    case "planned_docx":
    case "planned_jpg":
    case "planned_png":
      return "planned";
    default:
      return "neutral";
  }
}

export function isStudyArtifactPlannedAction(action: StudyArtifactSearchResultAction): boolean {
  return action === "planned_docx" || action === "planned_jpg" || action === "planned_png";
}
