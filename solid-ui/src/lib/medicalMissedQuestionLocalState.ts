// @locs-version: 1.0
import {
  MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
  type MedicalStudentEligibilityState,
} from "@/lib/medicalAnkiStudyState";
import { parseJsonValue } from "@/lib/jsonParseState";
import {
  buildReportIntentFromFocus,
  type ReportNavigationIntent,
} from "@/lib/reportNavigationState";

export const MEDICAL_MISSED_QUESTION_TOPICS_KEY = "omnyid.medical-missed-question-topics";
export const MEDICAL_MISSED_QUESTION_TOPIC_SAVED_EVENT = "omnyid:medical-missed-question-topic-saved";
const MAX_MEDICAL_MISSED_QUESTION_TOPICS = 120;

export type MedicalMissedQuestionTopic = {
  id: string;
  topic: string;
  qbankProvider: "uworld" | "amboss" | "nbme" | "other" | null;
  userQuestionId: string | null;
  courseTag: string | null;
  systemTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  conceptTags: string[];
  source: "manual" | "study_lens" | "focused_screen";
  createdAt: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized ? normalized : null;
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const item = clean(entry);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 8) break;
  }
  return result;
}

function normalizeProvider(value: unknown): MedicalMissedQuestionTopic["qbankProvider"] {
  const normalized = clean(value).toLowerCase();
  if (normalized === "uworld" || normalized === "amboss" || normalized === "nbme" || normalized === "other") return normalized;
  return null;
}

function normalizeSource(value: unknown): MedicalMissedQuestionTopic["source"] {
  return value === "study_lens" || value === "focused_screen" ? value : "manual";
}

function stableMissedTopicId(topic: string, courseTag: string | null, userQuestionId: string | null): string {
  const base = [courseTag, userQuestionId, topic]
    .map((value) => clean(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join(":");
  return `medical_missed:${base || "topic"}`;
}

export function normalizeMedicalMissedQuestionTopic(value: unknown): MedicalMissedQuestionTopic | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const topic = clean(record.topic);
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  if (!topic) return null;

  const courseTag = cleanNullable(record.courseTag);
  const userQuestionId = cleanNullable(record.userQuestionId);
  return {
    id: clean(record.id) || stableMissedTopicId(topic, courseTag, userQuestionId),
    topic,
    qbankProvider: normalizeProvider(record.qbankProvider),
    userQuestionId,
    courseTag,
    systemTag: cleanNullable(record.systemTag),
    unitTag: cleanNullable(record.unitTag),
    chapterTag: cleanNullable(record.chapterTag),
    conceptTags: cleanStringList(record.conceptTags),
    source: normalizeSource(record.source),
    createdAt,
  };
}

export function normalizeMedicalMissedQuestionTopics(value: unknown): MedicalMissedQuestionTopic[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const topics: MedicalMissedQuestionTopic[] = [];
  for (const entry of value) {
    const topic = normalizeMedicalMissedQuestionTopic(entry);
    if (!topic || seen.has(topic.id)) continue;
    seen.add(topic.id);
    topics.push(topic);
  }
  return topics
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_MEDICAL_MISSED_QUESTION_TOPICS);
}

export function loadMedicalMissedQuestionTopics(storage: Storage = localStorage): MedicalMissedQuestionTopic[] {
  const raw = storage.getItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY);
    return [];
  }
  const topics = normalizeMedicalMissedQuestionTopics(parsed.value);
  if (topics.length === 0) storage.removeItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY);
  else storage.setItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY, JSON.stringify(topics));
  return topics;
}

export function saveMedicalMissedQuestionTopic(
  topic: MedicalMissedQuestionTopic,
  storage: Storage = localStorage,
): MedicalMissedQuestionTopic {
  const normalized = normalizeMedicalMissedQuestionTopic(topic) ?? topic;
  const existing = loadMedicalMissedQuestionTopics(storage).filter((item) => item.id !== normalized.id);
  const next = normalizeMedicalMissedQuestionTopics([normalized, ...existing]);
  storage.setItem(MEDICAL_MISSED_QUESTION_TOPICS_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? normalized;
}

export function buildMedicalMissedQuestionTopic(input: {
  topic: string;
  qbankProvider?: MedicalMissedQuestionTopic["qbankProvider"] | null;
  userQuestionId?: string | null;
  courseTag?: string | null;
  systemTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  conceptTags?: readonly string[] | null;
  source?: MedicalMissedQuestionTopic["source"] | null;
  now?: number;
}): MedicalMissedQuestionTopic | null {
  const createdAt = input.now ?? Date.now();
  return normalizeMedicalMissedQuestionTopic({
    ...input,
    createdAt,
    id: stableMissedTopicId(input.topic, input.courseTag ?? null, input.userQuestionId ?? null),
  });
}

export function buildMedicalMissedQuestionReportIntent(input: {
  topics: readonly MedicalMissedQuestionTopic[];
  eligibility: MedicalStudentEligibilityState;
}): ReportNavigationIntent | null {
  if (!input.eligibility.eligible) return null;
  const topics = normalizeMedicalMissedQuestionTopics(input.topics).slice(0, 8);
  if (topics.length === 0) return null;
  const primary = topics[0]!;
  const topicLabels = topics.map((topic) => topic.topic).join("; ");
  const providerLabels = topics
    .map((topic) => topic.qbankProvider ? `qbank:${topic.qbankProvider}` : null)
    .filter((value): value is string => Boolean(value));
  return buildReportIntentFromFocus({
    source: "study_lens",
    preferredKind: "flashcard_deck",
    searchQuery: `medical missed topics: ${topicLabels}`,
    activeTag: `missed_topic:${primary.topic}`,
    courseTag: primary.courseTag,
    academicKind: MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
    unitTag: primary.unitTag,
    chapterTag: primary.chapterTag,
    knowledgeGraphLinkTags: [
      "medical_missed_question_topics",
      ...providerLabels,
      ...topics.flatMap((topic) => [
        topic.systemTag ? `system:${topic.systemTag}` : null,
        ...topic.conceptTags.map((concept) => `concept:${concept}`),
      ]).filter((value): value is string => Boolean(value)),
    ],
    zettelkastenNextAction: "Generate source-grounded cloze and vignette recall from missed-topic labels only; do not reproduce proprietary QBank wording or explanations.",
  });
}

export function emitMedicalMissedQuestionTopicSaved(topic: MedicalMissedQuestionTopic): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MEDICAL_MISSED_QUESTION_TOPIC_SAVED_EVENT, { detail: topic }));
}
