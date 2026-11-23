// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { MedicalConceptEdgeAttempt } from "@/lib/medicalConceptEdgeAttemptLocalState";

export const MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY =
  "omnyid.medical-concept-edge-attempt-afp-projections";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function projectionId(attempt: MedicalConceptEdgeAttempt): string {
  return `afp-medical-concept-edge-attempt:${attempt.id}`;
}

function threadId(attempt: MedicalConceptEdgeAttempt): string {
  return `medical_concept_edge_attempt:${attempt.relationshipId}`;
}

function scorePercent(attempt: MedicalConceptEdgeAttempt): number {
  return Math.round((attempt.correctItems / attempt.totalItems) * 100);
}

function scoreBand(attempt: MedicalConceptEdgeAttempt): "weak" | "solid" {
  return scorePercent(attempt) < 70 ? "weak" : "solid";
}

function supertagsForAttempt(attempt: MedicalConceptEdgeAttempt): string[] {
  return unique([
    "medical_concept_edge_attempt",
    "medical_concept_edge_review",
    "medical_cloze_vignette",
    attempt.courseTag,
    `relationship:${attempt.relationshipId}`,
    `score_band:${scoreBand(attempt)}`,
    `attempt_source:${attempt.source}`,
  ]);
}

function metadataForAttempt(attempt: MedicalConceptEdgeAttempt): Record<string, unknown> {
  const band = scoreBand(attempt);
  return {
    origin: "study_lens",
    projection: "medical_concept_edge_attempt_to_afp_knowledge_card",
    academic_kind: "medical_cloze_vignette",
    academic_course_tag: clean(attempt.courseTag),
    medical_relationship_id: attempt.relationshipId,
    attempt_score_percent: scorePercent(attempt),
    attempt_total_items: attempt.totalItems,
    attempt_correct_items: attempt.correctItems,
    attempt_source: attempt.source,
    attempt_score_band: band,
    searchable_terms: unique([
      "medical",
      "concept_edge_attempt",
      "concept_edge_review",
      "cloze",
      "vignette",
      attempt.relationshipId,
      attempt.courseTag,
      `score_band:${band}`,
      `attempt_source:${attempt.source}`,
    ]),
  };
}

export function medicalConceptEdgeAttemptToAfpMessage(
  attempt: MedicalConceptEdgeAttempt,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const score = scorePercent(attempt);
  const band = scoreBand(attempt);
  const title = `Medical edge attempt: ${attempt.relationshipId}`;
  return {
    id: projectionId(attempt),
    thread_id: threadId(attempt),
    from: "system://study-lens",
    to: ["agent://study", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "knowledge_card",
    kind: "knowledge_card",
    subtype: "medical_concept_edge_attempt_evidence",
    supertags: supertagsForAttempt(attempt),
    content: {
      kind: "medical_concept_edge_attempt_evidence",
      title,
      summary: [
        `Student answered ${attempt.correctItems}/${attempt.totalItems} regenerated concept-edge items (${score}%).`,
        "This is attempt evidence for search and graph routing, not stored question text.",
      ].join(" "),
      relationship_id: attempt.relationshipId,
      academic_course_tag: clean(attempt.courseTag),
      total_items: attempt.totalItems,
      correct_items: attempt.correctItems,
      score_percent: score,
      score_band: band,
      source: attempt.source,
      safety_note: "No proprietary or generated question text is stored in this projection.",
    },
    metadata: metadataForAttempt(attempt),
    views: [
      {
        format: "study",
        content: {
          title,
          academic_kind: "medical_cloze_vignette",
          relationship_id: attempt.relationshipId,
          score_label: `${attempt.correctItems}/${attempt.totalItems} (${score}%)`,
          next_action: band === "weak"
            ? "Regenerate and repair this concept edge with a fresh cloze or vignette."
            : "Keep this concept edge in spaced review with fresh phrasing.",
        },
      },
    ],
    attachments: [],
    references: [
      {
        type: "medical_concept_edge_attempt",
        target: attempt.id,
        label: title,
        metadata: {
          relationship_id: attempt.relationshipId,
          score_percent: score,
        },
      },
    ],
  };
}

export function medicalConceptEdgeAttemptToAfpSendInput(
  attempt: MedicalConceptEdgeAttempt,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const message = medicalConceptEdgeAttemptToAfpMessage(attempt, nowIso);
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? ["agent://study", "agent://knowledge-graph"],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function loadMedicalConceptEdgeAttemptAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentMedicalConceptEdgeAttemptAfpProjection(attemptId: string, storage: Storage = localStorage): boolean {
  return loadMedicalConceptEdgeAttemptAfpProjectionIds(storage).includes(attemptId);
}

export function markMedicalConceptEdgeAttemptAfpProjectionSent(attemptId: string, storage: Storage = localStorage): void {
  const cleanId = attemptId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadMedicalConceptEdgeAttemptAfpProjectionIds(storage)])].slice(0, 400);
  storage.setItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkMedicalConceptEdgeAttemptAfpProjectionSent(attemptId: string, storage: Storage = localStorage): void {
  const cleanId = attemptId.trim();
  if (!cleanId) return;
  const next = loadMedicalConceptEdgeAttemptAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) storage.setItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY);
}
