// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import {
  inferReportKindFromText,
  inferReportOutputFormatFromText,
  reportLabelForKind,
} from "@/lib/reportSeedMetadata";
import type { ReportKind, ReportOutputFormat } from "@/lib/reportGeneratorState";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import {
  buildStudyResultExportManifest,
  extractStudyCsvRowsFromMarkdown,
  type StudyResultExportManifest,
  type StudyResultExportState,
} from "@/lib/studyResultExportState";
import {
  buildStudyArtifactFilterChips,
  searchStudyArtifacts,
  type StudyArtifactFilterChip,
} from "@/lib/studyArtifactSearchIndexState";
import { buildMedicalTopologySearchState } from "@/lib/medicalAnkiStudyState";
import { buildMedicalAnkiWorkflowState } from "@/lib/medicalAnkiWorkflowState";
import { buildMedicalConceptRepairArtifactState } from "@/lib/medicalConceptRepairArtifactState";
import {
  buildMedicalTrustedReferenceArtifactState,
  medicalDetailZoomLabel,
} from "@/lib/medicalTrustedReferenceState";
import {
  buildStudyAcademicScopeContinuationLines,
  buildStudyAcademicScopeFocusBadges,
} from "@/lib/studyAcademicScopeState";

export const STUDY_REPORT_ARTIFACTS_KEY = "omnyid.study-report-artifacts";
export const STUDY_REPORT_ARTIFACT_SAVED_EVENT = "omnyid:study-report-artifact-saved";
const MAX_STUDY_REPORT_ARTIFACTS = 20;

export type StudyReportArtifact = {
  id: string;
  title: string;
  filename: string;
  markdown: string;
  mimeType: string;
  reportKind: ReportKind | null;
  reportLabel: string | null;
  outputFormat: ReportOutputFormat | null;
  sourceLabels: string[];
  policyLabel: string | null;
  courseTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  moduleLabel?: string | null;
  dueLabel?: string | null;
  deadlineId?: string | null;
  providerId?: string | null;
  academicKind?: string | null;
  sessionId?: string | null;
  routeSource?: string | null;
  answersIncluded?: boolean | null;
  structuredItemCount?: number;
  sectionCount: number;
  createdAt: number;
};

export type StudyReportArtifactListState = {
  totalCount: number;
  filteredCount: number;
  visibleCount: number;
  hiddenCount: number;
  hasQuery: boolean;
  hasNoMatches: boolean;
  visibleArtifacts: StudyReportArtifact[];
  filterChips: StudyReportArtifactFilterChip[];
  summaryLabel: string;
  emptyTitle: string | null;
  emptyDetail: string | null;
};

export function buildStudyReportArtifactExportManifest(
  artifact: StudyReportArtifact,
  answersIncluded?: boolean | null,
): StudyResultExportManifest {
  const answerPolicy = answersIncluded ?? artifact.answersIncluded ?? null;
  return buildStudyResultExportManifest({
    title: artifact.title,
    filename: artifact.filename,
    markdown: artifact.markdown,
    answersIncluded: answerPolicy,
    reportKind: artifact.reportKind,
    outputFormat: artifact.outputFormat,
    sourceLabels: artifact.sourceLabels,
    policyLabel: artifact.policyLabel,
    courseTag: artifact.courseTag,
    chapterTag: artifact.chapterTag,
    unitTag: artifact.unitTag,
    moduleLabel: artifact.moduleLabel,
    dueLabel: artifact.dueLabel,
    deadlineId: artifact.deadlineId,
    providerId: artifact.providerId,
    academicKind: artifact.academicKind,
    sessionId: artifact.sessionId,
  });
}

export type StudyReportArtifactFilterChip = StudyArtifactFilterChip;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const item = clean(entry);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 12) break;
  }
  return result;
}

function normalizeArtifact(value: unknown): StudyReportArtifact | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id);
  const title = clean(value.title);
  const filename = clean(value.filename);
  const markdown = clean(value.markdown);
  const mimeType = clean(value.mimeType) || "text/markdown;charset=utf-8";
  const reportKind = normalizeReportKindValue(value.reportKind)
    ?? inferReportKindFromText(`${title}\n${markdown}`);
  const outputFormat = normalizeReportOutputFormatValue(value.outputFormat)
    ?? inferReportOutputFormatFromText(markdown);
  const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
    ? value.createdAt
    : 0;
  const sectionCount = typeof value.sectionCount === "number" && Number.isFinite(value.sectionCount)
    ? Math.max(0, Math.floor(value.sectionCount))
    : 0;
  const extractedItemCount = extractStudyCsvRowsFromMarkdown(markdown, {
    answersIncluded: typeof value.answersIncluded === "boolean" ? value.answersIncluded : null,
    sourceLabels: cleanStringList(value.sourceLabels),
    courseTag: clean(value.courseTag) || null,
    chapterTag: clean(value.chapterTag) || null,
    unitTag: clean(value.unitTag) || null,
    moduleLabel: clean(value.moduleLabel) || null,
    dueLabel: clean(value.dueLabel) || null,
    deadlineId: clean(value.deadlineId) || null,
    providerId: clean(value.providerId) || null,
  }).length;
  const structuredItemCount = typeof value.structuredItemCount === "number" && Number.isFinite(value.structuredItemCount)
    ? Math.max(0, Math.floor(value.structuredItemCount))
    : extractedItemCount;

  if (!id || !title || !filename || !markdown || createdAt <= 0) return null;

  return {
    id,
    title,
    filename,
    markdown,
    mimeType,
    reportKind,
    reportLabel: reportKind ? reportLabelForKind(reportKind) : clean(value.reportLabel) || null,
    outputFormat,
    sourceLabels: cleanStringList(value.sourceLabels),
    policyLabel: clean(value.policyLabel) || null,
    courseTag: clean(value.courseTag) || null,
    chapterTag: clean(value.chapterTag) || null,
    unitTag: clean(value.unitTag) || null,
    moduleLabel: clean(value.moduleLabel) || null,
    dueLabel: clean(value.dueLabel) || null,
    deadlineId: clean(value.deadlineId) || null,
    providerId: clean(value.providerId) || null,
    academicKind: clean(value.academicKind) || null,
    sessionId: clean(value.sessionId) || null,
    routeSource: clean(value.routeSource) || null,
    answersIncluded: typeof value.answersIncluded === "boolean" ? value.answersIncluded : null,
    structuredItemCount,
    sectionCount,
    createdAt,
  };
}

function normalizeReportKindValue(value: unknown): ReportKind | null {
  return value === "exam_preparation"
    || value === "day_schedule"
    || value === "assignment_plan"
    || value === "weekly_revision"
    || value === "zettelkasten_synthesis"
    || value === "course_builder"
    || value === "quiz_generator"
    || value === "flashcard_deck"
    || value === "cheatsheet"
    || value === "lecture_summary"
    || value === "practice_questions"
    || value === "guided_study_session"
    ? value
    : null;
}

function normalizeReportOutputFormatValue(value: unknown): ReportOutputFormat | null {
  return value === "chat_markdown"
    || value === "print_ready"
    || value === "copyable_outline"
    || value === "csv_flashcards"
    ? value
    : null;
}

function knowledgeModeForReportKind(kind: ReportKind | null): OnboardingQuickStartSeed["knowledgeMode"] {
  return kind === "zettelkasten_synthesis" ? "zettelkasten" : "connected_notes";
}

function continuationLabelForArtifact(artifact: StudyReportArtifact): string {
  const label = artifact.reportLabel ?? (artifact.reportKind ? reportLabelForKind(artifact.reportKind) : "saved study output");
  return `Continue ${label}`;
}

function sourceFocusLabel(artifact: StudyReportArtifact): string {
  if (artifact.sourceLabels.length === 0) return "the retained source context available in OmnyID";
  if (artifact.sourceLabels.length === 1) return artifact.sourceLabels[0]!;
  const visible = artifact.sourceLabels.slice(0, 4);
  const overflow = artifact.sourceLabels.length > visible.length
    ? ` and ${artifact.sourceLabels.length - visible.length} more`
    : "";
  return `${visible.join(", ")}${overflow}`;
}

function hasMedicalTopologySourceOnlySignal(artifact: StudyReportArtifact): boolean {
  return /\breadiness\s*:\s*source only\b|\bsource only\b|\btopology_gap:source_only\b/i.test(
    `${artifact.title}\n${artifact.markdown}`,
  );
}

export function normalizeStudyReportArtifacts(value: unknown): StudyReportArtifact[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const artifacts: StudyReportArtifact[] = [];
  for (const entry of value) {
    const artifact = normalizeArtifact(entry);
    if (!artifact || seen.has(artifact.id)) continue;
    seen.add(artifact.id);
    artifacts.push(artifact);
  }
  return artifacts
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_STUDY_REPORT_ARTIFACTS);
}

export function loadStudyReportArtifacts(storage: Storage = localStorage): StudyReportArtifact[] {
  const raw = storage.getItem(STUDY_REPORT_ARTIFACTS_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(STUDY_REPORT_ARTIFACTS_KEY);
    return [];
  }
  const artifacts = normalizeStudyReportArtifacts(parsed.value);
  if (artifacts.length === 0) storage.removeItem(STUDY_REPORT_ARTIFACTS_KEY);
  return artifacts;
}

export function saveStudyReportArtifact(
  artifact: StudyReportArtifact,
  storage: Storage = localStorage,
): StudyReportArtifact {
  const existing = loadStudyReportArtifacts(storage).filter((item) => item.id !== artifact.id);
  const next = normalizeStudyReportArtifacts([artifact, ...existing]);
  storage.setItem(STUDY_REPORT_ARTIFACTS_KEY, JSON.stringify(next));
  return next[0] ?? artifact;
}

export function buildStudyReportArtifact(input: {
  exportState: StudyResultExportState;
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
  routeSource?: string | null;
  now?: number;
}): StudyReportArtifact {
  const createdAt = input.now ?? Date.now();
  const idBase = `${input.exportState.filename}:${createdAt}`;
  const reportKind = inferReportKindFromText(`${input.exportState.title}\n${input.exportState.markdown}`);
  const outputFormat = inferReportOutputFormatFromText(input.exportState.markdown);
  return {
    id: idBase.toLowerCase().replace(/[^a-z0-9:.]+/g, "-"),
    title: input.exportState.title,
    filename: input.exportState.filename,
    markdown: input.exportState.markdown,
    mimeType: input.exportState.mimeType,
    reportKind,
    reportLabel: reportKind ? reportLabelForKind(reportKind) : null,
    outputFormat,
    sourceLabels: cleanStringList(input.sourceLabels ?? []),
    policyLabel: clean(input.policyLabel) || null,
    courseTag: clean(input.courseTag) || null,
    chapterTag: clean(input.chapterTag) || null,
    unitTag: clean(input.unitTag) || null,
    moduleLabel: clean(input.moduleLabel) || null,
    dueLabel: clean(input.dueLabel) || null,
    deadlineId: clean(input.deadlineId) || null,
    providerId: clean(input.providerId) || null,
    academicKind: clean(input.academicKind) || null,
    sessionId: clean(input.sessionId) || null,
    routeSource: clean(input.routeSource) || null,
    answersIncluded: input.exportState.answersIncluded ?? null,
    structuredItemCount: input.exportState.csvRowCount ?? 0,
    sectionCount: input.exportState.sectionCount,
    createdAt,
  };
}

export function buildStudyReportArtifactContinuationSeed(
  artifact: StudyReportArtifact,
): OnboardingQuickStartSeed {
  const reportKind = artifact.reportKind;
  const reportLabel = artifact.reportLabel ?? (reportKind ? reportLabelForKind(reportKind) : "saved study output");
  const outputFormat = artifact.outputFormat;
  const sourceLabel = sourceFocusLabel(artifact);
  const knowledgeMode = knowledgeModeForReportKind(reportKind);
  const medicalWorkflow = buildMedicalAnkiWorkflowState(artifact);
  const medicalTopology = buildMedicalTopologySearchState(artifact);
  const repairState = buildMedicalConceptRepairArtifactState(artifact);
  const trustedReferenceState = buildMedicalTrustedReferenceArtifactState(artifact);
  const medicalTopologySourceOnly = hasMedicalTopologySourceOnlySignal(artifact);
  const medicalWorkflowLines = medicalWorkflow.workflowKind === "graph_gap_cloze_deck"
    ? [
      "Continue this as a medical graph-gap cloze deck workflow, not a generic flashcard request.",
      "Preserve graph-gap scope, source locators, chapter/unit tags, and concept supertags.",
      "Add only source-backed cloze or short-vignette rows for missing or weak graph areas; avoid duplicating already-covered cards.",
    ]
    : medicalWorkflow.workflowKind === "vignette_block"
      ? [
        "Continue this as a medical vignette block workflow, not a generic practice set.",
        "Regenerate freshly phrased clinical application questions from the same concept graph.",
        "Vary patient framing, distractors, and management step while preserving source-backed concept relationships and answer rationale.",
      ]
      : [];
  const repairBadges = repairState.isMedicalConceptRepair
    ? [
      repairState.repairKind ? `repair_kind:${repairState.repairKind}` : null,
      ...repairState.scoreBands.map((band) => `score_band:${band}`),
      ...repairState.relationshipIds.slice(0, 3).map((id) => `relationship:${id}`),
    ].filter((value): value is string => Boolean(value))
    : [];
  const repairContinuationLines = repairState.repairKind === "concept_edge_repair"
    ? [
      "Continue this as a medical concept-edge repair workflow, not a generic practice set.",
      repairState.relationshipIds.length
        ? `Preserve these relationship IDs unless the student explicitly changes scope: ${repairState.relationshipIds.join(", ")}.`
        : "Preserve the concept-edge relationship scope from the saved output.",
      repairState.scoreBands.length
        ? `Preserve score-band context: ${repairState.scoreBands.map((band) => `score_band:${band}`).join(", ")}.`
        : "If score evidence is missing, keep the output labelled as unmeasured rather than claiming mastery.",
      "Regenerate fresh wording from retained sources and graph edges; do not reuse or reconstruct proprietary question stems.",
      "Ask for or record a new medical_edge_attempt row only after the student answers the regenerated items.",
    ]
    : repairState.repairKind === "missed_topic_repair"
      ? [
        "Continue this as a medical missed-topic repair workflow, not a generic card-generation request.",
        "Use missed-topic labels as safe metadata only and generate new wording from retained source material.",
        "Avoid duplicate card creation for topics already covered by cited saved outputs.",
      ]
      : [];
  const topologyContinuationLines = medicalTopology.labels.length > 0
    ? [
      "Continue this as a medical topology coverage workflow, not a generic saved-output follow-up.",
      "Preserve the carried coverage scope, source locator state, medical concept tags, and conservative readiness label.",
      medicalTopologySourceOnly
        ? "Source-only gap: retained source material exists but generated cloze/vignette inventory or attempt evidence is still missing for this exact scope."
        : medicalTopology.labels.includes("Needs source locator")
        ? "Source-locator gap: ask for or preserve page, slide, heading, timestamp, or chunk evidence before treating the output as source-grounded."
        : "Source-locator evidence exists; keep locator references visible in any regenerated cloze, vignette, or attempt output.",
      "Use topology coverage to decide whether to generate missing cloze/vignette rows, request attempt evidence, reduce review load, or run a timed vignette block.",
    ]
    : [];
  const medicalTopologyStableBadges = medicalTopology.labels.length > 0
    ? [
      "medical_topology_coverage",
      medicalTopologySourceOnly ? "topology_gap:source_only" : null,
      medicalTopology.labels.includes("Needs source locator") ? "topology_gap:needs_locator" : null,
      medicalTopology.searchTerms.includes("shallow first order") ? "topology_gap:overload" : null,
    ].filter((value): value is string => Boolean(value))
    : [];
  const trustedReferenceContinuationLines = trustedReferenceState.hasMedicalTrustedReferenceSignal
    ? [
      `Continue with medical trusted-grounding preserved at detail zoom: ${medicalDetailZoomLabel(trustedReferenceState.detailZoom)}.`,
      trustedReferenceState.usesStudentSourcePrimaryRule
        ? "Keep retained student uploads and source locators as primary evidence before any external reference support."
        : "If retained source evidence is thin, say so before adding broader medical context.",
      trustedReferenceState.usesTrustedReferenceSupport
        ? "Use trusted open-reference snippets only when they are present in the retained context, and distinguish them from course material."
        : "Do not invent external citations or imply trusted reference retrieval happened if no trusted snippets are present.",
      "Never treat LLM internal knowledge as source evidence; mark unsupported medical claims as needing verification.",
      trustedReferenceState.restrictsClinicalDatasetUse
        ? "Keep the clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation or patient-specific advice."
        : null,
    ].filter((value): value is string => Boolean(value))
    : [];
  const trustedReferenceBadges = trustedReferenceState.hasMedicalTrustedReferenceSignal
    ? [
      "medical_trusted_grounding",
      `detail_zoom:${trustedReferenceState.detailZoom}`,
      trustedReferenceState.usesTrustedReferenceSupport ? "trusted_reference:supported" : null,
      trustedReferenceState.usesStudentSourcePrimaryRule ? "trusted_reference:student_source_primary" : null,
      trustedReferenceState.restrictsClinicalDatasetUse ? "trusted_reference:clinical_dataset_restricted" : null,
    ].filter((value): value is string => Boolean(value))
    : [];
  const focusBadges = [
    reportKind ? `report_kind:${reportKind}` : null,
    outputFormat ? `output_format:${outputFormat}` : null,
    artifact.policyLabel ? `retention:${artifact.policyLabel}` : null,
    ...buildStudyAcademicScopeFocusBadges(artifact),
    ...medicalWorkflow.focusBadges,
    ...medicalTopologyStableBadges,
    ...medicalTopology.searchTerms.slice(0, 12).map((term) => `medical_topology:${term}`),
    ...repairBadges,
    ...trustedReferenceBadges,
    ...artifact.sourceLabels.slice(0, 4).map((source) => `source:${source}`),
  ].filter((value): value is string => Boolean(value));

  return {
    label: continuationLabelForArtifact(artifact),
    description: `Reopen "${artifact.title}" as an active study task instead of treating it as a static saved file.`,
    flowKind: "grounded_followup",
    query: [
      `Continue from my saved ${reportLabel}: "${artifact.title}".`,
      ...buildStudyAcademicScopeContinuationLines(artifact),
      `Use ${sourceLabel} plus any retained files, supertags, graph links, and prior Zettelkasten notes that match this report.`,
      "Do not start a generic answer. Strengthen the same output with updated priorities, missing sources, weak links, source caveats, and the next concrete study action.",
      ...medicalWorkflowLines,
      ...topologyContinuationLines,
      ...repairContinuationLines,
      ...trustedReferenceContinuationLines,
      outputFormat ? `Preserve the reusable output format: ${outputFormat.replace(/_/g, " ")}.` : null,
      knowledgeMode === "zettelkasten"
        ? "Keep this in Zettelkasten mode: identify what contributes to, challenges, extends, or alters the existing note chain."
        : "Keep this in connected-notes mode: use retained academic memory, topology, and supertags to connect the same study context.",
    ].filter((value): value is string => Boolean(value)).join(" "),
    notice: "Saved report continuation loaded. OmnyID will reuse the report type, sources, and retained context where available.",
    helper: artifact.sourceLabels.length > 0
      ? "Attach updated lecture notes, a new reading, or a fresh assessment scope only if the saved report needs new evidence."
      : "Attach one matching source if the saved report was not grounded enough, otherwise run from retained memory.",
    valuePromise: "Turn a saved study output back into an active exam-prep, quiz, cheatsheet, schedule, or note-chain workflow without re-explaining the context.",
    recommendedUpload: artifact.sourceLabels.length > 0
      ? `Optional: updated material related to ${artifact.sourceLabels[0]}.`
      : "Optional: one lecture, reading, rubric, or rough note that matches the saved report.",
    knowledgeMode,
    retentionMode: "keep_extracted_only",
    originLabel: "From saved report",
    focusBadges,
    checklist: [
      "Keep extracted-note retention on so improvements remain searchable.",
      "Ask for what changed, what is weak, and what to do next.",
      "Use Reports, Files, and the Knowledge Graph to keep the same study context connected.",
    ],
    nextSteps: [
      "Save the improved output back into Reports history.",
      knowledgeMode === "zettelkasten"
        ? "Open the Zettelkasten graph lens to continue the strongest note branch."
        : "Open Files or Knowledge Graph to inspect the retained sources behind the improved report.",
    ],
  };
}

export function emitStudyReportArtifactSaved(artifact: StudyReportArtifact): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDY_REPORT_ARTIFACT_SAVED_EVENT, { detail: artifact }));
}

export function filterStudyReportArtifacts(
  artifacts: readonly StudyReportArtifact[],
  query: string | null | undefined,
): StudyReportArtifact[] {
  return searchStudyArtifacts(artifacts, query);
}

export function buildStudyReportArtifactListState(input: {
  artifacts: readonly StudyReportArtifact[];
  query?: string | null;
  showAll?: boolean;
  previewLimit?: number;
}): StudyReportArtifactListState {
  const query = clean(input.query);
  const filteredArtifacts = filterStudyReportArtifacts(input.artifacts, query);
  const previewLimit = typeof input.previewLimit === "number" && Number.isFinite(input.previewLimit)
    ? Math.max(1, Math.floor(input.previewLimit))
    : 5;
  const visibleArtifacts = input.showAll
    ? filteredArtifacts
    : filteredArtifacts.slice(0, previewLimit);
  const hiddenCount = Math.max(0, filteredArtifacts.length - visibleArtifacts.length);
  const hasNoMatches = query.length > 0 && input.artifacts.length > 0 && filteredArtifacts.length === 0;

  return {
    totalCount: input.artifacts.length,
    filteredCount: filteredArtifacts.length,
    visibleCount: visibleArtifacts.length,
    hiddenCount,
    hasQuery: query.length > 0,
    hasNoMatches,
    visibleArtifacts,
    filterChips: buildStudyArtifactFilterChips(input.artifacts),
    summaryLabel: query.length > 0
      ? `${filteredArtifacts.length}/${input.artifacts.length} saved`
      : `${input.artifacts.length} saved`,
    emptyTitle: hasNoMatches ? "No saved reports match this search." : null,
    emptyDetail: hasNoMatches
      ? "Try a report type, course tag, source filename, retention policy, or keyword from the generated output."
      : null,
  };
}
