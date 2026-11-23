import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalConceptEdgeAttempt,
  loadMedicalConceptEdgeAttempts,
  MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY,
  normalizeMedicalConceptEdgeAttempts,
  saveMedicalConceptEdgeAttempt,
} from "../src/lib/medicalConceptEdgeAttemptLocalState.ts";

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

test("buildMedicalConceptEdgeAttempt creates bounded per-edge score evidence", () => {
  const attempt = buildMedicalConceptEdgeAttempt({
    relationshipId: "edge:cardio:pharm",
    totalItems: 5,
    correctItems: 9,
    courseTag: "course:med101",
    source: "focused_screen",
    now: 10,
  });

  assert.equal(attempt?.relationshipId, "edge:cardio:pharm");
  assert.equal(attempt?.totalItems, 5);
  assert.equal(attempt?.correctItems, 5);
  assert.equal(attempt?.courseTag, "course:med101");
  assert.equal(attempt?.source, "focused_screen");
});

test("medical concept edge attempt storage clears malformed payloads and dedupes", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalConceptEdgeAttempts(storage), []);
  assert.equal(storage.getItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY), null);

  const attempt = buildMedicalConceptEdgeAttempt({
    relationshipId: "edge:1",
    totalItems: 4,
    correctItems: 2,
    now: 20,
  })!;
  saveMedicalConceptEdgeAttempt(attempt, storage);
  saveMedicalConceptEdgeAttempt(attempt, storage);

  assert.deepEqual(loadMedicalConceptEdgeAttempts(storage).map((item) => item.id), [attempt.id]);
});

test("normalizeMedicalConceptEdgeAttempts rejects incomplete records and sorts newest first", () => {
  const attempts = normalizeMedicalConceptEdgeAttempts([
    { relationshipId: "", totalItems: 3 },
    { relationshipId: "edge:old", totalItems: 2, correctItems: 1, createdAt: 1 },
    { relationshipId: "edge:new", totalItems: 2, correctItems: 2, createdAt: 3 },
  ]);

  assert.deepEqual(attempts.map((attempt) => attempt.relationshipId), ["edge:new", "edge:old"]);
});
