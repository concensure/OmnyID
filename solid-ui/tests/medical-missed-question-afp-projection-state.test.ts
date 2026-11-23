import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentMedicalMissedQuestionAfpProjection,
  loadMedicalMissedQuestionAfpProjectionIds,
  markMedicalMissedQuestionAfpProjectionSent,
  MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY,
  medicalMissedQuestionTopicToAfpMessage,
  medicalMissedQuestionTopicToAfpSendInput,
  unmarkMedicalMissedQuestionAfpProjectionSent,
} from "../src/lib/medicalMissedQuestionAfpProjectionState.ts";
import { buildMedicalMissedQuestionTopic } from "../src/lib/medicalMissedQuestionLocalState.ts";

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

test("medical missed question AFP projection creates searchable knowledge cards", () => {
  const topic = buildMedicalMissedQuestionTopic({
    topic: "Beta blocker contraindications in acute decompensated heart failure",
    qbankProvider: "uworld",
    userQuestionId: "U-123",
    courseTag: "course:med101",
    systemTag: "cardio",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "management"],
    source: "study_lens",
    now: 10,
  })!;

  const message = medicalMissedQuestionTopicToAfpMessage(topic, "2026-09-10T00:00:00.000Z");

  assert.equal(message.id, `afp-medical-missed-topic:${topic.id}`);
  assert.equal(message.type, "knowledge_card");
  assert.equal(message.kind, "knowledge_card");
  assert.equal(message.subtype, "medical_missed_question_topic");
  assert.deepEqual(message.to, ["agent://study", "agent://knowledge-graph"]);
  assert.ok(message.supertags?.includes("medical_missed_question_topic"));
  assert.ok(message.supertags?.includes("medical_cloze_vignette"));
  assert.ok(message.supertags?.includes("qbank:uworld"));
  assert.ok(message.supertags?.includes("chapter:heart-failure"));
  assert.ok(message.supertags?.includes("concept:pharm"));
  assert.equal(message.metadata?.academic_course_tag, "course:med101");
  assert.equal(message.metadata?.academic_unit_tag, "unit:cardiology");
  assert.equal(message.metadata?.academic_chapter_tag, "chapter:heart-failure");
  assert.equal(message.metadata?.medical_system_tag, "cardio");
  assert.equal(message.metadata?.user_question_id, "U-123");
  assert.deepEqual(message.metadata?.searchable_terms, [
    "medical",
    "missed_question",
    "qbank_topic",
    "cloze",
    "vignette",
    "qbank:uworld",
    "course:med101",
    "system:cardio",
    "unit:cardiology",
    "chapter:heart-failure",
    "concept:pharm",
    "concept:management",
    "Beta blocker contraindications in acute decompensated heart failure",
  ]);
  assert.match(String(message.content.summary), /proprietary question text is not stored/i);
  assert.equal(message.references?.[0]?.metadata?.proprietary_text_stored, false);
  assert.equal(message.views[0]?.content && typeof message.views[0].content === "object" && "academic_scope" in message.views[0].content
    ? message.views[0].content.academic_scope
    : null, "course:med101 - system:cardio - unit:cardiology - chapter:heart-failure - concept:pharm - concept:management");

  const sendInput = medicalMissedQuestionTopicToAfpSendInput(topic, "2026-09-10T00:00:00.000Z");
  assert.equal(sendInput.type, "knowledge_card");
  assert.equal(sendInput.subtype, "medical_missed_question_topic");
  assert.equal(sendInput.store_in_relational, true);
});

test("medical missed question AFP sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalMissedQuestionAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY), null);

  markMedicalMissedQuestionAfpProjectionSent("topic-1", storage);
  markMedicalMissedQuestionAfpProjectionSent("topic-1", storage);

  assert.equal(hasSentMedicalMissedQuestionAfpProjection("topic-1", storage), true);
  assert.deepEqual(loadMedicalMissedQuestionAfpProjectionIds(storage), ["topic-1"]);

  unmarkMedicalMissedQuestionAfpProjectionSent("topic-1", storage);
  assert.equal(hasSentMedicalMissedQuestionAfpProjection("topic-1", storage), false);
  assert.equal(storage.getItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY), null);
});
