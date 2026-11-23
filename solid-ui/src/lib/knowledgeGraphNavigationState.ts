// @locs-version: 1.0
import type { FileLibraryItem } from "@/lib/api";
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { isVisibleKnowledgeGraphTag, type KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";

export const KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY = "omnyid.knowledge-graph.navigation";
const KNOWLEDGE_GRAPH_NAVIGATION_STATE_TTL_MS = 5 * 60 * 1000;

export type KnowledgeGraphNavigationIntent = {
  activeLens: KnowledgeGraphLens;
  preferredConnectionStrength: "high" | "medium" | "low" | null;
  activeTag: string | null;
  searchQuery: string;
  knowledgeMode?: "connected_notes" | "zettelkasten" | "standard";
  retentionMode?: "keep_file" | "keep_extracted_only" | "keep_nothing";
  sourceCount?: number;
  academicKind: string | null;
  courseTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  zettelkastenStage: string | null;
  zettelkastenEntryType?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: string[];
  highlightCardId: string | null;
  highlightSourceMessageId: string | null;
  fileName: string | null;
  notice: string | null;
  origin: "files";
  createdAt: number;
};

function normalizeKnowledgeGraphLens(value: unknown): KnowledgeGraphLens {
  if (
    value === "connected_notes"
    || value === "zettelkasten"
    || value === "linked_ideas"
    || value === "study_materials"
    || value === "source_notes"
    || value === "review_queue"
    || value === "permanent_notes"
  ) {
    return value;
  }
  return "all";
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function preferredKnowledgeGraphTag(tags: readonly string[]): string | null {
  const visible = tags
    .map((tag) => tag.trim())
    .filter((tag) => tag && isVisibleKnowledgeGraphTag(tag));
  if (visible.length === 0) return null;
  const priorities = [
    "course:",
    "subject:",
    "class:",
    "academic:",
    "topic:",
    "project:",
    "area:",
    "resource:",
  ];
  for (const prefix of priorities) {
    const match = visible.find((tag) => tag.toLowerCase().startsWith(prefix));
    if (match) return match;
  }
  return visible[0] ?? null;
}

function sourceMetadataString(item: FileLibraryItem, key: string): string | null {
  const value = item.source_metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceMetadataStringList(item: FileLibraryItem, key: string): string[] {
  const value = item.source_metadata[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function uniqueDescriptorValue(
  evidence: AttachmentGroundingEvidence,
  selector: (item: AttachmentGroundingEvidence["sourceDescriptors"][number]) => string | null,
): string | null {
  const values = evidence.sourceDescriptors
    .map(selector)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] ?? null : null;
}

function uniqueDescriptorStringList(
  evidence: AttachmentGroundingEvidence,
  selector: (item: AttachmentGroundingEvidence["sourceDescriptors"][number]) => readonly string[] | null | undefined,
): string[] {
  const values = evidence.sourceDescriptors
    .flatMap((item) => selector(item) ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return [...new Set(values)];
}

function preferredGraphTagFromDescriptors(evidence: AttachmentGroundingEvidence): string | null {
  const graphTags = uniqueDescriptorStringList(evidence, (item) => item.knowledgeGraphLinkTags);
  return preferredKnowledgeGraphTag(graphTags);
}

export function deriveKnowledgeGraphNavigationIntentFromFile(
  item: FileLibraryItem,
): KnowledgeGraphNavigationIntent {
  const knowledgeMode = typeof item.source_metadata.knowledge_mode === "string"
    ? item.source_metadata.knowledge_mode.trim()
    : "";
  const isStudyMaterial = item.source_kind === "parsed_document"
    || item.source_kind === "transcript"
    || item.source_supertags.includes("resource:study_material")
    || item.source_supertags.some((tag) => tag.startsWith("academic:"));
  const activeLens: KnowledgeGraphLens = knowledgeMode === "zettelkasten"
    ? "zettelkasten"
    : knowledgeMode === "connected_notes"
      ? "connected_notes"
      : isStudyMaterial
        ? "study_materials"
        : "all";

  return {
    activeLens,
    preferredConnectionStrength:
      activeLens === "zettelkasten"
          ? "medium"
          : activeLens === "connected_notes" && isStudyMaterial
            ? "high"
          : null,
    activeTag: preferredKnowledgeGraphTag(item.source_supertags),
    searchQuery: "",
    knowledgeMode:
      knowledgeMode === "zettelkasten" || knowledgeMode === "connected_notes" || knowledgeMode === "standard"
        ? knowledgeMode
        : undefined,
    retentionMode:
      sourceMetadataString(item, "retention_mode") === "keep_file"
      || sourceMetadataString(item, "retention_mode") === "keep_extracted_only"
      || sourceMetadataString(item, "retention_mode") === "keep_nothing"
        ? sourceMetadataString(item, "retention_mode") as "keep_file" | "keep_extracted_only" | "keep_nothing"
      : undefined,
    zettelkastenEntryType: sourceMetadataString(item, "zettelkasten_entry_type"),
    zettelkastenNextAction: sourceMetadataString(item, "zettelkasten_next_action"),
    knowledgeGraphGroupKey: sourceMetadataString(item, "knowledge_graph_group_key"),
    knowledgeGraphLinkTags: sourceMetadataStringList(item, "knowledge_graph_link_tags"),
    academicKind: sourceMetadataString(item, "academic_kind"),
    courseTag: sourceMetadataString(item, "academic_course_tag"),
    weekTag: sourceMetadataString(item, "academic_week_tag"),
    lectureTag: sourceMetadataString(item, "academic_lecture_tag"),
    chapterTag: sourceMetadataString(item, "academic_chapter_tag"),
    unitTag: sourceMetadataString(item, "academic_unit_tag"),
    zettelkastenStage: sourceMetadataString(item, "zettelkasten_stage"),
    highlightCardId: item.derived_message_id ?? item.message_id,
    highlightSourceMessageId: item.message_id,
    fileName: normalizeString(item.name),
    notice: "Focused from Files on the retained source you opened most recently.",
    origin: "files",
    createdAt: Date.now(),
  };
}

export function buildKnowledgeGraphIntentFromAttachmentGrounding(
  evidence: AttachmentGroundingEvidence | null,
): KnowledgeGraphNavigationIntent | null {
  if (!evidence || evidence.sourceCount === 0) return null;
  const activeLens: KnowledgeGraphLens =
    evidence.knowledgeMode === "zettelkasten"
      ? "zettelkasten"
      : evidence.sourceCount > 1 || preferredGraphTagFromDescriptors(evidence)
        ? "linked_ideas"
        : "connected_notes";
  const graphGroupKey = uniqueDescriptorValue(evidence, (item) => item.knowledgeGraphGroupKey ?? null);
  const graphLinkTags = uniqueDescriptorStringList(evidence, (item) => item.knowledgeGraphLinkTags);
  const preferredGraphTag = preferredKnowledgeGraphTag(graphLinkTags);
  const nextAction = uniqueDescriptorValue(evidence, (item) => item.zettelkastenNextAction ?? null);
  const fileName =
    evidence.sourceLabels.length === 1 && evidence.sourceLabels[0]?.trim()
      ? evidence.sourceLabels[0].trim()
      : evidence.sourceLabels.length > 1
        ? `${evidence.sourceLabels[0]} and ${evidence.sourceLabels.length - 1} more`
        : null;

  return {
    activeLens,
    preferredConnectionStrength:
      evidence.knowledgeMode === "zettelkasten"
        ? "medium"
        : evidence.sourceCount > 1
          ? "high"
          : null,
    activeTag: preferredGraphTag
      ?? uniqueDescriptorValue(evidence, (item) => item.courseTag)
      ?? uniqueDescriptorValue(evidence, (item) => item.weekTag)
      ?? graphGroupKey
      ?? null,
    searchQuery: evidence.sourceLabels.length === 1
      ? evidence.sourceLabels[0] ?? ""
      : uniqueDescriptorValue(evidence, (item) => item.courseTag)
        ?? uniqueDescriptorValue(evidence, (item) => item.weekTag)
        ?? graphGroupKey
        ?? preferredGraphTag
        ?? "",
    knowledgeMode: evidence.knowledgeMode,
    retentionMode: evidence.retentionMode,
    sourceCount: evidence.sourceCount,
    academicKind: uniqueDescriptorValue(evidence, (item) => item.academicKind),
    courseTag: uniqueDescriptorValue(evidence, (item) => item.courseTag),
    weekTag: uniqueDescriptorValue(evidence, (item) => item.weekTag),
    lectureTag: uniqueDescriptorValue(evidence, (item) => item.lectureTag),
    chapterTag: uniqueDescriptorValue(evidence, (item) => item.chapterTag ?? null),
    unitTag: uniqueDescriptorValue(evidence, (item) => item.unitTag ?? null),
    zettelkastenStage: uniqueDescriptorValue(evidence, (item) => item.zettelkastenStage),
    zettelkastenEntryType: uniqueDescriptorValue(evidence, (item) => item.zettelkastenEntryType ?? null),
    zettelkastenNextAction: nextAction,
    knowledgeGraphGroupKey: graphGroupKey,
    knowledgeGraphLinkTags: graphLinkTags,
    highlightCardId: null,
    highlightSourceMessageId: null,
    fileName,
    notice:
      evidence.knowledgeMode === "zettelkasten"
        ? "Focused on the newest retained study pack, with note-chain links shown before broader graph material."
        : evidence.sourceCount > 1
          ? "Focused on the newest retained study pack, with the strongest cross-source links shown first."
          : "Focused on the newest retained study source and its most relevant graph context.",
    origin: "files",
    createdAt: Date.now(),
  };
}

export function buildKnowledgeGraphIntentFromFileLibraryFocus(input: {
  searchQuery?: string | null;
  activeTag?: string | null;
  knowledgeMode?: "connected_notes" | "zettelkasten" | "standard" | "all";
  academicKind?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  zettelkastenStage?: string | null;
  fallbackItem?: FileLibraryItem | null;
}): KnowledgeGraphNavigationIntent | null {
  const base = input.fallbackItem ? deriveKnowledgeGraphNavigationIntentFromFile(input.fallbackItem) : null;
  const knowledgeMode = input.knowledgeMode ?? "all";
  const activeLens: KnowledgeGraphLens =
    knowledgeMode === "zettelkasten" || input.zettelkastenStage
      ? "zettelkasten"
      : knowledgeMode === "connected_notes"
        ? "connected_notes"
        : input.courseTag || input.weekTag || input.lectureTag || input.chapterTag || input.unitTag || input.academicKind
          ? "study_materials"
          : input.activeTag
            ? "linked_ideas"
            : base?.activeLens ?? "all";

  return {
    activeLens,
    preferredConnectionStrength:
      activeLens === "linked_ideas"
        ? "high"
        : activeLens === "zettelkasten"
          ? "medium"
          : null,
    activeTag: normalizeString(input.activeTag) ?? base?.activeTag ?? null,
    searchQuery: normalizeString(input.searchQuery) ?? "",
    knowledgeMode: base?.knowledgeMode,
    retentionMode: base?.retentionMode,
    sourceCount: base?.sourceCount,
    academicKind: normalizeString(input.academicKind) ?? base?.academicKind ?? null,
    courseTag: normalizeString(input.courseTag) ?? base?.courseTag ?? null,
    weekTag: normalizeString(input.weekTag) ?? base?.weekTag ?? null,
    lectureTag: normalizeString(input.lectureTag) ?? base?.lectureTag ?? null,
    chapterTag: normalizeString(input.chapterTag) ?? base?.chapterTag ?? null,
    unitTag: normalizeString(input.unitTag) ?? base?.unitTag ?? null,
    zettelkastenStage: normalizeString(input.zettelkastenStage) ?? base?.zettelkastenStage ?? null,
    zettelkastenEntryType: base?.zettelkastenEntryType ?? null,
    zettelkastenNextAction: base?.zettelkastenNextAction ?? null,
    knowledgeGraphGroupKey: base?.knowledgeGraphGroupKey ?? null,
    knowledgeGraphLinkTags: base?.knowledgeGraphLinkTags ?? [],
    highlightCardId: base?.highlightCardId ?? null,
    highlightSourceMessageId: base?.highlightSourceMessageId ?? null,
    fileName: base?.fileName ?? null,
    notice: "Focused from Files on the retained study material that matches the current library view.",
    origin: "files",
    createdAt: Date.now(),
  };
}

export function normalizeKnowledgeGraphNavigationIntent(value: unknown): KnowledgeGraphNavigationIntent | null {
  if (!isRecord(value)) return null;
  const intent = value;
  return {
    activeLens: normalizeKnowledgeGraphLens(intent.activeLens),
    preferredConnectionStrength:
      intent.preferredConnectionStrength === "high"
      || intent.preferredConnectionStrength === "medium"
      || intent.preferredConnectionStrength === "low"
        ? intent.preferredConnectionStrength
        : null,
    activeTag: normalizeString(intent.activeTag),
    searchQuery: normalizeString(intent.searchQuery) ?? "",
    knowledgeMode:
      intent.knowledgeMode === "connected_notes" || intent.knowledgeMode === "zettelkasten" || intent.knowledgeMode === "standard"
        ? intent.knowledgeMode
        : undefined,
    retentionMode:
      intent.retentionMode === "keep_file" || intent.retentionMode === "keep_extracted_only" || intent.retentionMode === "keep_nothing"
        ? intent.retentionMode
        : undefined,
    sourceCount:
      typeof intent.sourceCount === "number" && Number.isFinite(intent.sourceCount) && intent.sourceCount > 0
        ? intent.sourceCount
        : undefined,
    academicKind: normalizeString(intent.academicKind),
    courseTag: normalizeString(intent.courseTag),
    weekTag: normalizeString(intent.weekTag),
    lectureTag: normalizeString(intent.lectureTag),
    chapterTag: normalizeString(intent.chapterTag),
    unitTag: normalizeString(intent.unitTag),
    zettelkastenStage: normalizeString(intent.zettelkastenStage),
    zettelkastenEntryType: normalizeString(intent.zettelkastenEntryType),
    zettelkastenNextAction: normalizeString(intent.zettelkastenNextAction),
    knowledgeGraphGroupKey: normalizeString(intent.knowledgeGraphGroupKey),
    knowledgeGraphLinkTags: Array.isArray(intent.knowledgeGraphLinkTags)
      ? intent.knowledgeGraphLinkTags
        .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        .map((tag) => tag.trim())
      : [],
    highlightCardId: normalizeString(intent.highlightCardId),
    highlightSourceMessageId: normalizeString(intent.highlightSourceMessageId),
    fileName: normalizeString(intent.fileName),
    notice: normalizeString(intent.notice),
    origin: "files",
    createdAt:
      typeof intent.createdAt === "number" && Number.isFinite(intent.createdAt)
        ? intent.createdAt
        : Date.now(),
  };
}

export function saveKnowledgeGraphNavigationIntent(
  value: KnowledgeGraphNavigationIntent,
): KnowledgeGraphNavigationIntent | null {
  const normalized = normalizeKnowledgeGraphNavigationIntent(value);
  if (!normalized) return null;
  try {
    sessionStorage.setItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore session storage failures
  }
  return normalized;
}

export function consumeKnowledgeGraphNavigationIntent(
  maxAgeMs = KNOWLEDGE_GRAPH_NAVIGATION_STATE_TTL_MS,
): KnowledgeGraphNavigationIntent | null {
  try {
    const raw = sessionStorage.getItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY);
    if (!raw) return null;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      sessionStorage.removeItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY);
      return null;
    }
    const normalized = normalizeKnowledgeGraphNavigationIntent(parsed.value);
    if (!normalized) {
      sessionStorage.removeItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY);
      return null;
    }
    if (Date.now() - normalized.createdAt > maxAgeMs) {
      sessionStorage.removeItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY);
      return null;
    }
    sessionStorage.removeItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY);
    return normalized;
  } catch {
    try {
      sessionStorage.removeItem(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY);
    } catch {
      // ignore session storage failures
    }
    return null;
  }
}
