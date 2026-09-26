// @locs-version: 1.0
import {
  buildMedicalFactVerificationSearchEntries,
  searchMedicalFactVerificationRecords,
  type MedicalFactVerificationRecord,
  type MedicalFactVerificationSearchEntry,
} from "@/lib/medicalFactVerificationState";
import { MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND } from "@/lib/medicalAnkiStudyState";
import {
  buildFileLibraryIntentFromKnowledgeGraphFocus,
  type FileLibraryNavigationIntent,
} from "@/lib/fileLibraryNavigationState";
import type { KnowledgeGraphNavigationIntent } from "@/lib/knowledgeGraphNavigationState";
import { buildReportIntentFromFocus, type ReportNavigationIntent } from "@/lib/reportNavigationState";
import {
  htmlFilenameForMarkdownFilename,
  printableHtmlForMarkdown,
  wordFilenameForMarkdownFilename,
} from "@/lib/studyResultExportState";

export type MedicalFactVerificationResultAction =
  | "reuse_in_report"
  | "verify_again"
  | "manual_review"
  | "show_sources"
  | "copy_export"
  | "download_markdown"
  | "download_html"
  | "download_word"
  | "print_pdf"
  | "planned_docx"
  | "planned_image"
  | "open_graph";

export type MedicalFactVerificationResult = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badges: string[];
  matchedFields: string[];
  actions: MedicalFactVerificationResultAction[];
  reportIntent: ReportNavigationIntent;
  fileLibraryIntent: FileLibraryNavigationIntent;
  knowledgeGraphIntent: KnowledgeGraphNavigationIntent;
  exportState: MedicalFactVerificationExportState;
  record: MedicalFactVerificationRecord;
};

export type MedicalFactVerificationExportState = {
  title: string;
  filename: string;
  htmlFilename: string;
  wordFilename: string;
  markdown: string;
  html: string;
  mimeType: "text/markdown;charset=utf-8";
  htmlMimeType: "text/html;charset=utf-8";
  wordMimeType: "application/msword;charset=utf-8";
  readyExportTargets: ("markdown" | "html" | "word_doc" | "browser_pdf")[];
  plannedExportTargets: ("native_docx_planned" | "image_export_planned")[];
  metadataLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function queryTerms(query?: string | null): string[] {
  return clean(query).toLowerCase().split(/\s+/).filter(Boolean);
}

function filenameForRecord(record: MedicalFactVerificationRecord): string {
  const scope = firstScopeLabel(record, "chapter:") ?? firstScopeLabel(record, "unit:") ?? firstScopeLabel(record, "course:");
  const base = `${scope ? `${scope} ` : ""}${record.targetText}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${base || "medical-fact-verification"}.md`;
}

function firstScopeLabel(record: MedicalFactVerificationRecord, prefix: string): string | null {
  const normalizedPrefix = prefix.toLowerCase();
  return record.scopeLabels.find((label) => label.toLowerCase().startsWith(normalizedPrefix)) ?? null;
}

function routingTagsForRecord(record: MedicalFactVerificationRecord): string[] {
  return uniqueStrings([
    "medical_fact_verification",
    "medical_trusted_grounding",
    `verification_status:${record.status}`,
    `confidence:${record.confidenceLabel}`,
    `verification_depth:${record.verificationDepth}`,
    record.status === "needs_review" ? "verification_action:manual_review" : "verification_action:reuse",
    ...record.scopeLabels,
    ...record.flags.map((flag) => `verification_flag:${flag.toLowerCase().replace(/[^a-z0-9:_-]+/g, "_")}`),
    ...record.sourceEvidence.flatMap((source) => [
      `source_tier:${source.tier}`,
      source.supportsClaim ? "source_support:supports_claim" : "source_support:conflicts_with_claim",
      source.locator ? `source_locator:${source.locator}` : null,
    ]),
  ], 24);
}

function sourceSummary(record: MedicalFactVerificationRecord): string {
  const supporting = record.sourceEvidence.filter((source) => source.supportsClaim).length;
  const conflicting = record.sourceEvidence.length - supporting;
  if (record.sourceEvidence.length === 0) return "No verification source evidence has been saved yet.";
  if (conflicting > 0) {
    return `${supporting} supporting and ${conflicting} conflicting source${conflicting === 1 ? "" : "s"} saved.`;
  }
  return `${supporting} supporting source${supporting === 1 ? "" : "s"} saved.`;
}

function matchedFieldsForEntry(entry: MedicalFactVerificationSearchEntry, query?: string | null): string[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const record = entry.record;
  const candidates = [
    ["claim", record.targetText],
    ["summary", record.summary],
    ["status", record.status],
    ["confidence", record.confidenceLabel],
    ["depth", record.verificationDepth],
    ["scope", record.scopeLabels.join(" ")],
    ["flags", record.flags.join(" ")],
    ["sources", record.sourceEvidence.map((source) => [
      source.label,
      source.tier,
      source.locator,
      source.year ? String(source.year) : null,
      source.supportsClaim ? "supports claim" : "conflicts with claim",
    ].filter(Boolean).join(" ")).join(" ")],
  ] as const;
  return candidates
    .filter(([, value]) => {
      const normalized = clean(value).toLowerCase();
      return normalized && terms.some((term) => normalized.includes(term));
    })
    .map(([field]) => field);
}

function actionsForRecord(record: MedicalFactVerificationRecord): MedicalFactVerificationResultAction[] {
  const actions: MedicalFactVerificationResultAction[] = ["reuse_in_report", "verify_again"];
  if (record.status === "needs_review" || record.confidenceLabel === "low") actions.push("manual_review");
  if (record.sourceEvidence.length > 0) actions.push("show_sources");
  actions.push("copy_export", "download_markdown", "download_html", "download_word", "print_pdf", "planned_docx", "planned_image", "open_graph");
  return actions;
}

function resultForEntry(entry: MedicalFactVerificationSearchEntry, query?: string | null): MedicalFactVerificationResult {
  const record = entry.record;
  const sourceTierLabels = record.sourceEvidence.map((source) => `source:${source.tier.replaceAll("_", " ")}`);
  const sourceLocatorLabels = record.sourceEvidence
    .map((source) => source.locator ? `locator:${source.locator}` : null);
  return {
    id: record.id,
    title: entry.title,
    subtitle: entry.subtitle,
    description: `${record.summary} ${sourceSummary(record)} Use as study evidence only, not patient-specific advice.`,
    badges: uniqueStrings([
      "medical fact verification",
      record.status.replace(/_/g, " "),
      `${record.confidenceLabel} confidence`,
      `${record.confidenceScore}/100`,
      `depth:${record.verificationDepth}`,
      ...record.scopeLabels,
      ...record.flags,
      ...sourceTierLabels,
      ...sourceLocatorLabels,
    ], 18),
    matchedFields: uniqueStrings(matchedFieldsForEntry(entry, query), 8),
    actions: actionsForRecord(record),
    reportIntent: buildMedicalFactVerificationReportIntent({ record }),
    fileLibraryIntent: buildMedicalFactVerificationFileLibraryIntent(record),
    knowledgeGraphIntent: buildMedicalFactVerificationKnowledgeGraphIntent(record),
    exportState: buildMedicalFactVerificationExportState(record),
    record,
  };
}

export function buildMedicalFactVerificationResults(
  records: readonly MedicalFactVerificationRecord[],
  query?: string | null,
  limit = 8,
): MedicalFactVerificationResult[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 8;
  const entries = query && clean(query)
    ? searchMedicalFactVerificationRecords(records, query)
    : buildMedicalFactVerificationSearchEntries(records);
  return entries
    .map((entry) => resultForEntry(entry, query))
    .slice(0, normalizedLimit);
}

export function medicalFactVerificationActionLabel(action: MedicalFactVerificationResultAction): string {
  switch (action) {
    case "reuse_in_report":
      return "Reuse in report";
    case "verify_again":
      return "Verify again";
    case "manual_review":
      return "Manual review";
    case "show_sources":
      return "Show sources";
    case "copy_export":
      return "Copy evidence";
    case "download_markdown":
      return "Markdown";
    case "download_html":
      return "HTML";
    case "download_word":
      return "Word";
    case "print_pdf":
      return "Print/PDF";
    case "planned_docx":
      return "DOCX planned";
    case "planned_image":
      return "Image planned";
    case "open_graph":
      return "Open graph";
  }
}

export function medicalFactVerificationActionTone(
  action: MedicalFactVerificationResultAction,
): "primary" | "warning" | "source" | "graph" | "markdown" | "html" | "word" | "pdf" | "planned" | "neutral" {
  switch (action) {
    case "reuse_in_report":
      return "primary";
    case "manual_review":
      return "warning";
    case "show_sources":
      return "source";
    case "open_graph":
      return "graph";
    case "download_markdown":
      return "markdown";
    case "download_html":
      return "html";
    case "download_word":
      return "word";
    case "print_pdf":
      return "pdf";
    case "planned_docx":
    case "planned_image":
      return "planned";
    default:
      return "neutral";
  }
}

export function isMedicalFactVerificationPlannedAction(action: MedicalFactVerificationResultAction): boolean {
  return action === "planned_docx" || action === "planned_image";
}

export function buildMedicalFactVerificationReportIntent(input: {
  record: MedicalFactVerificationRecord;
  preferredKind?: "flashcard_deck" | "quiz_generator" | "practice_questions" | "exam_preparation" | null;
  source?: "study_lens" | "object_search" | null;
}): ReportNavigationIntent {
  const record = input.record;
  const preferredKind = input.preferredKind ?? (
    record.status === "needs_review" ? "exam_preparation" : "practice_questions"
  );
  const supportingSources = record.sourceEvidence.filter((source) => source.supportsClaim);
  const conflictingSources = record.sourceEvidence.filter((source) => !source.supportsClaim);
  const sourceSummary = [
    `${supportingSources.length} supporting`,
    conflictingSources.length > 0 ? `${conflictingSources.length} conflicting` : null,
  ].filter(Boolean).join(", ");
  const sourceList = record.sourceEvidence
    .slice(0, 5)
    .map((source) =>
      `${source.label}${source.locator ? ` (${source.locator})` : ""} [${source.tier}; ${source.supportsClaim ? "supports" : "conflicts"}]`
    )
    .join("; ");
  const nextAction = [
    `Reuse this saved medical fact verification when generating study material: "${record.targetText}".`,
    `Verification status: ${record.status.replace(/_/g, " ")}; confidence: ${record.confidenceLabel} (${record.confidenceScore}/100); depth: ${record.verificationDepth}.`,
    sourceSummary ? `Verification evidence: ${sourceSummary}.` : null,
    sourceList ? `Sources already checked: ${sourceList}.` : null,
    record.flags.length > 0 ? `Flags to preserve: ${record.flags.join("; ")}.` : null,
    record.status === "needs_review"
      ? "Do not turn this into exam-critical cards until the report clearly labels the unresolved evidence and asks for manual review."
      : "Use the verified caveats and source locators; do not invent additional citations or treat LLM internal knowledge as source evidence.",
  ].filter(Boolean).join(" ");
  return buildReportIntentFromFocus({
    source: input.source ?? "study_lens",
    preferredKind,
    searchQuery: `medical fact verification: ${record.targetText}`,
    activeTag: record.id,
    academicKind: MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
    courseTag: firstScopeLabel(record, "course:"),
    unitTag: firstScopeLabel(record, "unit:"),
    chapterTag: firstScopeLabel(record, "chapter:"),
    knowledgeGraphGroupKey: record.id,
    knowledgeGraphLinkTags: routingTagsForRecord(record),
    zettelkastenNextAction: nextAction,
  });
}

export function buildMedicalFactVerificationFileLibraryIntent(
  record: MedicalFactVerificationRecord,
): FileLibraryNavigationIntent {
  const courseTag = firstScopeLabel(record, "course:");
  const unitTag = firstScopeLabel(record, "unit:");
  const chapterTag = firstScopeLabel(record, "chapter:");
  const linkTags = routingTagsForRecord(record);
  const sourceLabels = uniqueStrings(
    record.sourceEvidence.flatMap((source) => [
      source.label,
      source.locator ? `${source.label} ${source.locator}` : null,
    ]),
    4,
  );
  const searchQuery = sourceLabels.length > 0
    ? sourceLabels.join(" ")
    : `medical fact verification ${record.targetText}`;
  const intent = buildFileLibraryIntentFromKnowledgeGraphFocus({
    searchQuery,
    activeTag: courseTag ?? chapterTag ?? unitTag ?? record.id,
    activeLens: "study_materials",
    academicKind: MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
    courseTag,
    unitTag,
    chapterTag,
    knowledgeGraphGroupKey: record.id,
    knowledgeGraphLinkTags: linkTags,
    zettelkastenNextAction: record.sourceEvidence.length > 0
      ? `Open retained source evidence, locators, and extracted notes for the saved medical fact verification "${record.targetText}".`
      : `Open Files context for "${record.targetText}" and attach retained trusted sources before relying on this medical fact verification.`,
  });
  return {
    ...intent,
    notice: record.sourceEvidence.length > 0
      ? "Showing retained source evidence for this medical fact verification."
      : "Showing Files context for this medical fact verification; add retained sources before relying on it.",
  };
}

export function buildMedicalFactVerificationKnowledgeGraphIntent(
  record: MedicalFactVerificationRecord,
): KnowledgeGraphNavigationIntent {
  const courseTag = firstScopeLabel(record, "course:");
  const unitTag = firstScopeLabel(record, "unit:");
  const chapterTag = firstScopeLabel(record, "chapter:");
  const linkTags = routingTagsForRecord(record);
  return {
    activeLens: record.status === "needs_review" ? "review_queue" : "study_materials",
    preferredConnectionStrength: record.status === "verified" ? "high" : "medium",
    activeTag: courseTag ?? chapterTag ?? unitTag ?? record.id,
    searchQuery: `medical fact verification ${record.targetText}`,
    knowledgeMode: "connected_notes",
    academicKind: MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
    courseTag,
    weekTag: null,
    lectureTag: null,
    chapterTag,
    unitTag,
    zettelkastenStage: null,
    zettelkastenNextAction: record.status === "needs_review"
      ? `Show unresolved medical fact verification evidence for "${record.targetText}" before generating more exam-critical material.`
      : `Show verified medical fact evidence, source locators, and linked course/chapter concepts for "${record.targetText}".`,
    knowledgeGraphGroupKey: record.id,
    knowledgeGraphLinkTags: linkTags,
    highlightCardId: `afp-medical-fact-verification:${record.id}`,
    highlightSourceMessageId: null,
    fileName: null,
    notice: record.status === "needs_review"
      ? "Showing medical fact verification evidence that still needs review."
      : "Showing verified medical fact evidence in the Knowledge Graph.",
    origin: "files",
    createdAt: Date.now(),
  };
}

export function buildMedicalFactVerificationExportState(
  record: MedicalFactVerificationRecord,
): MedicalFactVerificationExportState {
  const title = "Medical fact verification";
  const filename = filenameForRecord(record);
  const supportingSources = record.sourceEvidence.filter((source) => source.supportsClaim).length;
  const conflictingSources = record.sourceEvidence.length - supportingSources;
  const sourceLines = record.sourceEvidence.length > 0
    ? record.sourceEvidence.map((source) =>
      `- ${source.label}${source.locator ? ` (${source.locator})` : ""}: ${source.tier.replace(/_/g, " ")}, ${source.supportsClaim ? "supports claim" : "conflicts with claim"}${source.year ? `, ${source.year}` : ""}`
    )
    : ["- No verification source evidence saved yet."];
  const scopeLines = record.scopeLabels.length > 0
    ? record.scopeLabels.map((label) => `- ${label}`)
    : ["- No course, unit, or chapter scope saved."];
  const flagLines = record.flags.length > 0
    ? record.flags.map((flag) => `- ${flag}`)
    : ["- No caveat flags saved."];
  const markdown = [
    `# ${title}`,
    "",
    `## Claim`,
    "",
    record.targetText,
    "",
    "## Verification status",
    "",
    `- Status: ${record.status.replace(/_/g, " ")}`,
    `- Confidence: ${record.confidenceLabel} (${record.confidenceScore}/100)`,
    `- Verification depth: ${record.verificationDepth}`,
    `- Evidence balance: ${supportingSources} supporting${conflictingSources > 0 ? `, ${conflictingSources} conflicting` : ""}`,
    `- Verified at: ${new Date(record.verifiedAt).toISOString()}`,
    record.manualReviewer ? `- Manual reviewer: ${record.manualReviewer}` : null,
    "",
    "## Summary",
    "",
    record.summary,
    "",
    "## Study scope",
    "",
    ...scopeLines,
    "",
    "## Sources checked",
    "",
    ...sourceLines,
    "",
    "## Caveats and flags",
    "",
    ...flagLines,
    "",
    "## Guardrail",
    "",
    "- This export is study verification evidence for a medical student. It is not patient-specific medical advice.",
    "- Do not treat LLM internal knowledge as source evidence. Re-run verification if source material, guidelines, or local curriculum expectations change.",
    "",
  ].filter((line): line is string => line !== null).join("\n");
  const metadataLabels = uniqueStrings([
    "medical fact verification",
    record.status.replace(/_/g, " "),
    `${record.confidenceLabel} confidence`,
    `${record.confidenceScore}/100`,
    `depth:${record.verificationDepth}`,
    ...record.scopeLabels,
    ...record.flags,
    ...record.sourceEvidence.flatMap((source) => [
      source.label,
      source.tier,
      source.locator,
      source.supportsClaim ? "supports claim" : "conflicts with claim",
    ]),
  ], 32);
  return {
    title,
    filename,
    htmlFilename: htmlFilenameForMarkdownFilename(filename),
    wordFilename: wordFilenameForMarkdownFilename(filename),
    markdown,
    html: printableHtmlForMarkdown(title, markdown),
    mimeType: "text/markdown;charset=utf-8",
    htmlMimeType: "text/html;charset=utf-8",
    wordMimeType: "application/msword;charset=utf-8",
    readyExportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
    plannedExportTargets: ["native_docx_planned", "image_export_planned"],
    metadataLabels,
  };
}
