import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentMedicalConceptEdgeAttemptAfpProjection,
  loadMedicalConceptEdgeAttemptAfpProjectionIds,
  markMedicalConceptEdgeAttemptAfpProjectionSent,
  MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY,
  medicalConceptEdgeAttemptToAfpMessage,
  medicalConceptEdgeAttemptToAfpSendInput,
  unmarkMedicalConceptEdgeAttemptAfpProjectionSent,
} from "../src/lib/medicalConceptEdgeAttemptAfpProjectionState.ts";
import type { MedicalConceptEdgeAttempt } from "../src/lib/medicalConceptEdgeAttemptLocalState.ts";

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

function attempt(overrides: Partial<MedicalConceptEdgeAttempt> = {}): MedicalConceptEdgeAttempt {
  return {
    id: "medical-edge-attempt:deck-1:0:pharm:100",
    relationshipId: "deck-1:0:pharm_to_contraindication:pharm",
    courseTag: "course:med101",
    totalItems: 5,
    correctItems: 3,
    source: "report_followup",
    createdAt: 100,
    ...overrides,
  };
}

test("medical concept edge attempt AFP projection creates searchable score evidence without question text", () => {
  const evidence = attempt();
  const message = medicalConceptEdgeAttemptToAfpMessage(evidence, "2026-09-11T00:00:00.000Z");

  assert.equal(message.id, `afp-medical-concept-edge-attempt:${evidence.id}`);
  assert.equal(message.thread_id, `medical_concept_edge_attempt:${evidence.relationshipId}`);
  assert.equal(message.type, "knowledge_card");
  assert.equal(message.kind, "knowledge_card");
  assert.equal(message.subtype, "medical_concept_edge_attempt_evidence");
  assert.deepEqual(message.to, ["agent://study", "agent://knowledge-graph"]);
  assert.ok(message.supertags?.includes("medical_concept_edge_attempt"));
  assert.ok(message.supertags?.includes("medical_concept_edge_review"));
  assert.ok(message.supertags?.includes("relationship:deck-1:0:pharm_to_contraindication:pharm"));
  assert.ok(message.supertags?.includes("course:med101"));
  assert.ok(message.supertags?.includes("score_band:weak"));
  assert.ok(message.supertags?.includes("attempt_source:report_followup"));
  assert.equal(message.metadata?.academic_kind, "medical_cloze_vignette");
  assert.equal(message.metadata?.academic_course_tag, "course:med101");
  assert.equal(message.metadata?.medical_relationship_id, evidence.relationshipId);
  assert.equal(message.metadata?.attempt_score_percent, 60);
  assert.equal(message.metadata?.attempt_total_items, 5);
  assert.equal(message.metadata?.attempt_correct_items, 3);
  assert.equal(message.metadata?.attempt_score_band, "weak");
  assert.deepEqual(message.metadata?.searchable_terms, [
    "medical",
    "concept_edge_attempt",
    "concept_edge_review",
    "cloze",
    "vignette",
    "deck-1:0:pharm_to_contraindication:pharm",
    "course:med101",
    "score_band:weak",
    "attempt_source:report_followup",
  ]);
  assert.match(String(message.content.summary), /attempt evidence/i);
  assert.match(String(message.content.safety_note), /No proprietary or generated question text/i);
  assert.doesNotMatch(JSON.stringify(message), /qbank stem/i);
  assert.equal(message.references?.[0]?.target, evidence.id);

  const sendInput = medicalConceptEdgeAttemptToAfpSendInput(evidence, "2026-09-11T00:00:00.000Z");
  assert.equal(sendInput.type, "knowledge_card");
  assert.equal(sendInput.subtype, "medical_concept_edge_attempt_evidence");
  assert.equal(sendInput.store_in_relational, true);
});

test("medical concept edge attempt projection distinguishes solid attempts", () => {
  const message = medicalConceptEdgeAttemptToAfpMessage(attempt({ correctItems: 4 }), "2026-09-11T00:00:00.000Z");

  assert.ok(message.supertags?.includes("score_band:solid"));
  assert.equal(message.metadata?.attempt_score_percent, 80);
  assert.match(JSON.stringify(message.views), /spaced review/i);
});

test("medical concept edge attempt AFP sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalConceptEdgeAttemptAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY), null);

  markMedicalConceptEdgeAttemptAfpProjectionSent("attempt-1", storage);
  markMedicalConceptEdgeAttemptAfpProjectionSent("attempt-1", storage);

  assert.equal(hasSentMedicalConceptEdgeAttemptAfpProjection("attempt-1", storage), true);
  assert.deepEqual(loadMedicalConceptEdgeAttemptAfpProjectionIds(storage), ["attempt-1"]);

  unmarkMedicalConceptEdgeAttemptAfpProjectionSent("attempt-1", storage);
  assert.equal(hasSentMedicalConceptEdgeAttemptAfpProjection("attempt-1", storage), false);
  assert.equal(storage.getItem(MEDICAL_CONCEPT_EDGE_ATTEMPT_AFP_PROJECTIONS_KEY), null);
});
