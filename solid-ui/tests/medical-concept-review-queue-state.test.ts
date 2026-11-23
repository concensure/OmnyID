import assert from "node:assert/strict";
import test from "node:test";

import type { MedicalConceptRelationship } from "../src/lib/medicalConceptRelationshipState.ts";
import {
  buildMedicalConceptReviewQueueState,
  buildMedicalConceptReviewReportIntent,
} from "../src/lib/medicalConceptReviewQueueState.ts";
import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function relationship(overrides: Partial<MedicalConceptRelationship> = {}): MedicalConceptRelationship {
  return {
    id: "edge:cardio:pharm-contraindication",
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

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    mode: "flashcards",
    title: "Deck attempt",
    artifactId: "deck-1",
    courseTag: "course:med101",
    totalItems: 10,
    correctItems: 5,
    durationSeconds: 600,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

function repairArtifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "repair-artifact",
    title: "Medical concept-edge repair set",
    filename: "medical-concept-edge-repair.md",
    markdown: [
      "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
      "medical_edge_attempt | relationship_id: edge:cardio:pharm-contraindication | total_items: 5 | correct_items: 2 | course_tag: course:med101",
      "score_band:weak",
    ].join("\n"),
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "practice_questions",
    reportLabel: "practice questions report",
    outputFormat: "chat_markdown",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    answersIncluded: true,
    structuredItemCount: 5,
    sectionCount: 2,
    createdAt: 10,
    ...overrides,
  };
}

test("buildMedicalConceptReviewQueueState prioritizes low-score and unattempted concept edges", () => {
  const state = buildMedicalConceptReviewQueueState({
    relationships: [
      relationship(),
      relationship({
        id: "edge:basic",
        artifactId: "deck-2",
        relationship: "concept_link",
        fromConcept: "definition",
        toConcept: "answer",
        reasoningOrder: "first_order",
      }),
    ],
    attempts: [attempt()],
  });

  assert.equal(state.totalCount, 2);
  assert.equal(state.highPriorityCount, 1);
  assert.equal(state.weakAttemptCount, 1);
  assert.equal(state.unattemptedHighYieldCount, 0);
  assert.match(state.repairSummaryLabel, /below 70%/);
  assert.equal(state.items[0]?.relationshipId, "edge:cardio:pharm-contraindication");
  assert.equal(state.items[0]?.priority, "high");
  assert.equal(state.items[0]?.scorePercent, 50);
  assert.equal(state.items[0]?.scoreLabel, "50% latest edge attempt");
  assert.match(state.items[0]?.reason ?? "", /50%/);
  assert.equal(state.nextActionLabel, "Regenerate edge questions");
});

test("buildMedicalConceptReviewQueueState uses exact edge attempts before artifact-level attempts", () => {
  const state = buildMedicalConceptReviewQueueState({
    relationships: [relationship()],
    attempts: [attempt({ correctItems: 4, totalItems: 10 })],
    edgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "edge:cardio:pharm-contraindication",
      courseTag: "course:med101",
      totalItems: 5,
      correctItems: 5,
      source: "focused_screen",
      createdAt: 5,
    }],
  });

  assert.equal(state.highPriorityCount, 0);
  assert.equal(state.items[0]?.priority, "medium");
  assert.equal(state.items[0]?.scorePercent, 100);
  assert.match(state.items[0]?.reason ?? "", /vary phrasing/i);
  assert.equal(state.nextActionLabel, "Review concept edges");
});

test("buildMedicalConceptReviewQueueState keeps low edge attempts high priority", () => {
  const state = buildMedicalConceptReviewQueueState({
    relationships: [relationship()],
    attempts: [],
    edgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "edge:cardio:pharm-contraindication",
      courseTag: "course:med101",
      totalItems: 5,
      correctItems: 2,
      source: "focused_screen",
      createdAt: 5,
    }],
  });

  assert.equal(state.highPriorityCount, 1);
  assert.equal(state.weakAttemptCount, 1);
  assert.equal(state.items[0]?.priority, "high");
  assert.match(state.items[0]?.reason ?? "", /40%/);
});

test("buildMedicalConceptReviewQueueState avoids duplicate regeneration after a repair artifact", () => {
  const state = buildMedicalConceptReviewQueueState({
    relationships: [relationship()],
    attempts: [],
    edgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "edge:cardio:pharm-contraindication",
      courseTag: "course:med101",
      totalItems: 5,
      correctItems: 2,
      source: "focused_screen",
      createdAt: 5,
    }],
    repairArtifacts: [repairArtifact({ createdAt: 10 })],
  });

  assert.equal(state.highPriorityCount, 0);
  assert.equal(state.weakAttemptCount, 1);
  assert.equal(state.repairOutputPendingAttemptCount, 1);
  assert.equal(state.items[0]?.priority, "medium");
  assert.equal(state.items[0]?.repairArtifactCount, 1);
  assert.equal(state.items[0]?.repairOutputPendingAttempt, true);
  assert.match(state.items[0]?.reason ?? "", /Repair output already exists/i);
  assert.match(state.repairSummaryLabel, /needs attempt evidence/i);
  assert.equal(state.nextActionLabel, "Record edge attempt");
});

test("buildMedicalConceptReviewQueueState still regenerates when repair artifact predates weak attempt", () => {
  const state = buildMedicalConceptReviewQueueState({
    relationships: [relationship()],
    attempts: [],
    edgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "edge:cardio:pharm-contraindication",
      courseTag: "course:med101",
      totalItems: 5,
      correctItems: 2,
      source: "focused_screen",
      createdAt: 20,
    }],
    repairArtifacts: [repairArtifact({ createdAt: 10 })],
  });

  assert.equal(state.highPriorityCount, 1);
  assert.equal(state.repairOutputPendingAttemptCount, 0);
  assert.equal(state.items[0]?.priority, "high");
  assert.match(state.items[0]?.reason ?? "", /40%/);
});

test("buildMedicalConceptReviewQueueState separates unattempted high-yield edges from weak attempts", () => {
  const state = buildMedicalConceptReviewQueueState({
    relationships: [relationship({ reasoningOrder: "third_order" })],
    attempts: [],
  });

  assert.equal(state.highPriorityCount, 1);
  assert.equal(state.weakAttemptCount, 0);
  assert.equal(state.unattemptedHighYieldCount, 1);
  assert.equal(state.items[0]?.scorePercent, null);
  assert.equal(state.items[0]?.scoreLabel, "No edge attempt yet");
  assert.match(state.repairSummaryLabel, /not attempted yet/);
});

test("buildMedicalConceptReviewReportIntent carries graph-edge scope into Reports", () => {
  const queue = buildMedicalConceptReviewQueueState({
    relationships: [relationship({ reasoningOrder: "third_order" })],
    attempts: [],
  });
  const intent = buildMedicalConceptReviewReportIntent({
    queue,
    courseTag: "course:med101",
  });

  assert.equal(intent?.preferredKind, "practice_questions");
  assert.equal(intent?.academicKind, "medical_cloze_vignette");
  assert.equal(intent?.courseTag, "course:med101");
  assert.equal(intent?.unitTag, "unit:cardiology");
  assert.equal(intent?.chapterTag, "chapter:heart-failure");
  assert.match(intent?.searchQuery ?? "", /medical concept-edge review/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /Regenerate freshly phrased cloze and vignette questions/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /Score state: No edge attempt yet/i);
  assert.ok(intent?.knowledgeGraphLinkTags.includes("medical_concept_edge_review"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("priority:high"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("relationship:pharm_to_contraindication"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("repair_status:needs_generation"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("score_band:unattempted"));
});

test("buildMedicalConceptReviewReportIntent carries trusted grounding into Reports", () => {
  const queue = buildMedicalConceptReviewQueueState({
    relationships: [relationship({
      reasoningOrder: "third_order",
      detailZoom: "clinical_reasoning",
      trustedReferenceSupported: true,
      studentSourcePrimary: true,
      clinicalDatasetRestricted: true,
    })],
    attempts: [],
  });
  const intent = buildMedicalConceptReviewReportIntent({
    queue,
    courseTag: "course:med101",
  });

  assert.ok(intent?.knowledgeGraphLinkTags.includes("medical_trusted_grounding"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("detail_zoom:clinical_reasoning"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("trusted_reference:supported"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("trusted_reference:student_source_primary"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("trusted_reference:clinical_dataset_restricted"));
  assert.match(intent?.zettelkastenNextAction ?? "", /detail zoom clinical reasoning/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /student-source-primary=yes/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /trusted-reference-supported=yes/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /clinical-dataset-restricted=yes/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /Do not invent external citations/i);
});

test("buildMedicalConceptReviewReportIntent asks for attempt capture after repair output exists", () => {
  const queue = buildMedicalConceptReviewQueueState({
    relationships: [relationship()],
    attempts: [],
    edgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "edge:cardio:pharm-contraindication",
      courseTag: "course:med101",
      totalItems: 5,
      correctItems: 2,
      source: "focused_screen",
      createdAt: 5,
    }],
    repairArtifacts: [repairArtifact({ createdAt: 10 })],
  });
  const intent = buildMedicalConceptReviewReportIntent({
    queue,
    courseTag: "course:med101",
  });

  assert.match(intent?.searchQuery ?? "", /medical concept-edge attempt evidence/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /Use the saved repair output/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /record a real attempt/i);
  assert.doesNotMatch(intent?.zettelkastenNextAction ?? "", /^Regenerate/i);
  assert.ok(intent?.knowledgeGraphLinkTags.includes("repair_status:pending_attempt"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("score_band:weak"));
});
