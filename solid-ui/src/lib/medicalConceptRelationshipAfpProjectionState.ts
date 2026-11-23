// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { MedicalConceptRelationship } from "@/lib/medicalConceptRelationshipState";
import { medicalDetailZoomLabel } from "@/lib/medicalTrustedReferenceState";

export const MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY = "omnyid.medical-concept-relationship-afp-projections";

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

function projectionId(relationship: MedicalConceptRelationship): string {
  return `afp-medical-concept-edge:${relationship.id}`;
}

function threadId(relationship: MedicalConceptRelationship): string {
  return `medical_concept_edge:${relationship.id}`;
}

function relationshipLabel(relationship: MedicalConceptRelationship): string {
  return relationship.relationship.replace(/_/g, " -> ");
}

function scopeLabel(relationship: MedicalConceptRelationship): string {
  return unique([
    relationship.courseTag,
    relationship.systemTag ? `system:${relationship.systemTag}` : null,
    relationship.unitTag,
    relationship.chapterTag,
    relationship.sourceLocator ? `source:${relationship.sourceLocator}` : null,
  ]).join(" - ");
}

function supertagsForRelationship(relationship: MedicalConceptRelationship): string[] {
  return unique([
    "medical_concept_relationship",
    "medical_concept_edge_review",
    "medical_cloze_vignette",
    relationship.courseTag,
    relationship.systemTag ? `system:${relationship.systemTag}` : null,
    relationship.unitTag,
    relationship.chapterTag,
    `relationship:${relationship.relationship}`,
    `concept:${relationship.fromConcept}`,
    `concept:${relationship.toConcept}`,
    relationship.reasoningOrder ? `reasoning:${relationship.reasoningOrder}` : null,
    relationship.detailZoom ? "medical_trusted_grounding" : null,
    relationship.detailZoom ? `detail_zoom:${relationship.detailZoom}` : null,
    relationship.trustedReferenceSupported ? "trusted_reference:supported" : null,
    relationship.studentSourcePrimary ? "trusted_reference:student_source_primary" : null,
    relationship.clinicalDatasetRestricted ? "trusted_reference:clinical_dataset_restricted" : null,
  ]);
}

function metadataForRelationship(relationship: MedicalConceptRelationship): Record<string, unknown> {
  const graphLinkTags = unique([
    "medical_concept_edge_review",
    `relationship:${relationship.relationship}`,
    `concept:${relationship.fromConcept}`,
    `concept:${relationship.toConcept}`,
    relationship.systemTag ? `system:${relationship.systemTag}` : null,
    relationship.unitTag,
    relationship.chapterTag,
    relationship.detailZoom ? "medical_trusted_grounding" : null,
    relationship.detailZoom ? `detail_zoom:${relationship.detailZoom}` : null,
    relationship.trustedReferenceSupported ? "trusted_reference:supported" : null,
    relationship.studentSourcePrimary ? "trusted_reference:student_source_primary" : null,
    relationship.clinicalDatasetRestricted ? "trusted_reference:clinical_dataset_restricted" : null,
  ]);
  return {
    origin: "study_report_artifact",
    projection: "medical_concept_relationship_to_afp_knowledge_card",
    knowledge_mode: "connected_notes",
    knowledge_graph_seed: true,
    knowledge_graph_group_key: relationship.id,
    knowledge_graph_link_tags: graphLinkTags,
    academic_kind: "medical_cloze_vignette",
    academic_course_tag: clean(relationship.courseTag),
    academic_unit_tag: clean(relationship.unitTag),
    academic_chapter_tag: clean(relationship.chapterTag),
    medical_system_tag: clean(relationship.systemTag),
    medical_relationship_kind: relationship.relationship,
    medical_concept_from: relationship.fromConcept,
    medical_concept_to: relationship.toConcept,
    source_locator: clean(relationship.sourceLocator),
    reasoning_order: clean(relationship.reasoningOrder),
    medical_detail_zoom: clean(relationship.detailZoom),
    medical_detail_zoom_label: relationship.detailZoom ? medicalDetailZoomLabel(relationship.detailZoom) : null,
    medical_trusted_grounding: Boolean(relationship.detailZoom),
    medical_trusted_reference_supported: relationship.trustedReferenceSupported,
    medical_student_source_primary: relationship.studentSourcePrimary,
    medical_clinical_dataset_restricted: relationship.clinicalDatasetRestricted,
    source_artifact_id: relationship.artifactId,
    searchable_terms: unique([
      "medical",
      "concept_edge",
      "cloze",
      "vignette",
      relationship.relationship,
      relationship.courseTag,
      relationship.systemTag ? `system:${relationship.systemTag}` : null,
      relationship.unitTag,
      relationship.chapterTag,
      relationship.fromConcept,
      relationship.toConcept,
      relationship.sourceLocator,
      relationship.detailZoom ? "medical trusted grounding" : null,
      relationship.detailZoom ? `detail_zoom:${relationship.detailZoom}` : null,
      relationship.trustedReferenceSupported ? "trusted reference supported" : null,
      relationship.studentSourcePrimary ? "student source primary" : null,
      relationship.clinicalDatasetRestricted ? "clinical dataset restricted" : null,
    ]),
  };
}

export function medicalConceptRelationshipToAfpMessage(
  relationship: MedicalConceptRelationship,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const scope = scopeLabel(relationship);
  const label = `${relationship.fromConcept} -> ${relationship.toConcept}`;
  return {
    id: projectionId(relationship),
    thread_id: threadId(relationship),
    from: "system://study-lens",
    to: ["agent://study", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "knowledge_card",
    kind: "knowledge_card",
    subtype: "medical_concept_relationship",
    supertags: supertagsForRelationship(relationship),
    content: {
      kind: "medical_concept_relationship",
      title: label,
      summary: [
        `Medical concept relationship extracted from a saved cloze/vignette artifact: ${relationshipLabel(relationship)}.`,
        scope ? `Scope: ${scope}.` : null,
        relationship.sourceLocator ? `Source locator: ${relationship.sourceLocator}.` : null,
        relationship.detailZoom
          ? `Trusted grounding: ${medicalDetailZoomLabel(relationship.detailZoom)} detail zoom; student source primary=${relationship.studentSourcePrimary ? "yes" : "no"}; trusted reference supported=${relationship.trustedReferenceSupported ? "yes" : "no"}.`
          : null,
        "Use this as a graph-backed recall edge for freshly phrased questions, not as a static card-only object.",
      ].filter(Boolean).join(" "),
      relationship_kind: relationship.relationship,
      from_concept: relationship.fromConcept,
      to_concept: relationship.toConcept,
      academic_course_tag: clean(relationship.courseTag),
      academic_unit_tag: clean(relationship.unitTag),
      academic_chapter_tag: clean(relationship.chapterTag),
      medical_system_tag: clean(relationship.systemTag),
      source_locator: clean(relationship.sourceLocator),
      reasoning_order: clean(relationship.reasoningOrder),
      medical_detail_zoom: clean(relationship.detailZoom),
      medical_trusted_grounding: Boolean(relationship.detailZoom),
      medical_trusted_reference_supported: relationship.trustedReferenceSupported,
      medical_student_source_primary: relationship.studentSourcePrimary,
      medical_clinical_dataset_restricted: relationship.clinicalDatasetRestricted,
      source_artifact_id: relationship.artifactId,
    },
    metadata: metadataForRelationship(relationship),
    views: [
      {
        format: "study",
        content: {
          title: label,
          academic_kind: "medical_cloze_vignette",
          relationship_kind: relationship.relationship,
          medical_detail_zoom: relationship.detailZoom ? medicalDetailZoomLabel(relationship.detailZoom) : null,
          medical_trusted_grounding: Boolean(relationship.detailZoom),
          academic_scope: scope,
          next_action: "Regenerate a freshly phrased cloze or vignette question from this concept edge.",
        },
      },
    ],
    attachments: [],
    references: [
      {
        type: "medical_concept_relationship",
        target: relationship.id,
        label,
        metadata: {
          source_artifact_id: relationship.artifactId,
          source_locator: clean(relationship.sourceLocator),
          medical_detail_zoom: clean(relationship.detailZoom),
          medical_trusted_grounding: Boolean(relationship.detailZoom),
        },
      },
    ],
  };
}

export function medicalConceptRelationshipToAfpSendInput(
  relationship: MedicalConceptRelationship,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const message = medicalConceptRelationshipToAfpMessage(relationship, nowIso);
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

export function loadMedicalConceptRelationshipAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentMedicalConceptRelationshipAfpProjection(relationshipId: string, storage: Storage = localStorage): boolean {
  return loadMedicalConceptRelationshipAfpProjectionIds(storage).includes(relationshipId);
}

export function markMedicalConceptRelationshipAfpProjectionSent(relationshipId: string, storage: Storage = localStorage): void {
  const cleanId = relationshipId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadMedicalConceptRelationshipAfpProjectionIds(storage)])].slice(0, 400);
  storage.setItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkMedicalConceptRelationshipAfpProjectionSent(relationshipId: string, storage: Storage = localStorage): void {
  const cleanId = relationshipId.trim();
  if (!cleanId) return;
  const next = loadMedicalConceptRelationshipAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) storage.setItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY);
}
