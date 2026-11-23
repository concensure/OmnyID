import assert from "node:assert/strict";
import test from "node:test";

import {
  medicalConceptEdgeAttemptLabel,
  medicalConceptEdgeAttemptLabels,
} from "../src/lib/medicalConceptEdgeAttemptPresentationState.ts";
import type { MedicalConceptEdgeAttempt } from "../src/lib/medicalConceptEdgeAttemptLocalState.ts";

function attempt(overrides: Partial<MedicalConceptEdgeAttempt> = {}): MedicalConceptEdgeAttempt {
  return {
    id: "attempt-1",
    relationshipId: "medical-deck:0:pathophys_to_presentation:pathophys",
    courseTag: "course:med101",
    totalItems: 5,
    correctItems: 2,
    source: "focused_screen",
    createdAt: 10,
    ...overrides,
  };
}

test("medicalConceptEdgeAttemptLabel formats compact score evidence", () => {
  assert.equal(
    medicalConceptEdgeAttemptLabel(attempt()),
    "Edge attempt (course:med101): pathophys -> presentation - 2/5 (40%), focused screen",
  );
});

test("medicalConceptEdgeAttemptLabels scopes by course and sorts newest first", () => {
  const labels = medicalConceptEdgeAttemptLabels({
    attempts: [
      attempt({ id: "old", createdAt: 1, correctItems: 4, source: "manual" }),
      attempt({ id: "new", createdAt: 20, correctItems: 5, source: "report_followup" }),
      attempt({ id: "other-course", courseTag: "course:law101", createdAt: 30 }),
    ],
    courseTag: "course:med101",
    limit: 2,
  });

  assert.deepEqual(labels, [
    "Edge attempt (course:med101): pathophys -> presentation - 5/5 (100%), report follow-up",
    "Edge attempt (course:med101): pathophys -> presentation - 4/5 (80%), manual",
  ]);
});
