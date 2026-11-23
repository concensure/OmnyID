// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "./api";
import type { FileLibraryNavigationIntent } from "./fileLibraryNavigationState";
import type { KnowledgeGraphLens } from "./knowledgeGraphViewState";
import type { KnowledgeGraphNavigationIntent } from "./knowledgeGraphNavigationState";

export type StudyWorkspaceArrivalCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyWorkspaceArrivalState = {
  headline: string;
  detail: string;
  badge: string;
  cards: StudyWorkspaceArrivalCard[];
  nextStep: string;
};

function sourceScope(sourceCount?: number): string {
  if (!sourceCount || sourceCount <= 0) return "your retained study material";
  if (sourceCount === 1) return "1 retained study source";
  return `${sourceCount} retained study sources`;
}

function storageDetail(retentionMode?: AttachmentRetentionMode): string {
  if (retentionMode === "keep_file") {
    return "The original files are still available here together with extracted notes, supertags, and retrieval metadata.";
  }
  if (retentionMode === "keep_nothing") {
    return "Nothing was retained after that run, so this workspace can only reflect older material rather than the temporary upload.";
  }
  return "The extracted study content was retained even if the original file was dropped, so the student can reuse the knowledge without reuploading.";
}

function focusDetail(input: {
  workspace: "files" | "knowledge_graph";
  knowledgeMode?: KnowledgeOrganizationMode;
  lens?: KnowledgeGraphLens | "all" | null;
  fileName?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  activeTag?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: readonly string[] | null;
}): string {
  const contextBits = [
    input.fileName,
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.weekTag,
    input.lectureTag,
    input.knowledgeGraphGroupKey ? `graph anchor ${input.knowledgeGraphGroupKey}` : null,
    ...(input.knowledgeGraphLinkTags ?? []).slice(0, 3).map((tag) => `link ${tag}`),
    input.activeTag ? `#${input.activeTag}` : null,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const contextLabel = contextBits.length > 0 ? ` Focus includes ${contextBits.join(", ")}.` : "";

  if (input.workspace === "files") {
    if (input.knowledgeMode === "zettelkasten") {
      return `This Files view is narrowed toward retained source material that can keep a note chain moving instead of leaving study uploads isolated.${contextLabel}`;
    }
    if (input.knowledgeMode === "connected_notes") {
      return `This Files view is narrowed toward reusable study material that OmnyID can cross-link through supertags and linked retrieval.${contextLabel}`;
    }
    return `This Files view is narrowed toward the most relevant retained sources from the latest study flow.${contextLabel}`;
  }

  if (input.lens === "zettelkasten" || input.knowledgeMode === "zettelkasten") {
    return `This graph focus prioritizes source notes, review queues, and permanent-note paths so the student can keep developing ideas over time.${contextLabel}`;
  }
  if (input.lens === "linked_ideas" || input.lens === "connected_notes" || input.knowledgeMode === "connected_notes") {
    return `This graph focus prioritizes the strongest cross-source links so the student can move from one answer into a reusable connected memory cluster.${contextLabel}`;
  }
  return `This graph focus narrows the knowledge base to the most relevant retained study context.${contextLabel}`;
}

function scalingDetail(input: {
  knowledgeMode?: KnowledgeOrganizationMode;
  retentionMode?: AttachmentRetentionMode;
}): string {
  if (input.retentionMode === "keep_nothing") {
    return "Because nothing is retained from that run, the system cannot compound that upload into future retrieval or linking.";
  }
  if (input.knowledgeMode === "zettelkasten") {
    return "Supertags and note stages let the system scale as branching note sequences rather than a flat pile of uploads.";
  }
  if (input.knowledgeMode === "connected_notes") {
    return "Supertags keep related lectures, readings, and notes clustered so search and synthesis can scale without manual folders.";
  }
  return "Retained metadata keeps the source searchable later, even without the heavier graph layer.";
}

function nextStepDetail(input: {
  workspace: "files" | "knowledge_graph";
  knowledgeMode?: KnowledgeOrganizationMode;
  retentionMode?: AttachmentRetentionMode;
  lens?: KnowledgeGraphLens | "all" | null;
  sourceCount?: number;
  zettelkastenNextAction?: string | null;
}): string {
  if (input.retentionMode === "keep_nothing") {
    return "Best next step: run the next upload with retained extracted notes so the student gets compounding value instead of a one-off answer.";
  }
  if (input.zettelkastenNextAction?.trim()) {
    return `Best next step: ${input.zettelkastenNextAction.trim()}`;
  }
  if (input.workspace === "files") {
    if (input.knowledgeMode === "zettelkasten") {
      return "Best next step: open the matching graph view, review the current source-note branch, then add one adjacent reading or lecture note.";
    }
    return (input.sourceCount ?? 0) > 1
      ? "Best next step: open the matching graph view and follow the strongest supertag cluster into the next revision question."
      : "Best next step: confirm the first retained source looks right, then add one adjacent lecture, reading, or scratch note to strengthen retrieval.";
  }
  if (input.lens === "zettelkasten" || input.knowledgeMode === "zettelkasten") {
    return "Best next step: continue the note chain from the strongest linked card, then add the next adjacent source rather than starting a fresh thread.";
  }
  return (input.sourceCount ?? 0) > 1
    ? "Best next step: ask the next question from the strongest linked cluster so the student reuses the same grounded context."
    : "Best next step: use this graph focus to identify the next missing adjacent source, then upload it to deepen the cluster.";
}

export function buildFilesWorkspaceArrivalState(
  intent: FileLibraryNavigationIntent | null,
): StudyWorkspaceArrivalState | null {
  if (!intent || !intent.notice) return null;
  return {
    headline:
      intent.knowledgeMode === "zettelkasten"
        ? "This Files view continues the student's note-development flow."
        : "This Files view continues the student's latest grounded study run.",
    detail: `${intent.notice} ${sourceScope(intent.sourceCount)} should now be easier to reopen, filter, and reuse without re-explaining the context.`,
    badge:
      intent.knowledgeMode === "zettelkasten"
        ? "Zettelkasten carryover"
        : intent.retentionMode === "keep_file"
          ? "Retained files"
          : "Retained study memory",
    cards: [
      {
        label: "What is available here",
        detail: storageDetail(intent.retentionMode),
        tone: intent.retentionMode === "keep_nothing" ? "amber" : "emerald",
      },
      {
        label: "How this view is focused",
        detail: focusDetail({
          workspace: "files",
          knowledgeMode: intent.knowledgeMode,
          fileName: intent.query ?? null,
          courseTag: intent.courseTag,
          unitTag: intent.unitTag,
          chapterTag: intent.chapterTag,
          weekTag: intent.weekTag,
          lectureTag: intent.lectureTag,
          activeTag: intent.tag,
          knowledgeGraphGroupKey: intent.knowledgeGraphGroupKey,
          knowledgeGraphLinkTags: intent.knowledgeGraphLinkTags,
        }),
        tone: intent.knowledgeMode === "zettelkasten" ? "violet" : "sky",
      },
      {
        label: "Why this scales",
        detail: scalingDetail({
          knowledgeMode: intent.knowledgeMode,
          retentionMode: intent.retentionMode,
        }),
        tone: intent.knowledgeMode === "zettelkasten" ? "violet" : "emerald",
      },
    ],
    nextStep: nextStepDetail({
      workspace: "files",
      knowledgeMode: intent.knowledgeMode,
      retentionMode: intent.retentionMode,
      sourceCount: intent.sourceCount,
      zettelkastenNextAction: intent.zettelkastenNextAction,
    }),
  };
}

export function buildKnowledgeGraphWorkspaceArrivalState(
  intent: KnowledgeGraphNavigationIntent | null,
): StudyWorkspaceArrivalState | null {
  if (!intent || !intent.notice) return null;
  return {
    headline:
      intent.activeLens === "zettelkasten"
        ? "This graph focus continues the student's note chain."
        : intent.activeLens === "linked_ideas" || intent.activeLens === "connected_notes"
          ? "This graph focus continues the student's connected study memory."
          : "This graph focus continues the student's retained study context.",
    detail: `${intent.notice} ${sourceScope(intent.sourceCount)} can now be reused through linked cards, supertags, and follow-up questions instead of a fresh upload-only loop.`,
    badge:
      intent.activeLens === "zettelkasten"
        ? "Zettelkasten lens"
        : intent.activeLens === "linked_ideas" || intent.activeLens === "connected_notes"
          ? "Linked study graph"
          : "Focused graph",
    cards: [
      {
        label: "What is retained",
        detail: storageDetail(intent.retentionMode),
        tone: intent.retentionMode === "keep_nothing" ? "amber" : "emerald",
      },
      {
        label: "How this graph is focused",
        detail: focusDetail({
          workspace: "knowledge_graph",
          knowledgeMode: intent.knowledgeMode,
          lens: intent.activeLens,
          fileName: intent.fileName,
          courseTag: intent.courseTag,
          unitTag: intent.unitTag,
          chapterTag: intent.chapterTag,
          weekTag: intent.weekTag,
          lectureTag: intent.lectureTag,
          activeTag: intent.activeTag,
          knowledgeGraphGroupKey: intent.knowledgeGraphGroupKey,
          knowledgeGraphLinkTags: intent.knowledgeGraphLinkTags,
        }),
        tone: intent.activeLens === "zettelkasten" ? "violet" : "sky",
      },
      {
        label: "Why this scales",
        detail: scalingDetail({
          knowledgeMode: intent.knowledgeMode,
          retentionMode: intent.retentionMode,
        }),
        tone: intent.activeLens === "zettelkasten" ? "violet" : "emerald",
      },
    ],
    nextStep: nextStepDetail({
      workspace: "knowledge_graph",
      knowledgeMode: intent.knowledgeMode,
      retentionMode: intent.retentionMode,
      lens: intent.activeLens,
      sourceCount: intent.sourceCount,
      zettelkastenNextAction: intent.zettelkastenNextAction,
    }),
  };
}
