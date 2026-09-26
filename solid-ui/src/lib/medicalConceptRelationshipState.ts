// @locs-version: 1.0
import { MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND } from "@/lib/medicalAnkiStudyState";
import {
  buildMedicalTrustedReferenceArtifactState,
  type MedicalDetailZoom,
} from "@/lib/medicalTrustedReferenceState";
import { extractStudyCsvRowsFromMarkdown, type StudyResultCsvRow } from "@/lib/studyResultCsvState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalConceptRelationshipKind =
  | "pathophys_to_presentation"
  | "pharm_to_contraindication"
  | "presentation_to_investigation"
  | "diagnosis_to_management"
  | "condition_to_complication"
  | "concept_link";

export type MedicalConceptRelationship = {
  id: string;
  artifactId: string;
  relationship: MedicalConceptRelationshipKind;
  fromConcept: string;
  toConcept: string;
  courseTag: string | null;
  systemTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  sourceLocator: string | null;
  reasoningOrder: string | null;
  detailZoom: MedicalDetailZoom | null;
  trustedReferenceSupported: boolean;
  studentSourcePrimary: boolean;
  clinicalDatasetRestricted: boolean;
  evidenceLabel: string;
};

export type MedicalConceptRelationshipState = {
  totalRelationships: number;
  systemsCount: number;
  chaptersCount: number;
  hasRegenerativeBasis: boolean;
  summaryLabel: string;
  gapLabels: string[];
  relationships: MedicalConceptRelationship[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function key(value: unknown): string {
  return clean(value).toLowerCase();
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const normalized = item.toLowerCase();
    if (!item || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function conceptList(row: StudyResultCsvRow): string[] {
  return uniqueStrings(
    clean(row.conceptTags)
      .split(/[,;]/)
      .map((value) => value.trim())
      .filter(Boolean),
    8,
  );
}

function isMedicalArtifact(artifact: StudyReportArtifact): boolean {
  if (artifact.academicKind === MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND) return true;
  return /\b(cloze_text|vignette_stem|wrong_answer_rationale|reasoning_order|pathophys|pharm|contraindication|clinical presentation)\b/i.test(
    `${artifact.title}\n${artifact.markdown}`,
  );
}

function relationshipKind(row: StudyResultCsvRow): MedicalConceptRelationshipKind {
  const text = key([
    row.clozeText,
    row.plainQuestion,
    row.vignetteStem,
    row.answer,
    row.extra,
    row.wrongAnswerRationale,
    row.conceptTags,
    row.tags,
  ].filter(Boolean).join(" "));
  if (/\b(pharm|drug|medication|ace inhibitor|beta blocker|antibiotic)\b/.test(text) && /contraindicat|\bavoid\b|\badverse\b|\bside effect\b/.test(text)) {
    return "pharm_to_contraindication";
  }
  if (/\b(pathophys|pathophysiology|mechanism)\b/.test(text) && /\b(presentation|symptom|sign|presents)\b/.test(text)) {
    return "pathophys_to_presentation";
  }
  if (/\b(presentation|symptom|sign|presents)\b/.test(text) && /\b(investigation|test|diagnos|ecg|ct|mri|lab)\b/.test(text)) {
    return "presentation_to_investigation";
  }
  if (/\b(diagnos|differential)\b/.test(text) && /\b(management|treatment|therapy|next best step)\b/.test(text)) {
    return "diagnosis_to_management";
  }
  if (/\b(condition|disease|syndrome)\b/.test(text) && /\b(complication|sequela)\b/.test(text)) {
    return "condition_to_complication";
  }
  return "concept_link";
}

function readableRelationship(kind: MedicalConceptRelationshipKind): string {
  return kind.replace(/_/g, " -> ");
}

function rowConceptEndpoint(row: StudyResultCsvRow, concepts: readonly string[], fallback: string): string {
  return clean(concepts[0]) || clean(row.chapterTag) || clean(row.systemTag) || fallback;
}

function relationshipFromRow(
  artifact: StudyReportArtifact,
  row: StudyResultCsvRow,
  index: number,
): MedicalConceptRelationship | null {
  const concepts = conceptList(row);
  const fromConcept = rowConceptEndpoint(row, concepts, clean(artifact.chapterTag) || clean(artifact.title));
  const toConcept = clean(concepts[1])
    || clean(row.answer)
    || clean(row.plainQuestion)
    || clean(row.clozeText)
    || clean(row.vignetteStem);
  if (!fromConcept || !toConcept) return null;
  const relationship = relationshipKind(row);
  const courseTag = clean(row.courseTag) || clean(artifact.courseTag) || null;
  const systemTag = clean(row.systemTag) || null;
  const unitTag = clean(row.unitTag) || clean(artifact.unitTag) || null;
  const chapterTag = clean(row.chapterTag) || clean(artifact.chapterTag) || null;
  const sourceLocator = clean(row.sourceLocator) || clean(row.source) || artifact.sourceLabels[0] || null;
  const trustedReference = buildMedicalTrustedReferenceArtifactState(artifact);
  return {
    id: `${artifact.id}:${index}:${relationship}:${fromConcept}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-"),
    artifactId: artifact.id,
    relationship,
    fromConcept,
    toConcept,
    courseTag,
    systemTag,
    unitTag,
    chapterTag,
    sourceLocator,
    reasoningOrder: clean(row.reasoningOrder) || null,
    detailZoom: trustedReference.hasMedicalTrustedReferenceSignal ? trustedReference.detailZoom : null,
    trustedReferenceSupported: trustedReference.usesTrustedReferenceSupport,
    studentSourcePrimary: trustedReference.usesStudentSourcePrimaryRule,
    clinicalDatasetRestricted: trustedReference.restrictsClinicalDatasetUse,
    evidenceLabel: `${readableRelationship(relationship)}${chapterTag ? ` (${chapterTag})` : ""}`,
  };
}

export function buildMedicalConceptRelationshipState(input: {
  artifacts: readonly StudyReportArtifact[];
  courseTag?: string | null;
}): MedicalConceptRelationshipState {
  const courseTag = clean(input.courseTag);
  const relationships: MedicalConceptRelationship[] = [];
  const seen = new Set<string>();
  for (const artifact of input.artifacts) {
    if (courseTag && artifact.courseTag && artifact.courseTag !== courseTag) continue;
    if (!isMedicalArtifact(artifact)) continue;
    const rows = extractStudyCsvRowsFromMarkdown(artifact.markdown, {
      answersIncluded: artifact.answersIncluded,
      sourceLabels: artifact.sourceLabels,
      courseTag: artifact.courseTag,
      unitTag: artifact.unitTag,
      chapterTag: artifact.chapterTag,
    });
    rows.forEach((row, index) => {
      const relationship = relationshipFromRow(artifact, row, index);
      if (!relationship || seen.has(relationship.id)) return;
      seen.add(relationship.id);
      relationships.push(relationship);
    });
  }

  const systems = uniqueStrings(relationships.map((item) => item.systemTag));
  const chapters = uniqueStrings(relationships.map((item) => item.chapterTag));
  const hasRegenerativeBasis = relationships.length >= 6 && systems.length >= 1 && chapters.length >= 1;
  return {
    totalRelationships: relationships.length,
    systemsCount: systems.length,
    chaptersCount: chapters.length,
    hasRegenerativeBasis,
    summaryLabel: relationships.length === 0
      ? "No medical concept relationships extracted yet"
      : `${relationships.length} medical concept relationship${relationships.length === 1 ? "" : "s"} across ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`,
    gapLabels: [
      relationships.length === 0 ? "Needs structured medical cloze/vignette rows" : null,
      systems.length === 0 ? "Needs system tags for graph traversal" : null,
      chapters.length === 0 ? "Needs chapter tags for exam scoping" : null,
      relationships.length > 0 && relationships.length < 6 ? "Needs more edges before graph-regenerated sessions are reliable" : null,
    ].filter((value): value is string => Boolean(value)),
    relationships: relationships.slice(0, 24),
  };
}
