// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "./attachmentGroundingEvidence";

export type FileLibraryNavigationIntent = {
  query?: string;
  tag?: string | null;
  knowledgeMode?: "connected_notes" | "zettelkasten" | "standard";
  retentionMode?: "keep_file" | "keep_extracted_only" | "keep_nothing";
  sourceCount?: number;
  studyReadiness?: "ready_now" | "developing" | "archival" | "all";
  sourceKind?: "parsed_document" | "transcript" | "attachment" | "unclassified" | "all";
  academicKind?: string | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  zettelkastenStage?: string | null;
  zettelkastenEntryType?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: string[];
  notice?: string | null;
};

export type FileLibraryStudyFocus = {
  searchQuery?: string | null;
  activeTag?: string | null;
  activeLens?:
    | "all"
    | "connected_notes"
    | "zettelkasten"
    | "linked_ideas"
    | "study_materials"
    | "source_notes"
    | "review_queue"
    | "permanent_notes";
  academicKind?: string | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  zettelkastenStage?: string | null;
  zettelkastenEntryType?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: string[];
};

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

let pendingIntent: FileLibraryNavigationIntent | null = null;

export function saveFileLibraryNavigationIntent(intent: FileLibraryNavigationIntent | null): void {
  pendingIntent = intent ? { ...intent } : null;
}

export function consumeFileLibraryNavigationIntent(): FileLibraryNavigationIntent | null {
  if (!pendingIntent) return null;
  const next = { ...pendingIntent };
  pendingIntent = null;
  return next;
}

export function buildFileLibraryIntentFromAttachmentGrounding(
  evidence: AttachmentGroundingEvidence | null,
): FileLibraryNavigationIntent | null {
  if (!evidence || evidence.sourceCount === 0) return null;
  if (evidence.retentionMode === "keep_nothing") return null;

  const singleSourceQuery =
    evidence.sourceLabels.length === 1 && evidence.sourceLabels[0]?.trim()
      ? evidence.sourceLabels[0].trim()
      : undefined;
  const notice =
    evidence.retentionMode === "keep_file"
      ? "Showing the files retained from your latest upload."
      : "Showing the extracted study sources retained from your latest upload.";
  const knowledgeGraphGroupKey = uniqueDescriptorValue(evidence, (item) => item.knowledgeGraphGroupKey ?? null);
  const knowledgeGraphLinkTags = uniqueDescriptorStringList(evidence, (item) => item.knowledgeGraphLinkTags);

  return {
    ...(singleSourceQuery ? { query: singleSourceQuery } : knowledgeGraphGroupKey ? { query: knowledgeGraphGroupKey } : {}),
    tag: knowledgeGraphLinkTags[0] ?? knowledgeGraphGroupKey ?? null,
    knowledgeMode: evidence.knowledgeMode,
    retentionMode: evidence.retentionMode,
    sourceCount: evidence.sourceCount,
    studyReadiness:
      evidence.knowledgeMode === "zettelkasten"
        ? "developing"
        : "ready_now",
    academicKind: uniqueDescriptorValue(evidence, (item) => item.academicKind),
    courseTag: uniqueDescriptorValue(evidence, (item) => item.courseTag),
    unitTag: uniqueDescriptorValue(evidence, (item) => item.unitTag ?? null),
    chapterTag: uniqueDescriptorValue(evidence, (item) => item.chapterTag ?? null),
    weekTag: uniqueDescriptorValue(evidence, (item) => item.weekTag),
    lectureTag: uniqueDescriptorValue(evidence, (item) => item.lectureTag),
    zettelkastenStage: uniqueDescriptorValue(evidence, (item) => item.zettelkastenStage),
    zettelkastenEntryType: uniqueDescriptorValue(evidence, (item) => item.zettelkastenEntryType ?? null),
    zettelkastenNextAction: uniqueDescriptorValue(evidence, (item) => item.zettelkastenNextAction ?? null),
    knowledgeGraphGroupKey,
    knowledgeGraphLinkTags,
    notice,
  };
}

export function buildFileLibraryIntentFromKnowledgeGraphFocus(
  focus: FileLibraryStudyFocus,
): FileLibraryNavigationIntent {
  const lens = focus.activeLens ?? "all";
  const knowledgeMode =
    lens === "zettelkasten" || lens === "source_notes" || lens === "review_queue" || lens === "permanent_notes"
      ? "zettelkasten"
      : lens === "connected_notes" || lens === "linked_ideas" || lens === "study_materials"
        ? "connected_notes"
        : undefined;
  const sourceKind =
    focus.academicKind || focus.courseTag || focus.unitTag || focus.chapterTag || focus.weekTag || focus.lectureTag || lens === "study_materials"
      ? "parsed_document"
      : undefined;

  return {
    query: typeof focus.searchQuery === "string" && focus.searchQuery.trim() ? focus.searchQuery.trim() : undefined,
    tag: typeof focus.activeTag === "string" && focus.activeTag.trim() ? focus.activeTag.trim() : null,
    knowledgeMode,
    studyReadiness:
      lens === "source_notes" || lens === "review_queue"
        ? "developing"
        : lens === "permanent_notes" || lens === "linked_ideas" || lens === "connected_notes" || lens === "study_materials"
          ? "ready_now"
          : "all",
    sourceKind,
    academicKind: typeof focus.academicKind === "string" && focus.academicKind.trim() ? focus.academicKind.trim() : null,
    courseTag: typeof focus.courseTag === "string" && focus.courseTag.trim() ? focus.courseTag.trim() : null,
    unitTag: typeof focus.unitTag === "string" && focus.unitTag.trim() ? focus.unitTag.trim() : null,
    chapterTag: typeof focus.chapterTag === "string" && focus.chapterTag.trim() ? focus.chapterTag.trim() : null,
    weekTag: typeof focus.weekTag === "string" && focus.weekTag.trim() ? focus.weekTag.trim() : null,
    lectureTag: typeof focus.lectureTag === "string" && focus.lectureTag.trim() ? focus.lectureTag.trim() : null,
    zettelkastenStage:
      typeof focus.zettelkastenStage === "string" && focus.zettelkastenStage.trim()
        ? focus.zettelkastenStage.trim()
        : null,
    zettelkastenEntryType:
      typeof focus.zettelkastenEntryType === "string" && focus.zettelkastenEntryType.trim()
        ? focus.zettelkastenEntryType.trim()
        : null,
    zettelkastenNextAction:
      typeof focus.zettelkastenNextAction === "string" && focus.zettelkastenNextAction.trim()
        ? focus.zettelkastenNextAction.trim()
        : null,
    knowledgeGraphGroupKey:
      typeof focus.knowledgeGraphGroupKey === "string" && focus.knowledgeGraphGroupKey.trim()
        ? focus.knowledgeGraphGroupKey.trim()
        : null,
    knowledgeGraphLinkTags: Array.isArray(focus.knowledgeGraphLinkTags)
      ? [...new Set(focus.knowledgeGraphLinkTags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim()))]
      : [],
    notice: "Showing files that match your current knowledge-graph focus.",
  };
}
