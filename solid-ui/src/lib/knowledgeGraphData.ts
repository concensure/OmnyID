// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { afpRecord, afpStringList } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type {
  InsightMsg,
  KnowledgeCard,
  KnowledgeGraphBacklinkRef,
  KnowledgeGraphConnectionStrength,
  MergeSuggestion,
} from "@/lib/knowledgeGraphTypes";

function dedupeTags(tags: string[]): string[] {
  return [...new Set(tags.filter((tag) => typeof tag === "string" && tag.trim().length > 0))];
}

function knowledgeMessageContent(message: AfpMessage): Record<string, unknown> {
  return afpRecord(decryptedDisplayContent(message));
}

function normalizeKnowledgeGraphTagKey(tag: string): string {
  const normalized = tag.replace(/^#/, "").trim().toLowerCase();
  if (!normalized) return "";
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex < 0) return normalized.replace(/[\s_]+/g, "-");
  const prefix = normalized.slice(0, separatorIndex).trim();
  const rawValue = normalized.slice(separatorIndex + 1).trim();
  const slugValue = rawValue
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!prefix) return slugValue;
  return slugValue ? `${prefix}:${slugValue}` : prefix;
}

function compactKnowledgeGraphTagKey(tag: string): string {
  const normalized = normalizeKnowledgeGraphTagKey(tag);
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex < 0) return normalized.replace(/[^a-z0-9]/g, "");
  const prefix = normalized.slice(0, separatorIndex);
  const rawValue = normalized.slice(separatorIndex + 1);
  const compactValue = rawValue.replace(/[^a-z0-9]/g, "");
  return compactValue ? `${prefix}:${compactValue}` : prefix;
}

function normalizeKnowledgeMode(value: unknown): KnowledgeCard["knowledgeMode"] | null {
  return value === "zettelkasten" || value === "connected_notes" || value === "standard"
    ? value
    : null;
}

type KnowledgeCardTagUpdate = {
  sourceId: string;
  timestamp: string;
  removeSupertags: string[];
  addSupertags: string[];
};

type CardCandidate = {
  message: AfpMessage;
  content: Record<string, unknown>;
  supertags: string[];
};

const CONTEXTUAL_TAG_PREFIXES = [
  "project:",
  "area:",
  "resource:",
  "topic:",
  "concept:",
  "theme:",
  "method:",
  "person:",
  "course:",
  "subject:",
  "class:",
  "academic:",
] as const;

const LOW_SIGNAL_SHARED_CONTEXT_TAGS = new Set([
  "resource:study-material",
  "resource:connected_notes",
  "resource:standard",
]);

export function knowledgeCardHasReviewPending(tags: readonly string[]): boolean {
  return tags.includes("zk:review_pending");
}

export function knowledgeCardHasSourceNote(tags: readonly string[]): boolean {
  return tags.includes("zk:source_note");
}

export function knowledgeCardHasPermanentNote(tags: readonly string[]): boolean {
  return tags.includes("zk:permanent_note");
}

function collectKnowledgeCardTagUpdates(messages: AfpMessage[]): KnowledgeCardTagUpdate[] {
  return messages
    .filter((message) => message.type === "tag_update")
    .map((message) => {
      const content = knowledgeMessageContent(message);
      const reference = afpRecord((message.references ?? [])[0]);
      return {
        sourceId: typeof reference.id === "string" ? reference.id : "",
        timestamp: message.timestamp,
        removeSupertags: afpStringList(content.remove_supertags),
        addSupertags: afpStringList(content.add_supertags),
      };
    })
    .filter((update) => update.sourceId.length > 0)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function applyKnowledgeCardTagUpdates(
  sourceId: string,
  baseTags: string[],
  updates: readonly KnowledgeCardTagUpdate[],
): string[] {
  let nextTags = [...baseTags];
  for (const update of updates) {
    if (update.sourceId !== sourceId) continue;
    nextTags = nextTags.filter((tag) => !update.removeSupertags.includes(tag));
    for (const tag of update.addSupertags) {
      if (!nextTags.includes(tag)) nextTags.push(tag);
    }
  }
  return dedupeTags(nextTags);
}

function inferMessageKnowledgeTags(message: AfpMessage): string[] {
  const metadata = afpRecord(message.metadata);
  const content = knowledgeMessageContent(message);
  const explicitMode = normalizeKnowledgeMode(metadata.knowledge_mode) ?? normalizeKnowledgeMode(content.knowledge_mode);
  const tags = dedupeTags([
    ...afpStringList(message.supertags),
    ...afpStringList(content.supertags),
    ...afpStringList(metadata.supertags),
  ]);
  if (explicitMode && !tags.includes(`knowledge_mode:${explicitMode}`)) {
    tags.push(`knowledge_mode:${explicitMode}`);
  }
  return dedupeTags(tags);
}

function isConnectedNotesSourceMessage(message: AfpMessage, tags: readonly string[]): boolean {
  const metadata = afpRecord(message.metadata);
  if (metadata.knowledge_pipeline === "connected_notes_ingest") return true;
  if (normalizeKnowledgeMode(metadata.knowledge_mode)) return true;
  return tags.some((tag) =>
    tag === "knowledge_mode:connected_notes"
    || tag === "knowledge:connected_notes"
    || tag === "knowledge_mode:zettelkasten"
    || tag === "resource:zettelkasten"
    || tag.startsWith("zk:")
  );
}

function isKnowledgeCardCandidate(message: AfpMessage, tags: readonly string[]): boolean {
  if (message.type === "knowledge_card") return true;
  if (message.type === "parsed_document" || message.type === "transcript") {
    return isConnectedNotesSourceMessage(message, tags);
  }
  return false;
}

function extractSourceMessageId(message: AfpMessage, content: Record<string, unknown>): string | null {
  const metadata = afpRecord(message.metadata);
  const contentSource = typeof content.source_message_id === "string" ? content.source_message_id : null;
  const metadataSource = typeof metadata.source_message_id === "string" ? metadata.source_message_id : null;
  return contentSource || metadataSource;
}

function metadataString(message: AfpMessage, key: string): string | null {
  const value = afpRecord(message.metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataBoolean(message: AfpMessage, key: string): boolean {
  return afpRecord(message.metadata)[key] === true;
}

function metadataStringList(message: AfpMessage, key: string): string[] {
  return afpStringList(afpRecord(message.metadata)[key]);
}

function contentString(content: Record<string, unknown>, key: string): string | null {
  const value = content[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractReferenceTargetIds(message: AfpMessage): string[] {
  return (message.references ?? [])
    .flatMap((reference) => {
      const record = afpRecord(reference);
      const direct = typeof record.target === "string" ? record.target : null;
      const legacy = typeof record.id === "string" ? record.id : null;
      return [direct ?? legacy].filter((value): value is string => Boolean(value && value.trim()));
    });
}

function excerptText(value: string, maxLength: number = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}â€¦`;
}

function deriveKnowledgeCardTitle(message: AfpMessage, content: Record<string, unknown>): string {
  if (typeof content.title === "string" && content.title.trim()) return content.title.trim();
  const metadata = afpRecord(message.metadata);
  if (typeof metadata.source_file_name === "string" && metadata.source_file_name.trim()) {
    return metadata.source_file_name.trim();
  }
  if (message.type === "transcript") return `Transcript ${message.id.slice(0, 8)}`;
  if (message.type === "parsed_document") return `Document ${message.id.slice(0, 8)}`;
  return message.id.slice(0, 12);
}

function deriveKnowledgeCardSummary(message: AfpMessage, content: Record<string, unknown>): string {
  if (typeof content.summary === "string" && content.summary.trim()) return content.summary.trim();
  const metadata = afpRecord(message.metadata);
  if (typeof metadata.summary === "string" && metadata.summary.trim()) return metadata.summary.trim();
  const textCandidates = [
    typeof content.content_text === "string" ? content.content_text : "",
    typeof content.text === "string" ? content.text : "",
    typeof content.body === "string" ? content.body : "",
  ].filter(Boolean);
  if (textCandidates.length > 0) return excerptText(textCandidates[0]!);
  return "";
}

function deriveKnowledgeCardSourceTitle(message: AfpMessage, content: Record<string, unknown>): string | null {
  return contentString(content, "source_title")
    || metadataString(message, "source_title")
    || metadataString(message, "source_file_name");
}

function deriveKnowledgeCardSourceFileName(message: AfpMessage): string | null {
  return metadataString(message, "source_file_name");
}

function deriveKnowledgeCardAcademicSummary(message: AfpMessage): string | null {
  return metadataString(message, "academic_summary");
}

function deriveKnowledgeCardAcademicKind(message: AfpMessage): string | null {
  return metadataString(message, "academic_kind");
}

function deriveKnowledgeCardAcademicCourseTag(message: AfpMessage): string | null {
  return metadataString(message, "academic_course_tag");
}

function deriveKnowledgeCardAcademicWeekTag(message: AfpMessage): string | null {
  return metadataString(message, "academic_week_tag");
}

function deriveKnowledgeCardAcademicLectureTag(message: AfpMessage): string | null {
  return metadataString(message, "academic_lecture_tag");
}

function deriveKnowledgeCardAcademicChapterTag(message: AfpMessage): string | null {
  return metadataString(message, "academic_chapter_tag");
}

function deriveKnowledgeCardAcademicUnitTag(message: AfpMessage): string | null {
  return metadataString(message, "academic_unit_tag");
}

function deriveKnowledgeCardRetentionMode(message: AfpMessage): string | null {
  return metadataString(message, "attachment_retention_mode");
}

function deriveKnowledgeCardRetentionLabel(message: AfpMessage): string | null {
  return metadataString(message, "attachment_retention_label");
}

function deriveKnowledgeCardZettelkastenStage(message: AfpMessage): string | null {
  return metadataString(message, "zettelkasten_stage");
}

function deriveKnowledgeCardZettelkastenEntryType(message: AfpMessage): string | null {
  return metadataString(message, "zettelkasten_entry_type");
}

function deriveKnowledgeCardZettelkastenNextAction(message: AfpMessage): string | null {
  return metadataString(message, "zettelkasten_next_action");
}

function deriveKnowledgeCardGraphGroupKey(message: AfpMessage): string | null {
  return metadataString(message, "knowledge_graph_group_key");
}

function deriveKnowledgeCardPolicyOutcome(message: AfpMessage): string | null {
  return metadataString(message, "attachment_policy_outcome");
}

function deriveKnowledgeCardStorageSummary(message: AfpMessage): string | null {
  const retentionMode = deriveKnowledgeCardRetentionMode(message);
  if (retentionMode === "keep_file") return "Original file retained in the account library";
  if (retentionMode === "keep_extracted_only") return "Only extracted notes retained for future retrieval";
  if (retentionMode === "keep_nothing") return "Session-only source, no retained file or extracted content";
  if (message.type === "parsed_document" || message.type === "transcript") return "Derived from study material in the knowledge pipeline";
  return null;
}

function deriveKnowledgeCardProvenanceSummary(
  message: AfpMessage,
  content: Record<string, unknown>,
  knowledgeMode: KnowledgeCard["knowledgeMode"],
): string | null {
  const sourceTitle = deriveKnowledgeCardSourceTitle(message, content);
  const policyOutcome = deriveKnowledgeCardPolicyOutcome(message);
  const academicSummary = deriveKnowledgeCardAcademicSummary(message);
  const modeLabel = knowledgeMode === "zettelkasten"
    ? "organized as Zettelkasten"
    : knowledgeMode === "connected_notes"
      ? "linked into connected notes"
      : "stored as a standard note";
  if (sourceTitle && academicSummary && policyOutcome) {
    return `${sourceTitle} was ingested and ${modeLabel}. ${academicSummary} ${policyOutcome}`;
  }
  if (sourceTitle && academicSummary) return `${sourceTitle} was ingested and ${modeLabel}. ${academicSummary}`;
  if (sourceTitle && policyOutcome) return `${sourceTitle} was ingested and ${modeLabel}. ${policyOutcome}`;
  if (sourceTitle) return `${sourceTitle} was ingested and ${modeLabel}.`;
  if ((message.type === "parsed_document" || message.type === "transcript") && academicSummary && policyOutcome) {
    return `Uploaded study material was ingested and ${modeLabel}. ${academicSummary} ${policyOutcome}`;
  }
  if ((message.type === "parsed_document" || message.type === "transcript") && academicSummary) {
    return `Uploaded study material was ingested and ${modeLabel}. ${academicSummary}`;
  }
  if ((message.type === "parsed_document" || message.type === "transcript") && policyOutcome) {
    return `Uploaded study material was ingested and ${modeLabel}. ${policyOutcome}`;
  }
  if (message.type === "parsed_document" || message.type === "transcript") {
    return `Uploaded study material was ingested and ${modeLabel}.`;
  }
  if (message.type === "knowledge_card" && contentString(content, "source_message_id")) {
    return `This note was distilled from earlier source material and ${modeLabel}.`;
  }
  return null;
}

function buildCandidate(message: AfpMessage, tagUpdates: readonly KnowledgeCardTagUpdate[]): CardCandidate | null {
  const content = knowledgeMessageContent(message);
  const supertags = applyKnowledgeCardTagUpdates(
    message.id,
    inferMessageKnowledgeTags(message),
    tagUpdates,
  );
  if (!isKnowledgeCardCandidate(message, supertags)) return null;
  return { message, content, supertags };
}

export function inferKnowledgeCardMode(message: AfpMessage, tags: readonly string[]): KnowledgeCard["knowledgeMode"] {
  const metadataMode = normalizeKnowledgeMode(afpRecord(message.metadata).knowledge_mode);
  if (metadataMode) return metadataMode;
  if (tags.includes("knowledge_mode:zettelkasten") || tags.includes("resource:zettelkasten") || tags.some((tag) => tag.startsWith("zk:"))) {
    return "zettelkasten";
  }
  if (tags.includes("knowledge_mode:connected_notes") || tags.includes("knowledge:connected_notes") || tags.includes("resource:connected_notes")) {
    return "connected_notes";
  }
  return "standard";
}

export function extractKnowledgeCards(messages: AfpMessage[]): KnowledgeCard[] {
  const tagUpdates = collectKnowledgeCardTagUpdates(messages);
  const cards = messages
    .map((message) => buildCandidate(message, tagUpdates))
    .filter((candidate): candidate is CardCandidate => Boolean(candidate))
    .map(({ message, content, supertags }) => {
      const knowledgeMode = inferKnowledgeCardMode(message, supertags);
      const knowledgeGraphLinkTags = metadataStringList(message, "knowledge_graph_link_tags");
      const zettelkastenEntryType = deriveKnowledgeCardZettelkastenEntryType(message);
      const zettelkastenNextAction = deriveKnowledgeCardZettelkastenNextAction(message);
      const knowledgeGraphSeed = metadataBoolean(message, "knowledge_graph_seed");
      const knowledgeGraphGroupKey = deriveKnowledgeCardGraphGroupKey(message);
      return {
        id: message.id,
        title: deriveKnowledgeCardTitle(message, content),
        summary: deriveKnowledgeCardSummary(message, content),
        supertags,
        canonicalSupertags: canonicalContextualTags([...supertags, ...knowledgeGraphLinkTags]),
        linkEvidenceScore: 0,
        sourceDiversityCount: 0,
        topicalConnectionCount: 0,
        contradictionLinkCount: 0,
        corroboratedSourceCount: 0,
        knowledgeMode,
        sourceKind: message.type,
        sourceMessageId: extractSourceMessageId(message, content),
        sourceTitle: deriveKnowledgeCardSourceTitle(message, content),
        sourceFileName: deriveKnowledgeCardSourceFileName(message),
        academicKind: deriveKnowledgeCardAcademicKind(message),
        academicCourseTag: deriveKnowledgeCardAcademicCourseTag(message),
        academicWeekTag: deriveKnowledgeCardAcademicWeekTag(message),
        academicLectureTag: deriveKnowledgeCardAcademicLectureTag(message),
        academicChapterTag: deriveKnowledgeCardAcademicChapterTag(message),
        academicUnitTag: deriveKnowledgeCardAcademicUnitTag(message),
        academicSummary: deriveKnowledgeCardAcademicSummary(message),
        retentionMode: deriveKnowledgeCardRetentionMode(message),
        retentionLabel: deriveKnowledgeCardRetentionLabel(message),
        zettelkastenStage: deriveKnowledgeCardZettelkastenStage(message),
        ...(zettelkastenEntryType ? { zettelkastenEntryType } : {}),
        ...(zettelkastenNextAction ? { zettelkastenNextAction } : {}),
        ...(knowledgeGraphSeed ? { knowledgeGraphSeed } : {}),
        ...(knowledgeGraphGroupKey ? { knowledgeGraphGroupKey } : {}),
        ...(knowledgeGraphLinkTags.length > 0 ? { knowledgeGraphLinkTags } : {}),
        policyOutcome: deriveKnowledgeCardPolicyOutcome(message),
        storageSummary: deriveKnowledgeCardStorageSummary(message),
        provenanceSummary: deriveKnowledgeCardProvenanceSummary(message, content, knowledgeMode),
        referenceTargetIds: extractReferenceTargetIds(message),
        relatedCardCount: 0,
        connectionStrength: "low",
        connectionReasons: [],
        reviewPending: knowledgeCardHasReviewPending(supertags),
        sourceNote: knowledgeCardHasSourceNote(supertags),
        permanentNote: knowledgeCardHasPermanentNote(supertags),
        backlinks: [],
        timestamp: message.timestamp,
        sourceThreadId: message.thread_id,
      } satisfies KnowledgeCard;
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  return cards;
}

function addBacklink(
  cardById: Map<string, KnowledgeCard>,
  seen: Set<string>,
  sourceId: string,
  targetId: string,
  relationLabel: string,
): void {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceCard = cardById.get(sourceId);
  const targetCard = cardById.get(targetId);
  if (!sourceCard) return;
  const key = `${sourceId}->${targetId}:${relationLabel}`;
  if (seen.has(key)) return;
  seen.add(key);
  const backlink: KnowledgeGraphBacklinkRef = {
    targetId,
    targetTitle: targetCard?.title || targetId.slice(0, 12),
    relationLabel,
  };
  sourceCard.backlinks = [...sourceCard.backlinks, backlink];
}

function describeConnectionStrength(score: number): KnowledgeGraphConnectionStrength {
  if (score >= 9) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function sharedTagDimension(label: string): string | null {
  const normalized = label.toLowerCase();
  if (!normalized.startsWith("shared ")) return null;
  const tag = normalized.slice("shared ".length);
  const separatorIndex = tag.indexOf(":");
  if (separatorIndex <= 0) return "general";
  return tag.slice(0, separatorIndex);
}

function semanticLinkWeight(label: string): number {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("support")
    || normalized.includes("extend")
    || normalized.includes("build")
    || normalized.includes("derive")
    || normalized.includes("explain")
  ) {
    return 2;
  }
  if (
    normalized.includes("challenge")
    || normalized.includes("contrast")
    || normalized.includes("diverge")
    || normalized.includes("conflict")
    || normalized.includes("question")
  ) {
    return 2;
  }
  if (
    normalized.includes("relat")
    || normalized.includes("connect")
    || normalized.includes("overlap")
    || normalized.includes("compare")
  ) {
    return 1;
  }
  return 1;
}

function uniqueCount(values: Array<string | null | undefined>): number {
  return new Set(
    values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase()),
  ).size;
}

function isTopicalTag(tag: string): boolean {
  const normalized = normalizeKnowledgeGraphTagKey(tag);
  return normalized.startsWith("topic:")
    || normalized.startsWith("concept:")
    || normalized.startsWith("theme:")
    || normalized.startsWith("method:")
    || normalized.startsWith("person:");
}

function isContradictionRelation(label: string): boolean {
  const normalized = label.toLowerCase();
  return normalized.includes("challenge")
    || normalized.includes("contrast")
    || normalized.includes("diverge")
    || normalized.includes("conflict")
    || normalized.includes("question")
    || normalized.includes("counter");
}

function deriveConnectionSummary(card: KnowledgeCard, cardById: ReadonlyMap<string, KnowledgeCard>): {
  connectionStrength: KnowledgeGraphConnectionStrength;
  connectionReasons: string[];
  linkEvidenceScore: number;
  sourceDiversityCount: number;
  topicalConnectionCount: number;
  contradictionLinkCount: number;
  corroboratedSourceCount: number;
} {
  const reasons: string[] = [];
  let score = 0;

  if (card.academicCourseTag) {
    reasons.push(`Grounded course context: ${card.academicCourseTag}`);
    score += 1;
  }
  if (card.academicWeekTag) {
    reasons.push(`Grounded week context: ${card.academicWeekTag}`);
    score += 1;
  }
  if (card.academicLectureTag) {
    reasons.push(`Grounded lecture context: ${card.academicLectureTag}`);
    score += 1;
  }
  if (card.academicChapterTag) {
    reasons.push(`Grounded chapter context: ${card.academicChapterTag}`);
    score += 1;
  }
  if (card.academicUnitTag) {
    reasons.push(`Grounded unit context: ${card.academicUnitTag}`);
    score += 1;
  }
  if (card.knowledgeGraphGroupKey) {
    reasons.push(`Graph group anchor: ${card.knowledgeGraphGroupKey}`);
    score += 2;
  }
  if ((card.knowledgeGraphLinkTags ?? []).length > 0) {
    reasons.push(`Supertag graph hints: ${card.knowledgeGraphLinkTags!.slice(0, 3).join(", ")}.`);
    score += Math.min(3, card.knowledgeGraphLinkTags!.length);
  }
  if (card.zettelkastenNextAction) {
    reasons.push("Zettelkasten next action is ready for note promotion.");
    score += 1;
  }
  if ((card.referenceTargetIds ?? []).length > 0) {
    reasons.push("Direct references to other notes are present.");
    score += 2;
  }
  if (card.backlinks.some((link) => link.relationLabel === "source material")) {
    reasons.push("Grounded in retained source material.");
    score += 2;
  }
  const resolvedLinkedCards = card.backlinks
    .map((link) => cardById.get(link.targetId))
    .filter((linked): linked is KnowledgeCard => Boolean(linked));
  const sourceDiversityCount = uniqueCount([
    ...resolvedLinkedCards.map((linked) => linked.sourceKind ?? null),
    ...resolvedLinkedCards.map((linked) => linked.sourceTitle ?? null),
    ...resolvedLinkedCards.map((linked) => linked.sourceFileName ?? null),
  ]);
  const corroboratedSourceCount = uniqueCount(
    resolvedLinkedCards.map((linked) => linked.sourceMessageId ?? linked.id),
  );
  if (sourceDiversityCount >= 2) {
    reasons.push(`Cross-source evidence spans ${sourceDiversityCount} distinct source anchors.`);
    score += Math.min(3, sourceDiversityCount);
  }
  if (corroboratedSourceCount >= 2) {
    reasons.push(`Corroborated by ${corroboratedSourceCount} distinct retained sources.`);
    score += Math.min(3, corroboratedSourceCount);
  }
  const sharedTagLinks = card.backlinks.filter((link) => link.relationLabel.startsWith("shared "));
  if (sharedTagLinks.length > 0) {
    const dimensions = [...new Set(
      sharedTagLinks
        .map((link) => sharedTagDimension(link.relationLabel))
        .filter((value): value is string => Boolean(value)),
    )];
    if (dimensions.length >= 2) {
      reasons.push(`Shared context spans ${dimensions.length} dimensions: ${dimensions.slice(0, 3).join(", ")}.`);
      score += Math.min(4, dimensions.length + 1);
    } else {
      reasons.push(`Linked by ${sharedTagLinks.length} shared study tag${sharedTagLinks.length === 1 ? "" : "s"}.`);
      score += Math.min(3, sharedTagLinks.length);
    }
  }
  const topicalConnectionCount = dedupeTags(
    linkableContextualKnowledgeLabels(card).filter(isTopicalTag),
  ).length;
  if (topicalConnectionCount > 0) {
    reasons.push(`Concept-level context is present across ${topicalConnectionCount} topical tag${topicalConnectionCount === 1 ? "" : "s"}.`);
    score += Math.min(3, topicalConnectionCount);
  }
  const explicitLinks = card.backlinks.filter((link) =>
    link.relationLabel !== "source material"
    && link.relationLabel !== "references"
    && !link.relationLabel.startsWith("shared ")
  );
  if (explicitLinks.length > 0) {
    reasons.push(`Explicit semantic links: ${explicitLinks.slice(0, 2).map((link) => link.relationLabel).join(", ")}.`);
    score += Math.min(4, explicitLinks.reduce((total, link) => total + semanticLinkWeight(link.relationLabel), 0));
  }
  const contradictionLinkCount = explicitLinks.filter((link) => isContradictionRelation(link.relationLabel)).length;
  if (contradictionLinkCount > 0) {
    reasons.push(`Includes ${contradictionLinkCount} contrast or challenge link${contradictionLinkCount === 1 ? "" : "s"}, which improves comparative retrieval.`);
    score += Math.min(2, contradictionLinkCount);
  }
  if ((card.relatedCardCount ?? 0) >= 3) {
    reasons.push(`Connected cluster across ${card.relatedCardCount} related notes.`);
    score += 2;
  } else if ((card.relatedCardCount ?? 0) > 0) {
    reasons.push(`Connected to ${card.relatedCardCount} related note${card.relatedCardCount === 1 ? "" : "s"}.`);
    score += 1;
  }
  if (card.permanentNote) {
    reasons.push("Promoted into a longer-term permanent note.");
    score += 2;
  } else if (card.reviewPending) {
    reasons.push("Still in the review queue before permanent-note promotion.");
    score += 1;
  } else if (card.sourceNote) {
    reasons.push("Still tracked as a source-oriented note.");
    score += 1;
  }
  if (
    card.knowledgeMode === "connected_notes"
    && (card.sourceKind === "parsed_document" || card.sourceKind === "transcript")
    && sharedTagLinks.length > 0
    && card.backlinks.some((link) => link.relationLabel === "source material")
  ) {
    reasons.push("Cross-source study overlap is grounded by retained source material.");
    score += 2;
  }

  return {
    connectionStrength: describeConnectionStrength(score),
    connectionReasons: dedupeTags(reasons),
    linkEvidenceScore: score,
    sourceDiversityCount,
    topicalConnectionCount,
    contradictionLinkCount,
    corroboratedSourceCount,
  };
}

function contextualTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => CONTEXTUAL_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix)));
}

function contextualAcademicMetadataLabels(card: Pick<
  KnowledgeCard,
  "academicCourseTag" | "academicWeekTag" | "academicLectureTag" | "academicChapterTag" | "academicUnitTag" | "knowledgeGraphGroupKey" | "knowledgeGraphLinkTags"
>): string[] {
  return [
    card.academicCourseTag,
    card.academicWeekTag,
    card.academicLectureTag,
    card.academicChapterTag,
    card.academicUnitTag,
    card.knowledgeGraphGroupKey,
    ...(card.knowledgeGraphLinkTags ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function contextualKnowledgeLabels(card: Pick<
  KnowledgeCard,
  "supertags" | "academicCourseTag" | "academicWeekTag" | "academicLectureTag" | "academicChapterTag" | "academicUnitTag" | "knowledgeGraphGroupKey" | "knowledgeGraphLinkTags"
>): string[] {
  return dedupeTags([
    ...contextualTags(card.supertags),
    ...contextualAcademicMetadataLabels(card),
  ]);
}

function linkableContextualKnowledgeLabels(card: Pick<
  KnowledgeCard,
  "supertags" | "academicCourseTag" | "academicWeekTag" | "academicLectureTag" | "academicChapterTag" | "academicUnitTag" | "knowledgeGraphGroupKey" | "knowledgeGraphLinkTags"
>): string[] {
  return contextualKnowledgeLabels(card).filter((tag) =>
    !LOW_SIGNAL_SHARED_CONTEXT_TAGS.has(normalizeKnowledgeGraphTagKey(tag))
  );
}

function canonicalContextualTags(tags: readonly string[]): string[] {
  return dedupeTags(
    contextualTags(tags)
      .flatMap((tag) => [normalizeKnowledgeGraphTagKey(tag), compactKnowledgeGraphTagKey(tag)])
      .filter(Boolean),
  );
}

function attachSharedTagBacklinks(cards: KnowledgeCard[], cardById: Map<string, KnowledgeCard>, seen: Set<string>): void {
  const tagBuckets = new Map<string, { ids: string[]; label: string }>();
  for (const card of cards) {
    const labelsByCanonical = new Map<string, string>();
    for (const tag of linkableContextualKnowledgeLabels(card)) {
      const canonical = normalizeKnowledgeGraphTagKey(tag);
      if (canonical && !labelsByCanonical.has(canonical)) labelsByCanonical.set(canonical, tag);
      const compact = compactKnowledgeGraphTagKey(tag);
      if (compact && !labelsByCanonical.has(compact)) labelsByCanonical.set(compact, tag);
    }
    for (const [canonicalTag, label] of labelsByCanonical) {
      const bucket = tagBuckets.get(canonicalTag) ?? { ids: [], label };
      if (!bucket.ids.includes(card.id)) bucket.ids.push(card.id);
      tagBuckets.set(canonicalTag, bucket);
    }
  }
  for (const [, bucket] of tagBuckets) {
    const { ids, label } = bucket;
    if (ids.length < 2) continue;
    const limited = ids.slice(0, 5);
    for (const sourceId of limited) {
      let created = 0;
      for (const targetId of limited) {
        if (sourceId === targetId) continue;
        addBacklink(cardById, seen, sourceId, targetId, `shared ${label}`);
        created += 1;
        if (created >= 2) break;
      }
    }
  }
}

export function attachKnowledgeGraphBacklinks(
  cards: KnowledgeCard[],
  messages: AfpMessage[],
): KnowledgeCard[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.type !== "backlink_update") continue;
    const content = knowledgeMessageContent(message);
    const sourceId = typeof content.source_id === "string" ? content.source_id : null;
    const targetId = typeof content.target_id === "string" ? content.target_id : null;
    if (!sourceId || !targetId) continue;
    const relationLabel = typeof content.relation === "string" && content.relation.trim()
      ? content.relation.trim()
      : "related";
    addBacklink(cardById, seen, sourceId, targetId, relationLabel);
  }

  for (const card of cards) {
    if (card.sourceMessageId) addBacklink(cardById, seen, card.id, card.sourceMessageId, "source material");
    for (const targetId of card.referenceTargetIds ?? []) {
      addBacklink(cardById, seen, card.id, targetId, "references");
    }
  }

  attachSharedTagBacklinks(cards, cardById, seen);

  const clusterSizes = new Map<string, number>();
  for (const card of cards) {
    for (const tag of card.canonicalSupertags ?? []) {
      clusterSizes.set(tag, (clusterSizes.get(tag) ?? 0) + 1);
    }
  }

  for (const card of cards) {
    const relatedFromClusters = Math.max(
      0,
      ...((card.canonicalSupertags ?? []).map((tag) => (clusterSizes.get(tag) ?? 1) - 1)),
    );
    card.relatedCardCount = Math.max(relatedFromClusters, card.backlinks.length);
    card.backlinks = [...card.backlinks].sort((left, right) =>
      left.targetTitle.localeCompare(right.targetTitle) || left.relationLabel.localeCompare(right.relationLabel)
    );
    const connectionSummary = deriveConnectionSummary(card, cardById);
    card.connectionStrength = connectionSummary.connectionStrength;
    card.connectionReasons = connectionSummary.connectionReasons;
    card.linkEvidenceScore = connectionSummary.linkEvidenceScore;
    card.sourceDiversityCount = connectionSummary.sourceDiversityCount;
    card.topicalConnectionCount = connectionSummary.topicalConnectionCount;
    card.contradictionLinkCount = connectionSummary.contradictionLinkCount;
    card.corroboratedSourceCount = connectionSummary.corroboratedSourceCount;
  }

  return cards;
}

export function extractKnowledgeGraphInsights(messages: AfpMessage[]): InsightMsg[] {
  return messages
    .filter((message) => message.type === "insight")
    .map((message) => {
      const content = knowledgeMessageContent(message);
      return {
        id: message.id,
        body: typeof content.body === "string" ? content.body : "",
        topic: typeof content.topic === "string" ? content.topic : undefined,
        count: typeof content.count === "number" ? content.count : undefined,
        timestamp: message.timestamp,
      };
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 8);
}

export function extractKnowledgeGraphMergeSuggestions(messages: AfpMessage[]): MergeSuggestion[] {
  return messages
    .filter((message) => message.type === "merge_suggestion")
    .map((message) => {
      const content = knowledgeMessageContent(message);
      return {
        id: message.id,
        sourceId: typeof content.source_id === "string" ? content.source_id : "",
        targetId: typeof content.target_id === "string" ? content.target_id : "",
        sourceTitle: typeof content.source_title === "string" ? content.source_title : "Message A",
        targetTitle: typeof content.target_title === "string" ? content.target_title : "Message B",
        similarityScore: typeof content.similarity_score === "number" ? content.similarity_score : undefined,
        timestamp: message.timestamp,
      };
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}
