// @locs-version: 1.0
import { reportLabelForKind } from "@/lib/reportSeedMetadata";
import type { ReportKind, ReportOutputFormat } from "@/lib/reportGeneratorState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import {
  buildStudyResultExportCapabilitySummary,
  buildStudyResultExportManifest,
} from "@/lib/studyResultExportState";
import {
  buildStudyAcademicScopeSearchValues,
} from "@/lib/studyAcademicScopeState";
import { buildMedicalAnkiQualityState } from "@/lib/medicalAnkiQualityState";
import { buildMedicalTopologySearchState } from "@/lib/medicalAnkiStudyState";
import { buildMedicalAnkiWorkflowState } from "@/lib/medicalAnkiWorkflowState";
import { buildMedicalConceptRepairArtifactState } from "@/lib/medicalConceptRepairArtifactState";
import { buildMedicalTrustedReferenceArtifactState } from "@/lib/medicalTrustedReferenceState";
import {
  studyOutputContractForReportKind,
  type StudyOutputExportFormat,
  type StudyOutputScopeRequirement,
  type StudyOutputStructureRequirement,
} from "@/lib/studyOutputTemplateContractState";

export type StudyArtifactSearchIndexEntry = {
  id: string;
  title: string;
  filename: string;
  reportKind: ReportKind | null;
  reportLabel: string | null;
  outputFormat: ReportOutputFormat | null;
  courseTag: string | null;
  chapterTag: string | null;
  unitTag: string | null;
  moduleLabel: string | null;
  dueLabel: string | null;
  deadlineId: string | null;
  providerId: string | null;
  academicKind: string | null;
  sessionId: string | null;
  routeSource: string | null;
  sourceLabels: string[];
  policyLabel: string | null;
  answersIncluded: boolean | null;
  structuredItemCount: number;
  readyExportFormats: StudyOutputExportFormat[];
  plannedExportFormats: StudyOutputExportFormat[];
  exportCapabilitySummary: string;
  exportCapabilityLabels: string[];
  scopeRequirements: StudyOutputScopeRequirement[];
  structureRequirements: StudyOutputStructureRequirement[];
  metadataLabels: string[];
  tokens: string[];
  searchText: string;
  artifact: StudyReportArtifact;
};

export type StudyArtifactFilterChip = {
  label: string;
  query: string;
  count: number;
  kind: "report" | "course" | "chapter" | "unit" | "module" | "deadline" | "provider" | "source" | "format" | "retention" | "session" | "answer" | "structure" | "repair" | "quality" | "workflow" | "topology" | "reference";
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function exportFormatForManifestId(id: string): StudyOutputExportFormat | null {
  if (id === "markdown") return "markdown";
  if (id === "html") return "html";
  if (id === "pdf" || id === "browser_pdf") return "browser_pdf";
  if (id === "word_doc") return "word_doc";
  if (id === "docx" || id === "native_docx_planned") return "native_docx_planned";
  if (id === "csv") return "csv";
  if (id === "jpg" || id === "png" || id === "image_export_planned") return "image_export_planned";
  return null;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function artifactAnswerLabel(artifact: StudyReportArtifact): string | null {
  if (artifact.answersIncluded === true) return "answers included";
  if (artifact.answersIncluded === false) return "answers withheld";
  return null;
}

function artifactStructuredItemLabel(artifact: StudyReportArtifact): string | null {
  return artifact.structuredItemCount && artifact.structuredItemCount > 0
    ? `${artifact.structuredItemCount} structured item${artifact.structuredItemCount === 1 ? "" : "s"}`
    : null;
}

function artifactContractValues(artifact: StudyReportArtifact): {
  scopeRequirements: StudyOutputScopeRequirement[];
  structureRequirements: StudyOutputStructureRequirement[];
  exportFormats: StudyOutputExportFormat[];
  promptInstruction: string | null;
} {
  if (!artifact.reportKind) {
    return {
      scopeRequirements: [],
      structureRequirements: [],
      exportFormats: [],
      promptInstruction: null,
    };
  }
  const contract = studyOutputContractForReportKind(artifact.reportKind);
  return {
    scopeRequirements: contract.scopeRequirements,
    structureRequirements: contract.structureRequirements,
    exportFormats: contract.exportFormats,
    promptInstruction: contract.promptInstruction,
  };
}

function artifactReadyAndPlannedFormats(artifact: StudyReportArtifact): {
  ready: StudyOutputExportFormat[];
  planned: StudyOutputExportFormat[];
  summary: string;
  labels: string[];
} {
  const manifest = buildStudyResultExportManifest({
    title: artifact.title,
    filename: artifact.filename,
    markdown: artifact.markdown,
    answersIncluded: artifact.answersIncluded ?? null,
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
  const ready = uniqueStrings(manifest.readyEntries.map((entry) => exportFormatForManifestId(entry.id)))
    .filter((entry): entry is StudyOutputExportFormat => Boolean(entry));
  const planned = uniqueStrings(manifest.plannedEntries.map((entry) => exportFormatForManifestId(entry.id)))
    .filter((entry): entry is StudyOutputExportFormat => Boolean(entry));
  const capability = buildStudyResultExportCapabilitySummary(manifest);
  return {
    ready,
    planned,
    summary: capability.studentSummary,
    labels: capability.searchLabels,
  };
}

export function buildStudyArtifactSearchIndex(
  artifacts: readonly StudyReportArtifact[],
): StudyArtifactSearchIndexEntry[] {
  return artifacts.map((artifact) => {
    const contract = artifactContractValues(artifact);
    const manifestFormats = artifactReadyAndPlannedFormats(artifact);
    const reportLabel = artifact.reportLabel ?? (artifact.reportKind ? reportLabelForKind(artifact.reportKind) : null);
    const answerLabel = artifactAnswerLabel(artifact);
    const structuredItemLabel = artifactStructuredItemLabel(artifact);
    const qualityState = buildMedicalAnkiQualityState(artifact);
    const workflowState = buildMedicalAnkiWorkflowState(artifact);
    const topologyState = buildMedicalTopologySearchState(artifact);
    const repairState = buildMedicalConceptRepairArtifactState(artifact);
    const trustedReferenceState = buildMedicalTrustedReferenceArtifactState(artifact);
    const metadataLabels = uniqueStrings([
      reportLabel,
      artifact.reportKind,
      artifact.outputFormat,
      artifact.policyLabel,
      ...buildStudyAcademicScopeSearchValues(artifact),
      answerLabel,
      structuredItemLabel,
      ...manifestFormats.ready.map((format) => `${label(format)} ready`),
      ...manifestFormats.planned.map((format) => `${label(format)} planned`),
      manifestFormats.summary,
      ...manifestFormats.labels,
      ...contract.scopeRequirements.map((scope) => `scope:${scope}`),
      ...contract.structureRequirements.map((requirement) => `structure:${requirement}`),
      ...contract.exportFormats.map((format) => `export:${format}`),
      ...workflowState.labels,
      ...topologyState.labels,
      ...qualityState.labels,
      ...repairState.labels,
      ...trustedReferenceState.labels,
      ...artifact.sourceLabels,
    ]);
    const searchValues = uniqueStrings([
      artifact.title,
      artifact.filename,
      artifact.markdown,
      reportLabel,
      artifact.reportKind,
      artifact.outputFormat,
      artifact.policyLabel,
      ...buildStudyAcademicScopeSearchValues(artifact),
      answerLabel,
      structuredItemLabel,
      contract.promptInstruction,
      ...manifestFormats.ready,
      ...manifestFormats.planned,
      manifestFormats.summary,
      ...manifestFormats.labels,
      ...contract.scopeRequirements,
      ...contract.structureRequirements,
      ...contract.exportFormats,
      ...workflowState.searchTerms,
      ...topologyState.searchTerms,
      ...qualityState.searchTerms,
      ...repairState.searchTerms,
      ...trustedReferenceState.searchTerms,
      ...metadataLabels,
      ...artifact.sourceLabels,
    ]);
    const searchText = searchValues.join(" ").toLowerCase();
    const tokens = uniqueStrings(searchValues.flatMap(words));

    return {
      id: artifact.id,
      title: artifact.title,
      filename: artifact.filename,
      reportKind: artifact.reportKind,
      reportLabel,
      outputFormat: artifact.outputFormat,
      courseTag: artifact.courseTag ?? null,
      chapterTag: artifact.chapterTag ?? null,
      unitTag: artifact.unitTag ?? null,
      moduleLabel: artifact.moduleLabel ?? null,
      dueLabel: artifact.dueLabel ?? null,
      deadlineId: artifact.deadlineId ?? null,
      providerId: artifact.providerId ?? null,
      academicKind: artifact.academicKind ?? null,
      sessionId: artifact.sessionId ?? null,
      routeSource: artifact.routeSource ?? null,
      sourceLabels: artifact.sourceLabels,
      policyLabel: artifact.policyLabel,
      answersIncluded: artifact.answersIncluded ?? null,
      structuredItemCount: artifact.structuredItemCount ?? 0,
      readyExportFormats: manifestFormats.ready,
      plannedExportFormats: manifestFormats.planned,
      exportCapabilitySummary: manifestFormats.summary,
      exportCapabilityLabels: manifestFormats.labels,
      scopeRequirements: contract.scopeRequirements,
      structureRequirements: contract.structureRequirements,
      metadataLabels,
      tokens,
      searchText,
      artifact,
    };
  });
}

export function searchStudyArtifacts(
  artifacts: readonly StudyReportArtifact[],
  query: string | null | undefined,
): StudyReportArtifact[] {
  const terms = clean(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return [...artifacts];

  return buildStudyArtifactSearchIndex(artifacts)
    .filter((entry) => terms.every((term) => entry.searchText.includes(term)))
    .map((entry) => entry.artifact);
}

function addFilterChip(
  counts: Map<string, StudyArtifactFilterChip>,
  input: Omit<StudyArtifactFilterChip, "count">,
): void {
  const key = `${input.kind}:${input.query.toLowerCase()}`;
  const existing = counts.get(key);
  if (existing) {
    counts.set(key, { ...existing, count: existing.count + 1 });
    return;
  }
  counts.set(key, { ...input, count: 1 });
}

export function buildStudyArtifactFilterChips(
  artifacts: readonly StudyReportArtifact[],
): StudyArtifactFilterChip[] {
  const counts = new Map<string, StudyArtifactFilterChip>();
  for (const entry of buildStudyArtifactSearchIndex(artifacts)) {
    if (entry.reportLabel || entry.reportKind) {
      addFilterChip(counts, {
        label: entry.reportLabel ?? entry.reportKind!.replace(/_/g, " "),
        query: entry.reportLabel ?? entry.reportKind!,
        kind: "report",
      });
    }
    if (entry.outputFormat) {
      addFilterChip(counts, {
        label: label(entry.outputFormat),
        query: entry.outputFormat,
        kind: "format",
      });
    }
    for (const format of [...entry.readyExportFormats, ...entry.plannedExportFormats]) {
      addFilterChip(counts, {
        label: label(format),
        query: format,
        kind: "format",
      });
    }
    if (entry.policyLabel) {
      addFilterChip(counts, {
        label: entry.policyLabel,
        query: entry.policyLabel,
        kind: "retention",
      });
    }
    if (entry.courseTag) {
      addFilterChip(counts, {
        label: entry.courseTag,
        query: entry.courseTag,
        kind: "course",
      });
    }
    if (entry.chapterTag) {
      addFilterChip(counts, {
        label: entry.chapterTag,
        query: entry.chapterTag,
        kind: "chapter",
      });
    }
    if (entry.unitTag) {
      addFilterChip(counts, {
        label: entry.unitTag,
        query: entry.unitTag,
        kind: "unit",
      });
    }
    if (entry.moduleLabel) {
      addFilterChip(counts, {
        label: entry.moduleLabel,
        query: entry.moduleLabel,
        kind: "module",
      });
    }
    if (entry.dueLabel) {
      addFilterChip(counts, {
        label: entry.dueLabel,
        query: entry.dueLabel,
        kind: "deadline",
      });
    }
    if (entry.deadlineId) {
      addFilterChip(counts, {
        label: entry.deadlineId,
        query: entry.deadlineId,
        kind: "deadline",
      });
    }
    if (entry.providerId) {
      addFilterChip(counts, {
        label: entry.providerId,
        query: entry.providerId,
        kind: "provider",
      });
    }
    if (entry.sessionId) {
      addFilterChip(counts, {
        label: "Guided session",
        query: entry.sessionId,
        kind: "session",
      });
    }
    if (entry.answersIncluded !== null) {
      addFilterChip(counts, {
        label: entry.answersIncluded ? "Answers included" : "Answers withheld",
        query: entry.answersIncluded ? "answers included" : "answers withheld",
        kind: "answer",
      });
    }
    if (entry.structuredItemCount > 0) {
      addFilterChip(counts, {
        label: "Structured rows",
        query: "structured rows",
        kind: "structure",
      });
    }
    for (const label of entry.metadataLabels.filter((value) =>
      /^Medical .* repair$/i.test(value) || /^score band:/i.test(value) || /^relationship:/i.test(value)
    ).slice(0, 6)) {
      addFilterChip(counts, {
        label,
        query: label,
        kind: "repair",
      });
    }
    for (const label of entry.metadataLabels.filter((value) =>
      /^Medical .*upgrade$/i.test(value) || /^Medical review-load control$/i.test(value) || /shallow first-order signal/i.test(value)
    ).slice(0, 6)) {
      addFilterChip(counts, {
        label,
        query: label,
        kind: "quality",
      });
    }
    for (const label of entry.metadataLabels.filter((value) =>
      /^Medical graph-gap cloze deck$/i.test(value) || /^Medical vignette block$/i.test(value)
    ).slice(0, 4)) {
      addFilterChip(counts, {
        label,
        query: label,
        kind: "workflow",
      });
    }
    for (const label of entry.metadataLabels.filter((value) =>
      /^Medical topology coverage$/i.test(value)
      || /^(pathophys|pharm|presentation|investigation|management|complication|contraindication)$/i.test(value)
      || /^(system|condition|pathophys|pharm|presentation|investigation|management|complication|contraindication):/i.test(value)
      || /^Needs source locator$/i.test(value)
      || /^Source-only topology gap$/i.test(value)
      || /^Review overload topology gap$/i.test(value)
      || /^\d+ source locators?$/i.test(value)
    ).slice(0, 8)) {
      addFilterChip(counts, {
        label,
        query: label,
        kind: "topology",
      });
    }
    for (const label of entry.metadataLabels.filter((value) =>
      /^Medical trusted grounding$/i.test(value)
      || /^Trusted reference supported$/i.test(value)
      || /^Student-source primary$/i.test(value)
      || /^No internal-knowledge citations$/i.test(value)
      || /^Clinical dataset restricted$/i.test(value)
      || /^Detail zoom:/i.test(value)
    ).slice(0, 8)) {
      addFilterChip(counts, {
        label,
        query: label,
        kind: "reference",
      });
    }
    for (const source of entry.sourceLabels.slice(0, 4)) {
      addFilterChip(counts, {
        label: source,
        query: source,
        kind: "source",
      });
    }
  }
  const priority: Record<StudyArtifactFilterChip["kind"], number> = {
    report: 0,
    course: 1,
    chapter: 2,
    unit: 3,
    module: 4,
    deadline: 5,
    provider: 6,
    source: 7,
    answer: 8,
    structure: 9,
    repair: 10,
    quality: 11,
    workflow: 12,
    topology: 13,
    reference: 14,
    session: 15,
    format: 16,
    retention: 17,
  };
  return [...counts.values()]
    .sort((left, right) =>
      priority[left.kind] - priority[right.kind]
      || right.count - left.count
      || left.label.localeCompare(right.label),
    )
    .slice(0, 18);
}
