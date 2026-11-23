// @locs-version: 1.0
import { MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND } from "@/lib/medicalAnkiStudyState";
import { buildMedicalConceptRepairArtifactState } from "@/lib/medicalConceptRepairArtifactState";
import type { MedicalConceptEdgeAttempt } from "@/lib/medicalConceptEdgeAttemptLocalState";
import type { MedicalConceptRelationship } from "@/lib/medicalConceptRelationshipState";
import { medicalDetailZoomLabel } from "@/lib/medicalTrustedReferenceState";
import { buildReportIntentFromFocus, type ReportNavigationIntent } from "@/lib/reportNavigationState";
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalConceptReviewQueueItem = {
  relationshipId: string;
  label: string;
  priority: "high" | "medium" | "low";
  reason: string;
  scorePercent: number | null;
  scoreLabel: string;
  repairArtifactCount: number;
  latestRepairArtifactAt: number | null;
  repairOutputPendingAttempt: boolean;
  reportKind: "practice_questions" | "flashcard_deck";
  relationshipKind: MedicalConceptRelationship["relationship"];
  systemTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  sourceLocator: string | null;
  detailZoom: MedicalConceptRelationship["detailZoom"];
  trustedReferenceSupported: boolean;
  studentSourcePrimary: boolean;
  clinicalDatasetRestricted: boolean;
};

export type MedicalConceptReviewQueueState = {
  totalCount: number;
  highPriorityCount: number;
  weakAttemptCount: number;
  unattemptedHighYieldCount: number;
  repairOutputPendingAttemptCount: number;
  summaryLabel: string;
  repairSummaryLabel: string;
  nextActionLabel: string;
  items: MedicalConceptReviewQueueItem[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function attemptScore(attempt: { totalItems: number; correctItems: number } | undefined): number | null {
  if (!attempt || attempt.totalItems <= 0) return null;
  return attempt.correctItems / attempt.totalItems;
}

function priorityForRelationship(
  relationship: MedicalConceptRelationship,
  score: number | null,
  hasRepairOutputPendingAttempt: boolean,
): MedicalConceptReviewQueueItem["priority"] {
  if (hasRepairOutputPendingAttempt) return "medium";
  if (score !== null && score < 0.7) return "high";
  if (!score && (relationship.reasoningOrder === "third_order" || relationship.relationship !== "concept_link")) return "high";
  if (relationship.reasoningOrder === "third_order" || relationship.relationship !== "concept_link") return "medium";
  return "low";
}

function priorityRank(priority: MedicalConceptReviewQueueItem["priority"]): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function reasonForRelationship(
  priority: MedicalConceptReviewQueueItem["priority"],
  score: number | null,
  hasRepairOutputPendingAttempt: boolean,
): string {
  if (hasRepairOutputPendingAttempt) return "Repair output already exists for this edge; record an attempt before regenerating more.";
  if (score !== null && score < 0.7) return `Latest edge attempt score is ${Math.round(score * 100)}%; regenerate and repair this relationship.`;
  if (score === null && priority === "high") return "No attempt evidence yet for this high-yield relationship.";
  if (priority === "medium") return "Useful application edge; vary phrasing before the student memorizes one card.";
  return "Covered relationship; keep available as a lower-priority review edge.";
}

function labelForRelationship(relationship: MedicalConceptRelationship): string {
  return `${relationship.fromConcept} -> ${relationship.toConcept}`;
}

function scorePercent(score: number | null): number | null {
  return score === null ? null : Math.round(score * 100);
}

function scoreLabel(score: number | null): string {
  const percent = scorePercent(score);
  return percent === null ? "No edge attempt yet" : `${percent}% latest edge attempt`;
}

function latestAttemptAt(
  artifactAttempt: StudyAttempt | undefined,
  edgeAttempt: MedicalConceptEdgeAttempt | undefined,
): number {
  return Math.max(artifactAttempt?.createdAt ?? 0, edgeAttempt?.createdAt ?? 0);
}

function repairArtifactDatesByRelationship(
  artifacts: readonly StudyReportArtifact[],
): Map<string, number[]> {
  const byRelationship = new Map<string, number[]>();
  for (const artifact of artifacts) {
    const repair = buildMedicalConceptRepairArtifactState(artifact);
    if (repair.repairKind !== "concept_edge_repair") continue;
    for (const relationshipId of repair.relationshipIds) {
      const existing = byRelationship.get(relationshipId) ?? [];
      byRelationship.set(relationshipId, [...existing, artifact.createdAt].sort((left, right) => right - left));
    }
  }
  return byRelationship;
}

export function buildMedicalConceptReviewQueueState(input: {
  relationships: readonly MedicalConceptRelationship[];
  attempts: readonly StudyAttempt[];
  edgeAttempts?: readonly MedicalConceptEdgeAttempt[] | null;
  repairArtifacts?: readonly StudyReportArtifact[] | null;
}): MedicalConceptReviewQueueState {
  const attemptsByArtifact = new Map(input.attempts.map((attempt) => [attempt.artifactId, attempt]));
  const attemptsByRelationship = new Map(
    [...(input.edgeAttempts ?? [])]
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((attempt) => [attempt.relationshipId, attempt]),
  );
  const repairDatesByRelationship = repairArtifactDatesByRelationship(input.repairArtifacts ?? []);
  const items = input.relationships.map((relationship): MedicalConceptReviewQueueItem => {
    const artifactAttempt = attemptsByArtifact.get(relationship.artifactId);
    const edgeAttempt = attemptsByRelationship.get(relationship.id);
    const score = attemptScore(edgeAttempt) ?? attemptScore(artifactAttempt);
    const repairDates = repairDatesByRelationship.get(relationship.id) ?? [];
    const latestRepairAt = repairDates[0] ?? null;
    const hasRepairOutputPendingAttempt = latestRepairAt !== null && latestRepairAt > latestAttemptAt(artifactAttempt, edgeAttempt);
    const priority = priorityForRelationship(relationship, score, hasRepairOutputPendingAttempt);
    return {
      relationshipId: relationship.id,
      label: labelForRelationship(relationship),
      priority,
      reason: reasonForRelationship(priority, score, hasRepairOutputPendingAttempt),
      scorePercent: scorePercent(score),
      scoreLabel: scoreLabel(score),
      repairArtifactCount: repairDates.length,
      latestRepairArtifactAt: latestRepairAt,
      repairOutputPendingAttempt: hasRepairOutputPendingAttempt,
      reportKind: relationship.reasoningOrder === "third_order" ? "practice_questions" : "flashcard_deck",
      relationshipKind: relationship.relationship,
      systemTag: relationship.systemTag,
      unitTag: relationship.unitTag,
      chapterTag: relationship.chapterTag,
      sourceLocator: relationship.sourceLocator,
      detailZoom: relationship.detailZoom,
      trustedReferenceSupported: relationship.trustedReferenceSupported,
      studentSourcePrimary: relationship.studentSourcePrimary,
      clinicalDatasetRestricted: relationship.clinicalDatasetRestricted,
    };
  }).sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));

  const highPriorityCount = items.filter((item) => item.priority === "high").length;
  const weakAttemptCount = items.filter((item) => item.scorePercent !== null && item.scorePercent < 70).length;
  const unattemptedHighYieldCount = items.filter((item) => item.scorePercent === null && item.priority === "high").length;
  const repairOutputPendingAttemptCount = items.filter((item) =>
    item.repairArtifactCount > 0 && item.priority === "medium" && /record an attempt/i.test(item.reason)
  ).length;
  return {
    totalCount: items.length,
    highPriorityCount,
    weakAttemptCount,
    unattemptedHighYieldCount,
    repairOutputPendingAttemptCount,
    summaryLabel: items.length === 0
      ? "No concept-edge review queue yet"
      : `${items.length} concept-edge review target${items.length === 1 ? "" : "s"}, ${highPriorityCount} high priority`,
    repairSummaryLabel: weakAttemptCount > 0
      ? repairOutputPendingAttemptCount > 0
        ? `${repairOutputPendingAttemptCount} repaired concept edge${repairOutputPendingAttemptCount === 1 ? "" : "s"} need${repairOutputPendingAttemptCount === 1 ? "s" : ""} attempt evidence`
        : `${weakAttemptCount} attempted concept edge${weakAttemptCount === 1 ? "" : "s"} below 70%`
      : unattemptedHighYieldCount > 0
        ? `${unattemptedHighYieldCount} high-yield concept edge${unattemptedHighYieldCount === 1 ? "" : "s"} not attempted yet`
        : items.length > 0
          ? "Concept edges ready for varied phrasing review"
          : "No concept-edge repair targets yet",
    nextActionLabel: highPriorityCount > 0
      ? "Regenerate edge questions"
      : repairOutputPendingAttemptCount > 0
        ? "Record edge attempt"
        : "Review concept edges",
    items: items.slice(0, 8),
  };
}

export function buildMedicalConceptReviewReportIntent(input: {
  queue: MedicalConceptReviewQueueState;
  courseTag?: string | null;
}): ReportNavigationIntent | null {
  const primary = input.queue.items[0];
  if (!primary) return null;
  const courseTag = clean(input.courseTag) || null;
  const searchPrefix = primary.repairOutputPendingAttempt
    ? "medical concept-edge attempt evidence"
    : "medical concept-edge review";
  const nextAction = primary.repairOutputPendingAttempt
    ? `Use the saved repair output for the concept edge "${primary.label}" and record a real attempt before generating more variants. Score state: ${primary.scoreLabel}. ${primary.reason} Ask the student to answer the existing repaired items or enter their result, then emit medical_edge_attempt rows only after the student answers.`
    : `Regenerate freshly phrased cloze and vignette questions for the concept edge "${primary.label}". Score state: ${primary.scoreLabel}. ${primary.reason} Emit medical_edge_attempt rows only after the student answers.`;
  const groundingInstruction = primary.detailZoom
    ? ` Preserve medical trusted-grounding context: detail zoom ${medicalDetailZoomLabel(primary.detailZoom)}; student-source-primary=${primary.studentSourcePrimary ? "yes" : "no"}; trusted-reference-supported=${primary.trustedReferenceSupported ? "yes" : "no"}; clinical-dataset-restricted=${primary.clinicalDatasetRestricted ? "yes" : "no"}. Do not invent external citations or treat LLM internal knowledge as source evidence.`
    : "";
  return buildReportIntentFromFocus({
    source: "study_lens",
    preferredKind: primary.reportKind,
    searchQuery: `${searchPrefix}: ${primary.label}`,
    activeTag: `medical_edge:${primary.relationshipId}`,
    courseTag,
    unitTag: primary.unitTag,
    chapterTag: primary.chapterTag,
    academicKind: MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
    knowledgeGraphGroupKey: primary.relationshipId,
    knowledgeGraphLinkTags: [
      "medical_concept_edge_review",
      ...(primary.detailZoom ? ["medical_trusted_grounding", `detail_zoom:${primary.detailZoom}`] : []),
      ...(primary.trustedReferenceSupported ? ["trusted_reference:supported"] : []),
      ...(primary.studentSourcePrimary ? ["trusted_reference:student_source_primary"] : []),
      ...(primary.clinicalDatasetRestricted ? ["trusted_reference:clinical_dataset_restricted"] : []),
      `priority:${primary.priority}`,
      `relationship:${primary.relationshipKind}`,
      primary.repairOutputPendingAttempt ? "repair_status:pending_attempt" : "repair_status:needs_generation",
      primary.scorePercent === null ? "score_band:unattempted" : primary.scorePercent < 70 ? "score_band:weak" : "score_band:solid",
      ...(primary.systemTag ? [`system:${primary.systemTag}`] : []),
      ...(primary.sourceLocator ? [`source_locator:${primary.sourceLocator}`] : []),
    ],
    zettelkastenNextAction: `${nextAction}${groundingInstruction}`,
  });
}
