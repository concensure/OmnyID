// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { MedicalMissedQuestionTopic } from "@/lib/medicalMissedQuestionLocalState";

export const MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY = "omnyid.medical-missed-question-afp-projections";

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

function projectionId(topic: MedicalMissedQuestionTopic): string {
  return `afp-medical-missed-topic:${topic.id}`;
}

function threadId(topic: MedicalMissedQuestionTopic): string {
  return `medical_missed_topic:${topic.id}`;
}

function providerLabel(topic: MedicalMissedQuestionTopic): string | null {
  return topic.qbankProvider ? `qbank:${topic.qbankProvider}` : null;
}

function topicScope(topic: MedicalMissedQuestionTopic): string {
  return unique([
    topic.courseTag,
    topic.systemTag ? `system:${topic.systemTag}` : null,
    topic.unitTag,
    topic.chapterTag,
    ...topic.conceptTags.map((concept) => `concept:${concept}`),
  ]).join(" - ");
}

function supertagsForTopic(topic: MedicalMissedQuestionTopic): string[] {
  return unique([
    "medical_missed_question_topic",
    "medical_cloze_vignette",
    "study_attempt_gap",
    providerLabel(topic),
    topic.courseTag,
    topic.systemTag ? `system:${topic.systemTag}` : null,
    topic.unitTag,
    topic.chapterTag,
    ...topic.conceptTags.map((concept) => `concept:${concept}`),
  ]);
}

function metadataForTopic(topic: MedicalMissedQuestionTopic): Record<string, unknown> {
  const searchableTerms = unique([
    "medical",
    "missed_question",
    "qbank_topic",
    "cloze",
    "vignette",
    providerLabel(topic),
    topic.courseTag,
    topic.systemTag ? `system:${topic.systemTag}` : null,
    topic.unitTag,
    topic.chapterTag,
    ...topic.conceptTags.map((concept) => `concept:${concept}`),
    topic.topic,
  ]);
  return {
    origin: "study_lens",
    projection: "medical_missed_question_to_afp_knowledge_card",
    academic_kind: "medical_cloze_vignette",
    academic_course_tag: clean(topic.courseTag),
    academic_unit_tag: clean(topic.unitTag),
    academic_chapter_tag: clean(topic.chapterTag),
    medical_system_tag: clean(topic.systemTag),
    qbank_provider: topic.qbankProvider,
    user_question_id: clean(topic.userQuestionId),
    source: topic.source,
    searchable_terms: searchableTerms,
  };
}

export function medicalMissedQuestionTopicToAfpMessage(
  topic: MedicalMissedQuestionTopic,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const scope = topicScope(topic);
  const provider = providerLabel(topic);
  const metadata = metadataForTopic(topic);
  return {
    id: projectionId(topic),
    thread_id: threadId(topic),
    from: "system://study-lens",
    to: ["agent://study", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "knowledge_card",
    kind: "knowledge_card",
    subtype: "medical_missed_question_topic",
    supertags: supertagsForTopic(topic),
    content: {
      kind: "medical_missed_question_topic",
      title: topic.topic,
      summary: [
        "Safe missed-question topic captured for medical cloze/vignette generation.",
        scope ? `Scope: ${scope}.` : null,
        provider ? `Provider label: ${provider}.` : null,
        clean(topic.userQuestionId) ? "Optional user-supplied question ID retained; proprietary question text is not stored." : null,
      ].filter(Boolean).join(" "),
      topic: topic.topic,
      qbank_provider: topic.qbankProvider,
      user_question_id: clean(topic.userQuestionId),
      academic_course_tag: clean(topic.courseTag),
      academic_unit_tag: clean(topic.unitTag),
      academic_chapter_tag: clean(topic.chapterTag),
      medical_system_tag: clean(topic.systemTag),
      concept_tags: topic.conceptTags,
      safety_note: "Contains topic metadata only. Do not store or reproduce proprietary QBank question text or explanations.",
    },
    metadata,
    views: [
      {
        format: "study",
        content: {
          title: topic.topic,
          academic_kind: "medical_cloze_vignette",
          academic_scope: scope,
          provider_label: provider,
          next_action: "Generate source-grounded cloze and short clinical-vignette recall from this topic label.",
        },
      },
    ],
    attachments: [],
    references: [
      {
        type: "medical_missed_question_topic",
        target: topic.id,
        label: topic.topic,
        metadata: {
          qbank_provider: topic.qbankProvider,
          user_question_id: clean(topic.userQuestionId),
          proprietary_text_stored: false,
        },
      },
    ],
  };
}

export function medicalMissedQuestionTopicToAfpSendInput(
  topic: MedicalMissedQuestionTopic,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const message = medicalMissedQuestionTopicToAfpMessage(topic, nowIso);
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

export function loadMedicalMissedQuestionAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentMedicalMissedQuestionAfpProjection(topicId: string, storage: Storage = localStorage): boolean {
  return loadMedicalMissedQuestionAfpProjectionIds(storage).includes(topicId);
}

export function markMedicalMissedQuestionAfpProjectionSent(topicId: string, storage: Storage = localStorage): void {
  const cleanId = topicId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadMedicalMissedQuestionAfpProjectionIds(storage)])].slice(0, 200);
  storage.setItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkMedicalMissedQuestionAfpProjectionSent(topicId: string, storage: Storage = localStorage): void {
  const cleanId = topicId.trim();
  if (!cleanId) return;
  const next = loadMedicalMissedQuestionAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) storage.setItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(MEDICAL_MISSED_QUESTION_AFP_PROJECTIONS_KEY);
}
