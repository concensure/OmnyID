import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalMissedQuestionReportIntent,
  buildMedicalMissedQuestionTopic,
  loadMedicalMissedQuestionTopics,
  MEDICAL_MISSED_QUESTION_TOPICS_KEY,
  normalizeMedicalMissedQuestionTopics,
  saveMedicalMissedQuestionTopic,
} from "../src/lib/medicalMissedQuestionLocalState.ts";

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

test("buildMedicalMissedQuestionTopic stores topic metadata without raw QBank text", () => {
  const topic = buildMedicalMissedQuestionTopic({
    topic: "ACE inhibitor contraindications in renal artery stenosis",
    qbankProvider: "uworld",
    userQuestionId: "U-12345",
    courseTag: "course:med101",
    systemTag: "renal",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "contraindication", "pharm"],
    source: "study_lens",
    now: 123,
  });

  assert.equal(topic?.id, "medical_missed:course:med101:u-12345:ace-inhibitor-contraindications-in-renal-artery-stenosis");
  assert.equal(topic?.qbankProvider, "uworld");
  assert.equal(topic?.userQuestionId, "U-12345");
  assert.deepEqual(topic?.conceptTags, ["pharm", "contraindication"]);
  assert.equal("rawQuestionText" in (topic as object), false);
  assert.equal("proprietaryExplanation" in (topic as object), false);
});

test("medical missed question topic storage clears malformed payloads and dedupes", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalMissedQuestionTopics(storage), []);
  assert.equal(storage.getItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY), null);

  const first = buildMedicalMissedQuestionTopic({
    topic: "Murmur timing",
    qbankProvider: "amboss",
    courseTag: "course:med101",
    now: 1,
  })!;
  const saved = saveMedicalMissedQuestionTopic(first, storage);
  saveMedicalMissedQuestionTopic({ ...saved, systemTag: "cardio", createdAt: 2 }, storage);

  const loaded = loadMedicalMissedQuestionTopics(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.systemTag, "cardio");
});

test("normalizeMedicalMissedQuestionTopics sorts and rejects incomplete records", () => {
  const topics = normalizeMedicalMissedQuestionTopics([
    { id: "bad", topic: "", createdAt: 3 },
    { id: "old", topic: "Old topic", createdAt: 1 },
    { id: "new", topic: "New topic", createdAt: 2 },
  ]);

  assert.deepEqual(topics.map((topic) => topic.id), ["new", "old"]);
});

test("buildMedicalMissedQuestionReportIntent is gated by medical student eligibility", () => {
  const topic = buildMedicalMissedQuestionTopic({
    topic: "Beta blocker contraindications in acute decompensated heart failure",
    qbankProvider: "uworld",
    courseTag: "course:med101",
    systemTag: "cardio",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "management"],
    now: 123,
  })!;

  assert.equal(buildMedicalMissedQuestionReportIntent({
    topics: [topic],
    eligibility: {
      eligible: false,
      source: "not_detected",
      evidenceLabel: "No medical student evidence detected",
      medicalStudyArtifactCount: 0,
    },
  }), null);

  const intent = buildMedicalMissedQuestionReportIntent({
    topics: [topic],
    eligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });

  assert.equal(intent?.preferredKind, "flashcard_deck");
  assert.equal(intent?.academicKind, "medical_cloze_vignette");
  assert.equal(intent?.courseTag, "course:med101");
  assert.equal(intent?.chapterTag, "chapter:heart-failure");
  assert.match(intent?.searchQuery ?? "", /medical missed topics/i);
  assert.match(intent?.zettelkastenNextAction ?? "", /do not reproduce proprietary QBank wording/i);
  assert.ok(intent?.knowledgeGraphLinkTags.includes("qbank:uworld"));
  assert.ok(intent?.knowledgeGraphLinkTags.includes("concept:pharm"));
});
