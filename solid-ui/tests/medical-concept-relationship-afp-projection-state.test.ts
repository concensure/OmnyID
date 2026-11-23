import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentMedicalConceptRelationshipAfpProjection,
  loadMedicalConceptRelationshipAfpProjectionIds,
  markMedicalConceptRelationshipAfpProjectionSent,
  MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY,
  medicalConceptRelationshipToAfpMessage,
  medicalConceptRelationshipToAfpSendInput,
  unmarkMedicalConceptRelationshipAfpProjectionSent,
} from "../src/lib/medicalConceptRelationshipAfpProjectionState.ts";
import type { MedicalConceptRelationship } from "../src/lib/medicalConceptRelationshipState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

function relationship(overrides: Partial<MedicalConceptRelationship> = {}): MedicalConceptRelationship {
  return {
    id: "deck-1:0:pharm_to_contraindication:pharm",
    artifactId: "deck-1",
    relationship: "pharm_to_contraindication",
    fromConcept: "pharm",
    toConcept: "contraindication",
    courseTag: "course:med101",
    systemTag: "cardio",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    sourceLocator: "slide 24",
    reasoningOrder: "second_order",
    detailZoom: null,
    trustedReferenceSupported: false,
    studentSourcePrimary: false,
    clinicalDatasetRestricted: false,
    evidenceLabel: "pharm -> contraindication",
    ...overrides,
  };
}

test("medical concept relationship AFP projection creates searchable graph cards", () => {
  const edge = relationship();
  const message = medicalConceptRelationshipToAfpMessage(edge, "2026-09-11T00:00:00.000Z");

  assert.equal(message.id, `afp-medical-concept-edge:${edge.id}`);
  assert.equal(message.type, "knowledge_card");
  assert.equal(message.kind, "knowledge_card");
  assert.equal(message.subtype, "medical_concept_relationship");
  assert.deepEqual(message.to, ["agent://study", "agent://knowledge-graph"]);
  assert.ok(message.supertags?.includes("medical_concept_relationship"));
  assert.ok(message.supertags?.includes("medical_concept_edge_review"));
  assert.ok(message.supertags?.includes("relationship:pharm_to_contraindication"));
  assert.ok(message.supertags?.includes("course:med101"));
  assert.ok(message.supertags?.includes("concept:pharm"));
  assert.ok(message.supertags?.includes("concept:contraindication"));
  assert.equal(message.metadata?.academic_course_tag, "course:med101");
  assert.equal(message.metadata?.academic_unit_tag, "unit:cardiology");
  assert.equal(message.metadata?.academic_chapter_tag, "chapter:heart-failure");
  assert.equal(message.metadata?.medical_system_tag, "cardio");
  assert.equal(message.metadata?.medical_relationship_kind, "pharm_to_contraindication");
  assert.equal(message.metadata?.knowledge_mode, "connected_notes");
  assert.equal(message.metadata?.knowledge_graph_seed, true);
  assert.equal(message.metadata?.knowledge_graph_group_key, edge.id);
  assert.ok(Array.isArray(message.metadata?.knowledge_graph_link_tags));
  assert.ok((message.metadata?.knowledge_graph_link_tags as string[]).includes("medical_concept_edge_review"));
  assert.ok((message.metadata?.knowledge_graph_link_tags as string[]).includes("relationship:pharm_to_contraindication"));
  assert.equal(message.metadata?.source_locator, "slide 24");
  assert.deepEqual(message.metadata?.searchable_terms, [
    "medical",
    "concept_edge",
    "cloze",
    "vignette",
    "pharm_to_contraindication",
    "course:med101",
    "system:cardio",
    "unit:cardiology",
    "chapter:heart-failure",
    "pharm",
    "contraindication",
    "slide 24",
  ]);
  assert.match(String(message.content.summary), /freshly phrased questions/i);
  assert.equal(message.references?.[0]?.metadata?.source_artifact_id, "deck-1");

  const sendInput = medicalConceptRelationshipToAfpSendInput(edge, "2026-09-11T00:00:00.000Z");
  assert.equal(sendInput.type, "knowledge_card");
  assert.equal(sendInput.subtype, "medical_concept_relationship");
  assert.equal(sendInput.store_in_relational, true);
});

test("medical concept relationship AFP projection preserves trusted grounding", () => {
  const edge = relationship({
    detailZoom: "clinical_reasoning",
    trustedReferenceSupported: true,
    studentSourcePrimary: true,
    clinicalDatasetRestricted: true,
  });
  const message = medicalConceptRelationshipToAfpMessage(edge, "2026-09-11T00:00:00.000Z");

  assert.ok(message.supertags?.includes("medical_trusted_grounding"));
  assert.ok(message.supertags?.includes("detail_zoom:clinical_reasoning"));
  assert.ok(message.supertags?.includes("trusted_reference:supported"));
  assert.ok(message.supertags?.includes("trusted_reference:student_source_primary"));
  assert.ok(message.supertags?.includes("trusted_reference:clinical_dataset_restricted"));
  assert.equal(message.metadata?.medical_detail_zoom, "clinical_reasoning");
  assert.equal(message.metadata?.medical_detail_zoom_label, "clinical reasoning");
  assert.equal(message.metadata?.medical_trusted_grounding, true);
  assert.equal(message.metadata?.medical_trusted_reference_supported, true);
  assert.equal(message.metadata?.medical_student_source_primary, true);
  assert.equal(message.metadata?.medical_clinical_dataset_restricted, true);
  assert.ok((message.metadata?.knowledge_graph_link_tags as string[]).includes("detail_zoom:clinical_reasoning"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("student source primary"));
  assert.match(String(message.content.summary), /Trusted grounding: clinical reasoning detail zoom/i);
  assert.equal(message.content.medical_detail_zoom, "clinical_reasoning");
  assert.equal(message.views?.[0]?.content.medical_detail_zoom, "clinical reasoning");
  assert.equal(message.references?.[0]?.metadata?.medical_trusted_grounding, true);
});

test("medical concept relationship AFP sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalConceptRelationshipAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY), null);

  markMedicalConceptRelationshipAfpProjectionSent("edge-1", storage);
  markMedicalConceptRelationshipAfpProjectionSent("edge-1", storage);

  assert.equal(hasSentMedicalConceptRelationshipAfpProjection("edge-1", storage), true);
  assert.deepEqual(loadMedicalConceptRelationshipAfpProjectionIds(storage), ["edge-1"]);

  unmarkMedicalConceptRelationshipAfpProjectionSent("edge-1", storage);
  assert.equal(hasSentMedicalConceptRelationshipAfpProjection("edge-1", storage), false);
  assert.equal(storage.getItem(MEDICAL_CONCEPT_RELATIONSHIP_AFP_PROJECTIONS_KEY), null);
});
