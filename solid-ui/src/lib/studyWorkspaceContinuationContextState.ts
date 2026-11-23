// @locs-version: 1.0
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import { buildStudyAdjacentSourceRecommendationFromFocus } from "@/lib/studyAdjacentSourceRecommendation";

export type StudyWorkspaceKnowledgeMode = "all" | "connected_notes" | "zettelkasten" | "standard";

export function cleanStudyWorkspaceValue(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function humanizeStudyWorkspaceLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function buildStudyWorkspaceContextLabel(parts: Array<string | null>): string {
  const filtered = parts.filter((part): part is string => Boolean(part));
  if (filtered.length === 0) return "my retained study material";
  if (filtered.length === 1) return filtered[0]!;
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered[filtered.length - 1]}`;
}

export function buildStudyWorkspaceFocusBadges(parts: Array<string | null>): string[] {
  return parts.filter((part): part is string => Boolean(part));
}

export function cleanStudyWorkspaceStringList(value: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim()))];
}

export function buildStudyWorkspaceGraphContextSuffix(input: {
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: readonly string[] | null;
  zettelkastenNextAction?: string | null;
}): string {
  const groupKey = cleanStudyWorkspaceValue(input.knowledgeGraphGroupKey);
  const linkTags = cleanStudyWorkspaceStringList(input.knowledgeGraphLinkTags).slice(0, 5);
  const nextAction = cleanStudyWorkspaceValue(input.zettelkastenNextAction);
  const clauses = [
    groupKey ? `Use graph anchor ${groupKey}.` : null,
    linkTags.length > 0 ? `Prefer these supertag links when retrieving related material: ${linkTags.join(", ")}.` : null,
    nextAction ? `Apply this next note move: ${nextAction}` : null,
  ].filter((value): value is string => Boolean(value));
  return clauses.length > 0 ? ` ${clauses.join(" ")}` : "";
}

export type StudyWorkspaceFocusContextInput = {
  activeTag?: string | null;
  activeLens?: string | null;
  activeConnectionStrength?: "high" | "medium" | "low" | null;
  academicKind?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  zettelkastenStage?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: readonly string[] | null;
};

export type StudyWorkspaceFocusContext = {
  activeTag: string | null;
  academicKind: string | null;
  courseTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  chapterTag: string | null;
  unitTag: string | null;
  zettelkastenStage: string | null;
  knowledgeGraphGroupKey: string | null;
  knowledgeGraphLinkTags: string[];
  contextLabel: string;
  focusBadges: string[];
  graphSuffix: string;
};

export function buildStudyWorkspaceFocusContext(
  input: StudyWorkspaceFocusContextInput,
  options?: {
    activeLens?: string | null;
    activeConnectionStrength?: "high" | "medium" | "low" | null;
  },
): StudyWorkspaceFocusContext {
  const activeLens = options?.activeLens ?? input.activeLens ?? null;
  const activeConnectionStrength = options?.activeConnectionStrength ?? input.activeConnectionStrength ?? null;
  const activeTag = cleanStudyWorkspaceValue(input.activeTag);
  const academicKind = cleanStudyWorkspaceValue(input.academicKind);
  const courseTag = cleanStudyWorkspaceValue(input.courseTag);
  const weekTag = cleanStudyWorkspaceValue(input.weekTag);
  const lectureTag = cleanStudyWorkspaceValue(input.lectureTag);
  const chapterTag = cleanStudyWorkspaceValue(input.chapterTag);
  const unitTag = cleanStudyWorkspaceValue(input.unitTag);
  const zettelkastenStage = cleanStudyWorkspaceValue(input.zettelkastenStage);
  const knowledgeGraphGroupKey = cleanStudyWorkspaceValue(input.knowledgeGraphGroupKey);
  const knowledgeGraphLinkTags = cleanStudyWorkspaceStringList(input.knowledgeGraphLinkTags);
  const contextLabel = buildStudyWorkspaceContextLabel([
    academicKind ? humanizeStudyWorkspaceLabel(academicKind) : null,
    courseTag,
    unitTag,
    chapterTag,
    weekTag,
    lectureTag,
    knowledgeGraphGroupKey,
    activeTag ? `tag ${activeTag}` : null,
  ]);
  const focusBadges = buildStudyWorkspaceFocusBadges([
    academicKind ? humanizeStudyWorkspaceLabel(academicKind) : null,
    courseTag,
    unitTag,
    chapterTag,
    weekTag,
    lectureTag,
    knowledgeGraphGroupKey,
    ...knowledgeGraphLinkTags.slice(0, 3),
    activeTag ? `tag ${activeTag}` : null,
    activeLens && activeLens !== "all" ? `lens ${humanizeStudyWorkspaceLabel(activeLens)}` : null,
    activeConnectionStrength ? `${activeConnectionStrength} links` : null,
    zettelkastenStage ? `stage ${humanizeStudyWorkspaceLabel(zettelkastenStage)}` : null,
  ]);

  return {
    activeTag,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
    knowledgeGraphGroupKey,
    knowledgeGraphLinkTags,
    contextLabel,
    focusBadges,
    graphSuffix: buildStudyWorkspaceGraphContextSuffix(input),
  };
}

export function buildAdjacentSourceFollowupSeed(input: {
  contextLabel: string;
  focusBadges: string[];
  notice: string;
  originLabel: string;
  knowledgeMode: "connected_notes" | "zettelkasten";
  adjacentSource: ReturnType<typeof buildStudyAdjacentSourceRecommendationFromFocus>;
  graphSuffix?: string;
}): OnboardingQuickStartSeed {
  const branchLabel = input.knowledgeMode === "zettelkasten" ? "note chain" : "study thread";
  return {
    label: input.knowledgeMode === "zettelkasten" ? "Find the next note-chain source" : "Find the next adjacent source",
    description:
      input.knowledgeMode === "zettelkasten"
        ? "Identify the single best next source to deepen the same note branch before it fragments."
        : "Identify the single best next source to strengthen the same concept cluster before it widens.",
    flowKind: "adjacent_source_planning",
    query:
      input.knowledgeMode === "zettelkasten"
        ? `Using ${input.contextLabel}, tell me the single best adjacent source I should attach next to deepen the same ${branchLabel}. Explain why it strengthens this branch, what format or source to look for, and what question I should ask once it is attached.${input.graphSuffix ?? ""}`
        : `Using ${input.contextLabel}, tell me the single best adjacent source I should attach next to strengthen the same ${branchLabel}. Explain why it improves overlap and retrieval, what format or source to look for, and what question I should ask once it is attached.${input.graphSuffix ?? ""}`,
    notice: input.notice,
    helper: input.adjacentSource?.helperLabel
      ?? "Stay narrow. Add one source from the same topic, week, or branch instead of widening scope randomly.",
    valuePromise:
      input.knowledgeMode === "zettelkasten"
        ? "Find the next upload that will strengthen the same note chain instead of scattering ideas across disconnected branches."
        : "Find the next upload that will strengthen the same study thread instead of forcing the student to guess what to add next.",
    recommendedUpload: input.adjacentSource?.recommendedUploadLabel
      ?? "Best with one more related source from the same course, week, or concept cluster.",
    knowledgeMode: input.knowledgeMode,
    retentionMode: "keep_extracted_only",
    originLabel: input.originLabel,
    focusBadges: input.focusBadges,
    checklist: [
      input.adjacentSource?.nextSourceLabel ?? "Add one adjacent source that belongs to the same study thread.",
      "Keep extracted notes so the reinforced thread stays reusable after this chat.",
      input.knowledgeMode === "zettelkasten"
        ? "Ask how the new source changes or strengthens the current note chain."
        : "Ask how the new source changes overlap, weak spots, and revision priorities.",
    ],
    nextSteps: [
      input.knowledgeMode === "zettelkasten"
        ? "Return to the Zettelkasten lens and inspect how the branch strengthened."
        : "Return to Linked ideas and inspect whether the supertag cluster became denser.",
      "Review the retained sources in Files so the new answer stays grounded to the underlying material.",
    ],
  };
}
