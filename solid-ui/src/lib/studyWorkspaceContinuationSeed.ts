// @locs-version: 1.0
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";
import { buildStudyAdjacentSourceRecommendationFromFocus } from "@/lib/studyAdjacentSourceRecommendation";
import {
  buildAdjacentSourceFollowupSeed,
  buildStudyWorkspaceFocusContext,
  cleanStudyWorkspaceValue as clean,
  humanizeStudyWorkspaceLabel as humanize,
  type StudyWorkspaceKnowledgeMode,
} from "@/lib/studyWorkspaceContinuationContextState";

export function buildFilesStudyContinuationSeed(input: {
  searchQuery?: string | null;
  activeTag?: string | null;
  knowledgeMode?: StudyWorkspaceKnowledgeMode;
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
}): OnboardingQuickStartSeed {
  const searchQuery = clean(input.searchQuery);
  const {
    activeTag,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
    contextLabel,
    focusBadges,
    graphSuffix,
  } = buildStudyWorkspaceFocusContext(input);
  const adjacentSource = buildStudyAdjacentSourceRecommendationFromFocus({
    knowledgeMode: input.knowledgeMode === "zettelkasten" || zettelkastenStage ? "zettelkasten" : "connected_notes",
    retentionMode: "keep_extracted_only",
    sourceCount: courseTag || unitTag || chapterTag || weekTag || lectureTag ? 2 : 1,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
  });

  if (input.knowledgeMode === "zettelkasten" || zettelkastenStage) {
    const stageLabel = zettelkastenStage ? humanize(zettelkastenStage) : "linked notes";
    return {
      label: "Develop these notes further",
      description: "Continue the current Zettelkasten thread without restating the same study context.",
      flowKind: "grounded_followup",
      query: `Use ${contextLabel} as Zettelkasten material. Turn the strongest ideas into permanent notes, show what challenges or extends earlier notes, and tell me what to review next from the ${stageLabel} queue.${graphSuffix}`,
      notice: "Zettelkasten follow-up prompt loaded from your current Files focus.",
      helper: adjacentSource?.helperLabel ?? "Add another related lecture, reading, or rough note if you want stronger cross-note links, then press Enter.",
      valuePromise: "Continue turning retained study material into clearer note chains, permanent notes, and review steps.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with one retained source note plus a related lecture, reading, or rough note.",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      originLabel: "From Files focus",
      focusBadges,
      checklist: [
        "Keep extracted notes so the note chain persists after this chat.",
        "Ask for permanent-note candidates, contradictions, and next review steps.",
        adjacentSource?.nextSourceLabel ?? "Add one adjacent source that belongs to the same branch.",
        "Use the resulting links to grow the Zettelkasten thread instead of starting over.",
      ],
      nextSteps: [
        "Return to the Knowledge Graph to inspect note-chain development.",
        "Review retained source notes in Files and continue the strongest branch.",
      ],
    };
  }

  if (courseTag || unitTag || chapterTag || weekTag || lectureTag || academicKind) {
    return {
      label: "Continue this study topic",
      description: "Ask a grounded follow-up question from the same course, week, lecture, or study source type.",
      flowKind: "grounded_followup",
      query: `Using ${contextLabel}, summarize what matters most, extract the examinable ideas, and tell me the revision priorities and likely weak spots.${searchQuery ? ` Also use this focus: ${searchQuery}.` : ""}${graphSuffix}`,
      notice: "Study follow-up prompt loaded from your current Files focus.",
      helper: adjacentSource?.helperLabel ?? "Attach one more related source if you want better overlap and retrieval coverage, then press Enter.",
      valuePromise: "Stay inside the same study topic and get the next grounded answer without re-explaining your files.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with one lecture source and one reading, tutorial sheet, or rough note from the same topic.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From Files focus",
      focusBadges,
      checklist: [
        "Keep extracted notes so the topic stays searchable after this chat.",
        "Ask for concepts, definitions, and revision priorities.",
        adjacentSource?.nextSourceLabel ?? "Add one more related source if you want stronger overlap across the retained material.",
      ],
      nextSteps: [
        "Review the updated retained sources in Files.",
        "Open Linked ideas to inspect where the topic now overlaps with adjacent material.",
      ],
    };
  }

  if (activeTag || searchQuery) {
    const tagLabel = activeTag ? `tagged ${activeTag}` : "currently filtered";
    return {
      label: "Ask from this retained study pack",
      description: "Use the current file focus as the next grounded study run.",
      flowKind: "grounded_followup",
      query: `Use my retained study material ${tagLabel}. Show the strongest concepts, overlaps, and revision gaps, and answer from the sources rather than generic background knowledge.${searchQuery ? ` Current search focus: ${searchQuery}.` : ""}${graphSuffix}`,
      notice: "Study-pack follow-up prompt loaded from your current Files focus.",
      helper: adjacentSource?.helperLabel ?? "Press Enter to ask from the current retained pack, or add another file first if you want stronger comparison.",
      valuePromise: "Turn the files already in focus into the next grounded study answer immediately.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with one or two retained sources that belong to the same subject or topic.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From Files focus",
      focusBadges,
      checklist: [
        "Keep extracted notes so the pack remains searchable after this run.",
        "Ask for overlaps, contradictions, and revision gaps.",
        "Use supertags or keyword filters to stay on the same pack instead of folder hunting.",
      ],
      nextSteps: [
        "Review the updated pack in Files.",
        "Open Linked ideas to inspect the strongest cross-source connections.",
      ],
    };
  }

  return {
    label: "Connect my study material",
    description: "Turn lecture slides, notes, readings, or voice memos into connected notes.",
    flowKind: "initial_upload",
    query: "Turn these lecture slides, readings, notes, or voice memos into connected notes. Show the main concepts, overlaps, and what I should revise first.",
    notice: "Starter study prompt loaded. Add lecture slides, notes, readings, or voice memos to experience connected notes immediately.",
    helper: "Drag in a PDF, DOCX, Markdown note, screenshot, or lecture audio, then press Enter.",
    valuePromise: "See the main concepts, overlaps, and first revision priorities from your own study material in one run.",
    recommendedUpload: "Best with one lecture source plus one rough note or reading.",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Upload one lecture PDF, reading, or rough note.",
      "Keep extracted notes so the result stays searchable after this chat.",
      "Ask for concepts, overlaps, and what to revise first.",
    ],
    nextSteps: [
      "Browse the retained study sources in Files.",
      "Open Linked ideas to review how supertags and graph links connected the material.",
    ],
  };
}

export function buildFilesAdjacentSourceSeed(input: {
  searchQuery?: string | null;
  activeTag?: string | null;
  knowledgeMode?: StudyWorkspaceKnowledgeMode;
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
}): OnboardingQuickStartSeed {
  const {
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
    contextLabel,
    focusBadges,
    graphSuffix,
  } = buildStudyWorkspaceFocusContext(input);
  const knowledgeMode = input.knowledgeMode === "zettelkasten" || zettelkastenStage ? "zettelkasten" : "connected_notes";
  const adjacentSource = buildStudyAdjacentSourceRecommendationFromFocus({
    knowledgeMode,
    retentionMode: "keep_extracted_only",
    sourceCount: courseTag || unitTag || chapterTag || weekTag || lectureTag ? 2 : 1,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
  });
  return buildAdjacentSourceFollowupSeed({
    contextLabel,
    focusBadges,
    notice: knowledgeMode === "zettelkasten"
      ? "Adjacent-source prompt loaded from your current Files note-chain focus."
      : "Adjacent-source prompt loaded from your current Files study focus.",
    originLabel: "From Files focus",
    knowledgeMode,
    adjacentSource,
    graphSuffix,
  });
}

export function buildKnowledgeGraphStudyContinuationSeed(input: {
  searchQuery?: string | null;
  activeTag?: string | null;
  activeLens?: KnowledgeGraphLens;
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
}): OnboardingQuickStartSeed {
  const activeLens = input.activeLens ?? "all";
  const activeConnectionStrength = input.activeConnectionStrength ?? null;
  const {
    activeTag,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
    contextLabel,
    focusBadges,
    graphSuffix,
  } = buildStudyWorkspaceFocusContext(input, { activeLens, activeConnectionStrength });
  const adjacentSource = buildStudyAdjacentSourceRecommendationFromFocus({
    knowledgeMode: activeLens === "zettelkasten" || zettelkastenStage ? "zettelkasten" : "connected_notes",
    retentionMode: "keep_extracted_only",
    sourceCount: activeLens === "linked_ideas"
      || activeConnectionStrength === "high"
      || courseTag
      || unitTag
      || chapterTag
      || weekTag
      || lectureTag
      ? 2
      : 1,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
  });

  if (activeLens === "zettelkasten" || zettelkastenStage) {
    const stageLabel = zettelkastenStage ? humanize(zettelkastenStage) : "current note chain";
    return {
      label: "Continue this note chain",
      description: "Use the current graph focus to develop permanent notes and review links.",
      query: `Use ${contextLabel} from my current knowledge graph. Continue the ${stageLabel}, turn the best ideas into permanent notes, and show which links are still weak or missing.${graphSuffix}`,
      notice: "Zettelkasten follow-up prompt loaded from your current graph focus.",
      helper: adjacentSource?.helperLabel ?? "Keep extracted notes on, and add one more related source if you want stronger note-chain reinforcement.",
      valuePromise: "Move from source notes toward clearer permanent notes and stronger graph links.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with an existing note chain plus one more related lecture, reading, or rough note.",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      originLabel: "From Knowledge Graph focus",
      focusBadges,
      checklist: [
        "Ask for permanent-note candidates and weak links.",
        "Use the graph focus to avoid restarting the same topic manually.",
        adjacentSource?.nextSourceLabel ?? "Add another adjacent source when the graph still feels sparse.",
      ],
      nextSteps: [
        "Reopen the graph to inspect the strengthened note chain.",
        "Open Files to review the retained source notes behind those links.",
      ],
    };
  }

  if (activeLens === "linked_ideas" || activeConnectionStrength === "high" || activeTag) {
    return {
      label: "Ask from linked ideas",
      description: "Use the strongest current cross-source graph links as the basis for the next study run.",
      query: `Using ${contextLabel} from my current linked ideas, explain the strongest overlaps, what each source adds that the others miss, and the revision gaps I should close next.${graphSuffix}`,
      notice: "Linked-ideas follow-up prompt loaded from your current graph focus.",
      helper: adjacentSource?.helperLabel ?? "This works best when the graph already has at least two related study sources.",
      valuePromise: "Turn the strongest graph connections into a grounded comparison without manually restating the sources.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with one lecture source plus one reading, tutorial, or revision note from the same topic.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From Knowledge Graph focus",
      focusBadges,
      checklist: [
        "Ask for overlap, differences, and missing pieces.",
        "Stay on extracted-note retention so the graph remains reusable.",
        adjacentSource?.nextSourceLabel ?? "Add a third source when you want denser cross-source retrieval.",
      ],
      nextSteps: [
        "Review the linked study pack in the graph.",
        "Open Files to inspect the retained sources behind those overlaps.",
      ],
    };
  }

  if (courseTag || unitTag || chapterTag || weekTag || lectureTag || academicKind) {
    const searchQuery = clean(input.searchQuery);
    return {
      label: "Ask from this study focus",
      description: "Continue studying the same course, week, or lecture focus already highlighted in the graph.",
      query: `Using ${contextLabel} from my current knowledge graph, summarize the key ideas, likely exam angles, and next revision steps.${searchQuery ? ` Also keep this focus in view: ${searchQuery}.` : ""}${graphSuffix}`,
      notice: "Study follow-up prompt loaded from your current graph focus.",
      helper: adjacentSource?.helperLabel ?? "Attach another source from the same week or lecture if you want stronger overlap.",
      valuePromise: "Carry the graphâ€™s current topic focus directly into the next grounded study answer.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with one week-specific lecture source plus a reading or rough note from the same topic.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From Knowledge Graph focus",
      focusBadges,
      checklist: [
        "Ask for definitions, exam angles, and revision priorities.",
        "Use the graph focus to stay on the same topic without repeating yourself.",
        adjacentSource?.nextSourceLabel ?? "Add one more adjacent source if the graph still looks sparse.",
      ],
      nextSteps: [
        "Inspect the graph again to see whether stronger links formed.",
        "Review the retained sources in Files for source-level detail.",
      ],
    };
  }

  return buildFilesStudyContinuationSeed({
    searchQuery: input.searchQuery,
    activeTag: input.activeTag,
    knowledgeMode: "connected_notes",
  });
}

export function buildKnowledgeGraphAdjacentSourceSeed(input: {
  searchQuery?: string | null;
  activeTag?: string | null;
  activeLens?: KnowledgeGraphLens;
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
}): OnboardingQuickStartSeed {
  const activeLens = input.activeLens ?? "all";
  const {
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
    contextLabel,
    focusBadges,
    graphSuffix,
  } = buildStudyWorkspaceFocusContext(input, {
    activeLens,
    activeConnectionStrength: input.activeConnectionStrength ?? null,
  });
  const knowledgeMode = activeLens === "zettelkasten" || zettelkastenStage ? "zettelkasten" : "connected_notes";
  const adjacentSource = buildStudyAdjacentSourceRecommendationFromFocus({
    knowledgeMode,
    retentionMode: "keep_extracted_only",
    sourceCount: activeLens === "linked_ideas"
      || input.activeConnectionStrength === "high"
      || courseTag
      || unitTag
      || chapterTag
      || weekTag
      || lectureTag
      ? 2
      : 1,
    academicKind,
    courseTag,
    weekTag,
    lectureTag,
    chapterTag,
    unitTag,
    zettelkastenStage,
  });
  return buildAdjacentSourceFollowupSeed({
    contextLabel,
    focusBadges,
    notice: knowledgeMode === "zettelkasten"
      ? "Adjacent-source prompt loaded from your current graph note-chain focus."
      : "Adjacent-source prompt loaded from your current graph focus.",
    originLabel: "From Knowledge Graph focus",
    knowledgeMode,
    adjacentSource,
    graphSuffix,
  });
}
