// @locs-version: 1.0
import { MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND } from "@/lib/medicalAnkiStudyState";
import type { MedicalMissedQuestionTopic } from "@/lib/medicalMissedQuestionLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalMissedTopicQueueItem = {
  topicId: string;
  topic: string;
  status: "needs_cards" | "covered_by_deck";
  priority: "high" | "medium" | "low";
  reason: string;
  scopeLabel: string;
  sourceLabel: string;
  createdAt: number;
};

export type MedicalMissedTopicQueueState = {
  totalCount: number;
  needsCardsCount: number;
  coveredCount: number;
  summaryLabel: string;
  nextActionLabel: string;
  items: MedicalMissedTopicQueueItem[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textKey(value: unknown): string {
  return clean(value).toLowerCase();
}

function includesText(haystack: string, needle: string | null | undefined): boolean {
  const normalized = textKey(needle);
  return Boolean(normalized) && haystack.includes(normalized);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function artifactText(artifact: StudyReportArtifact): string {
  return [
    artifact.title,
    artifact.filename,
    artifact.markdown,
    artifact.reportLabel,
    artifact.reportKind,
    artifact.academicKind,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    ...artifact.sourceLabels,
  ].map(textKey).filter(Boolean).join("\n");
}

function isMedicalRecallArtifact(artifact: StudyReportArtifact): boolean {
  if (artifact.academicKind === MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND) return true;
  if (artifact.reportKind !== "flashcard_deck" && artifact.reportKind !== "practice_questions") return false;
  const text = artifactText(artifact);
  return [
    "cloze",
    "vignette",
    "pathophys",
    "pharm",
    "clinical presentation",
    "contraindication",
    "management",
    "qbank",
  ].some((marker) => text.includes(marker));
}

function artifactCoversTopic(topic: MedicalMissedQuestionTopic, artifact: StudyReportArtifact): boolean {
  if (!isMedicalRecallArtifact(artifact)) return false;
  if (topic.courseTag && artifact.courseTag && topic.courseTag !== artifact.courseTag) return false;
  const text = artifactText(artifact);
  return includesText(text, topic.id)
    || includesText(text, topic.topic)
    || includesText(text, topic.chapterTag)
    || includesText(text, topic.unitTag)
    || includesText(text, topic.systemTag)
    || topic.conceptTags.some((concept) => includesText(text, concept));
}

function scopeLabelForTopic(topic: MedicalMissedQuestionTopic): string {
  return [topic.courseTag, topic.unitTag, topic.chapterTag, topic.systemTag]
    .map(clean)
    .filter(Boolean)
    .join(" / ");
}

function sourceLabelForTopic(topic: MedicalMissedQuestionTopic): string {
  const provider = topic.qbankProvider ? `qbank:${topic.qbankProvider}` : null;
  return [provider, topic.userQuestionId].filter(Boolean).join(" ") || topic.source;
}

function priorityForTopic(topic: MedicalMissedQuestionTopic, status: MedicalMissedTopicQueueItem["status"]): MedicalMissedTopicQueueItem["priority"] {
  if (status === "covered_by_deck") return "low";
  if (topic.qbankProvider || topic.chapterTag || topic.systemTag) return "high";
  return "medium";
}

function priorityRank(priority: MedicalMissedTopicQueueItem["priority"]): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function statusRank(status: MedicalMissedTopicQueueItem["status"]): number {
  return status === "needs_cards" ? 0 : 1;
}

export function buildMedicalMissedTopicQueueState(input: {
  topics: readonly MedicalMissedQuestionTopic[];
  artifacts: readonly StudyReportArtifact[];
  courseTag?: string | null;
}): MedicalMissedTopicQueueState {
  const courseTag = clean(input.courseTag);
  const artifacts = input.artifacts.filter(isMedicalRecallArtifact);
  const seen = new Set<string>();
  const items: MedicalMissedTopicQueueItem[] = [];

  for (const topic of input.topics) {
    if (courseTag && topic.courseTag && topic.courseTag !== courseTag) continue;
    if (seen.has(topic.id)) continue;
    seen.add(topic.id);
    const covered = artifacts.some((artifact) => artifactCoversTopic(topic, artifact));
    const status: MedicalMissedTopicQueueItem["status"] = covered ? "covered_by_deck" : "needs_cards";
    const priority = priorityForTopic(topic, status);
    items.push({
      topicId: topic.id,
      topic: topic.topic,
      status,
      priority,
      reason: covered
        ? "Existing medical cloze/vignette coverage found"
        : "No matching medical cloze/vignette coverage found",
      scopeLabel: scopeLabelForTopic(topic),
      sourceLabel: sourceLabelForTopic(topic),
      createdAt: topic.createdAt,
    });
  }

  items.sort((left, right) => {
    const statusDelta = statusRank(left.status) - statusRank(right.status);
    if (statusDelta !== 0) return statusDelta;
    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return right.createdAt - left.createdAt;
  });

  const needsCardsCount = items.filter((item) => item.status === "needs_cards").length;
  const coveredCount = items.length - needsCardsCount;
  return {
    totalCount: items.length,
    needsCardsCount,
    coveredCount,
    summaryLabel: items.length === 0
      ? "No missed medical topics captured"
      : `${pluralize(items.length, "missed topic")}, ${needsCardsCount} ${needsCardsCount === 1 ? "needs cards" : "need cards"}, ${coveredCount} already covered`,
    nextActionLabel: needsCardsCount > 0
      ? "Make cards from missed topics"
      : items.length > 0
        ? "Review covered missed topics"
        : "Capture missed topic",
    items: items.slice(0, 8),
  };
}
