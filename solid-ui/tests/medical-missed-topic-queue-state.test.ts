import assert from "node:assert/strict";
import test from "node:test";

import type { MedicalMissedQuestionTopic } from "../src/lib/medicalMissedQuestionLocalState.ts";
import { buildMedicalMissedTopicQueueState } from "../src/lib/medicalMissedTopicQueueState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function topic(overrides: Partial<MedicalMissedQuestionTopic> = {}): MedicalMissedQuestionTopic {
  return {
    id: "medical_missed:course:med101:u-1:ace-inhibitor-contraindications",
    topic: "ACE inhibitor contraindications",
    qbankProvider: "uworld",
    userQuestionId: "U-1",
    courseTag: "course:med101",
    systemTag: "cardio",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "contraindication"],
    source: "study_lens",
    createdAt: 10,
    ...overrides,
  };
}

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Heart failure cloze deck",
    filename: "heart-failure-cloze.md",
    markdown: "Cloze: ACE inhibitor contraindications in heart failure. chapter:heart-failure",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: "Flashcards",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Cardiology lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 20,
    ...overrides,
  };
}

test("buildMedicalMissedTopicQueueState prioritizes uncovered missed topics", () => {
  const state = buildMedicalMissedTopicQueueState({
    topics: [
      topic({ id: "covered", topic: "ACE inhibitor contraindications" }),
      topic({
        id: "uncovered",
        topic: "Beta blocker masking hypoglycemia",
        systemTag: "endocrine",
        unitTag: "unit:endocrine",
        chapterTag: "chapter:endocrine-pharm",
        conceptTags: ["beta blocker", "hypoglycemia"],
        createdAt: 30,
      }),
    ],
    artifacts: [artifact()],
    courseTag: "course:med101",
  });

  assert.equal(state.totalCount, 2);
  assert.equal(state.needsCardsCount, 1);
  assert.equal(state.coveredCount, 1);
  assert.equal(state.nextActionLabel, "Make cards from missed topics");
  assert.equal(state.items[0]?.topicId, "uncovered");
  assert.equal(state.items[0]?.status, "needs_cards");
  assert.equal(state.items[0]?.priority, "high");
  assert.equal(state.items[1]?.status, "covered_by_deck");
  assert.match(state.summaryLabel, /2 missed topics/);
});

test("buildMedicalMissedTopicQueueState respects active course scope", () => {
  const state = buildMedicalMissedTopicQueueState({
    topics: [
      topic({ id: "matching", courseTag: "course:med101" }),
      topic({ id: "global", courseTag: null }),
      topic({ id: "other", courseTag: "course:law101" }),
    ],
    artifacts: [],
    courseTag: "course:med101",
  });

  assert.deepEqual(state.items.map((item) => item.topicId).sort(), ["global", "matching"]);
});

test("buildMedicalMissedTopicQueueState returns a capture prompt for empty queues", () => {
  const state = buildMedicalMissedTopicQueueState({
    topics: [],
    artifacts: [],
  });

  assert.equal(state.summaryLabel, "No missed medical topics captured");
  assert.equal(state.nextActionLabel, "Capture missed topic");
});
