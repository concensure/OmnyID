// @locs-version: 1.0
import type { StudySearchSection } from "@/lib/studySearchResultState";
import {
  buildStudyAcademicScopeLabels,
} from "@/lib/studyAcademicScopeState";
import {
  answerPolicyFromInput,
  answerPolicyLabel,
  csvFilenameForMarkdownFilename,
  defaultStudyResultExportTargets,
  htmlFilenameForMarkdownFilename,
  wordFilenameForMarkdownFilename,
  buildStudyResultMedicalReferenceExportLabels,
  type StudyResultExportTarget,
} from "@/lib/studyResultExportManifestState";
import {
  csvForStudyRows,
  extractStudyCsvRowsFromMarkdown,
} from "@/lib/studyResultCsvState";

export {
  csvFilenameForMarkdownFilename,
  htmlFilenameForMarkdownFilename,
  wordFilenameForMarkdownFilename,
  buildStudyResultExportCapabilitySummary,
  buildStudyResultExportManifest,
  filenameForExportTarget,
  type StudyResultExportAnswerPolicy,
  type StudyResultExportCapabilitySummary,
  type StudyResultExportManifest,
  type StudyResultExportManifestEntry,
  type StudyResultExportTarget,
  type StudyResultExportTargetAvailability,
} from "@/lib/studyResultExportManifestState";

export {
  csvForStudyRows,
  extractStudyCsvRowsFromMarkdown,
  type StudyResultCsvRow,
} from "@/lib/studyResultCsvState";

export type StudyResultExportState = {
  title: string;
  filename: string;
  htmlFilename: string;
  wordFilename: string;
  csvFilename?: string | null;
  markdown: string;
  html: string;
  csv?: string | null;
  mimeType: string;
  printLabel: string;
  copyLabel: string;
  downloadLabel: string;
  canExport: boolean;
  sectionCount: number;
  exportTargets: StudyResultExportTarget[];
  readyExportTargets: StudyResultExportTarget[];
  plannedExportTargets: StudyResultExportTarget[];
  answersIncludedLabel: string;
  answersIncluded?: boolean | null;
  metadataLabels: string[];
  csvRowCount?: number;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function headingForQuery(query: string): string {
  const compact = query.replace(/\s+/g, " ").trim();
  if (!compact) return "Study result";
  return compact.length > 90 ? `${compact.slice(0, 87).trimEnd()}...` : compact;
}

function filenameForTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "study-result"}.md`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printableHtmlForMarkdown(title: string, markdown: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:Georgia,"Times New Roman",serif;line-height:1.55;margin:40px auto;max-width:920px;padding:0 24px;color:#172033;}pre{white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;}</style>',
    "</head>",
    "<body>",
    `<pre>${escapeHtml(markdown)}</pre>`,
    "</body>",
    "</html>",
  ].join("");
}

function htmlForStudyResult(
  title: string,
  summary: string,
  sources: readonly string[],
  policy: string,
  scopeLabels: readonly string[],
  medicalReferenceLabels: readonly string[],
  sections: readonly StudySearchSection[],
): string {
  const sectionHtml = sections
    .map((section) => {
      const items = section.items.map(clean).filter(Boolean);
      if (items.length === 0) return "";
      return `<section><h2>${escapeHtml(section.title)}</h2><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
    })
    .filter(Boolean)
    .join("");
  const sourceHtml = sources.length > 0
    ? `<section><h2>Sources used</h2><ul>${sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}</ul></section>`
    : "";
  const scopeHtml = scopeLabels.length > 0
    ? `<section><h2>Study scope</h2><ul>${scopeLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul></section>`
    : "";
  const policyHtml = policy ? `<section><h2>Retention policy</h2><p>${escapeHtml(policy)}</p></section>` : "";
  const medicalReferenceHtml = medicalReferenceLabels.length > 0
    ? `<section><h2>Medical grounding</h2><ul>${medicalReferenceLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul></section>`
    : "";
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:Georgia,"Times New Roman",serif;line-height:1.55;margin:40px;max-width:920px;color:#172033}h1,h2{font-family:Verdana,Geneva,sans-serif}section{break-inside:avoid;margin-top:24px}li{margin:6px 0}</style>',
    "</head>",
    "<body>",
    `<h1>${escapeHtml(title)}</h1>`,
    summary ? `<p>${escapeHtml(summary)}</p>` : "",
    scopeHtml,
    medicalReferenceHtml,
    sourceHtml,
    policyHtml,
    sectionHtml,
    "</body>",
    "</html>",
  ].join("");
}

function sectionMarkdown(section: StudySearchSection): string | null {
  const items = section.items.map(clean).filter(Boolean);
  if (items.length === 0) return null;
  return [`## ${section.title}`, "", ...items.map((item) => `- ${item}`)].join("\n");
}

export function buildStudyResultExportState(input: {
  query?: string | null;
  summary?: string | null;
  sections: readonly StudySearchSection[];
  sourceLabels?: readonly string[] | null;
  policyLabel?: string | null;
  answersIncluded?: boolean | null;
  courseTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  moduleLabel?: string | null;
  dueLabel?: string | null;
  deadlineId?: string | null;
  providerId?: string | null;
  academicKind?: string | null;
  sessionId?: string | null;
}): StudyResultExportState | null {
  const summary = clean(input.summary);
  const sections = input.sections
    .map(sectionMarkdown)
    .filter((value): value is string => Boolean(value));
  const sources = (input.sourceLabels ?? []).map(clean).filter(Boolean);
  const policy = clean(input.policyLabel);
  if (!summary && sections.length === 0) return null;

  const title = headingForQuery(clean(input.query));
  const scopeLabels = buildStudyAcademicScopeLabels(input, {
    includeDeadlineId: true,
    includeProviderId: true,
    includeAcademicKind: true,
    includeSessionId: true,
  });
  const answersIncludedLabel = input.answersIncluded === false
    ? answerPolicyLabel("when_completed")
    : input.answersIncluded === true
      ? answerPolicyLabel("included")
      : answerPolicyLabel("not_applicable");
  const medicalReferenceLabels = buildStudyResultMedicalReferenceExportLabels({
    title,
    filename: filenameForTitle(title),
    markdown: [
      summary,
      ...sections,
    ].filter(Boolean).join("\n"),
    sourceLabels: sources,
    policyLabel: policy,
    courseTag: input.courseTag,
    chapterTag: input.chapterTag,
    unitTag: input.unitTag,
    academicKind: input.academicKind,
  });
  const parts = [
    `# ${title}`,
    summary ? `\n${summary}` : "",
    scopeLabels.length > 0 ? `\n## Study scope\n\n${scopeLabels.map((label) => `- ${label}`).join("\n")}` : "",
    medicalReferenceLabels.length > 0 ? `\n## Medical grounding\n\n${medicalReferenceLabels.map((label) => `- ${label}`).join("\n")}` : "",
    sources.length > 0 ? `\n## Sources used\n\n${sources.map((source) => `- ${source}`).join("\n")}` : "",
    policy ? `\n## Retention policy\n\n- ${policy}` : "",
    ...sections.map((section) => `\n${section}`),
  ].filter((part) => part.trim().length > 0);
  const markdown = `${parts.join("\n")}\n`;
  const filename = filenameForTitle(title);
  const html = htmlForStudyResult(title, summary, sources, policy, scopeLabels, medicalReferenceLabels, input.sections);
  const answerPolicy = answerPolicyFromInput(input.answersIncluded);
  const csvRows = extractStudyCsvRowsFromMarkdown(markdown, {
    answersIncluded: input.answersIncluded,
    sourceLabels: sources,
    courseTag: input.courseTag,
    chapterTag: input.chapterTag,
    unitTag: input.unitTag,
    moduleLabel: input.moduleLabel,
    dueLabel: input.dueLabel,
    deadlineId: input.deadlineId,
    providerId: input.providerId,
  });
  const csv = csvRows.length > 0 ? csvForStudyRows(csvRows) : null;
  const exportTargets = defaultStudyResultExportTargets(answerPolicy, csvRows.length > 0);
  const metadataLabels = [
    ...medicalReferenceLabels,
    ...scopeLabels,
    policy || null,
    ...sources.slice(0, 4),
  ].filter((value): value is string => Boolean(value));

  return {
    title,
    filename,
    htmlFilename: htmlFilenameForMarkdownFilename(filename),
    wordFilename: wordFilenameForMarkdownFilename(filename),
    csvFilename: csv ? csvFilenameForMarkdownFilename(filename) : null,
    markdown,
    html,
    csv,
    mimeType: "text/markdown;charset=utf-8",
    printLabel: "Print / save PDF",
    copyLabel: "Copy study output",
    downloadLabel: "Download Markdown",
    canExport: true,
    sectionCount: sections.length,
    exportTargets,
    readyExportTargets: exportTargets.filter((target) => target.availability !== "planned"),
    plannedExportTargets: exportTargets.filter((target) => target.availability === "planned"),
    answersIncludedLabel,
    answersIncluded: input.answersIncluded ?? null,
    metadataLabels,
    csvRowCount: csvRows.length,
  };
}
