// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "./api";
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";
import { reportLabelFromQuickStartSeed } from "./reportSeedMetadata";

export type StudentStudyOutcomeActionId =
  | "add_supported_file"
  | "use_recommended_setup"
  | "load_suggested_prompt"
  | "run_now";

export type StudentStudyOutcomeCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudentStudyOutcomeState = {
  headline: string;
  detail: string;
  badge: string;
  cards: StudentStudyOutcomeCard[];
  pressureReliefLabel: string;
  continuationLabel: string;
  primaryActionId: StudentStudyOutcomeActionId;
  primaryActionLabel: string;
  secondaryActionId: StudentStudyOutcomeActionId | null;
  secondaryActionLabel: string | null;
};

function usesRetainedContext(seed: OnboardingQuickStartSeed): boolean {
  return seed.flowKind === "grounded_followup" || seed.flowKind === "adjacent_source_planning";
}

function retentionSummary(mode: AttachmentRetentionMode): string {
  if (mode === "keep_file") {
    return "Original files, extracted content, and source metadata stay available after the answer.";
  }
  if (mode === "keep_nothing") {
    return "Nothing is retained after the answer, so this run helps now but does not reduce future re-explaining.";
  }
  return "Extracted content stays available without keeping the original file, which is the safest default for stressed student workflows.";
}

function continuationSummary(mode: KnowledgeOrganizationMode, supportedCount: number): string {
  if (mode === "zettelkasten") {
    return supportedCount >= 2
      ? "After the answer, OmnyID should carry the same material into source notes, review queues, and the next permanent-note candidates."
      : "After the answer, OmnyID should leave one source note behind so the next upload strengthens the note chain instead of restarting it.";
  }
  if (mode === "connected_notes") {
    return supportedCount >= 2
      ? "After the answer, the same sources should stay reusable through Files, supertags, and Linked ideas so the student does not have to restate the context."
      : "After the answer, the first readable source should stay searchable in Files and become easier to connect when the next lecture, reading, or note is added.";
  }
  return "After the answer, retained material should stay searchable for later grounded reuse.";
}

function recommendedKnowledgeMode(seed: OnboardingQuickStartSeed): KnowledgeOrganizationMode {
  return seed.knowledgeMode ?? "connected_notes";
}

function pressureReliefLabel(
  supportedCount: number,
  quickStartSeed: OnboardingQuickStartSeed,
  retentionMode: AttachmentRetentionMode,
): string {
  if (usesRetainedContext(quickStartSeed)) {
    return retentionMode === "keep_nothing"
      ? `This can still reduce pressure right now by turning retained study context into ${quickStartSeed.valuePromise.toLowerCase()}, but the benefit stops after this chat ends.`
      : `This should reduce pressure right now by turning retained study context into ${quickStartSeed.valuePromise.toLowerCase()} without forcing the student to re-explain the same files or ideas first.`;
  }
  if (supportedCount === 0) {
    return "Pressure relief is limited until at least one readable source is attached, because the first answer cannot be grounded properly yet.";
  }
  if (retentionMode === "keep_nothing") {
    return `This can still reduce pressure right now by turning raw study material into ${quickStartSeed.valuePromise.toLowerCase()}, but the benefit stops after this chat ends.`;
  }
  return `This should reduce pressure by turning raw study material into ${quickStartSeed.valuePromise.toLowerCase()} and keeping that result available for the next study session.`;
}

function actionState(input: {
  attachedCount: number;
  supportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  query: string;
  suggestedPrompt: string | null;
  quickStartSeed: OnboardingQuickStartSeed;
}): Pick<
  StudentStudyOutcomeState,
  "primaryActionId" | "primaryActionLabel" | "secondaryActionId" | "secondaryActionLabel"
> {
  if (usesRetainedContext(input.quickStartSeed)) {
    const reportLabel = reportLabelFromQuickStartSeed(input.quickStartSeed);
    if (
      input.knowledgeMode !== recommendedKnowledgeMode(input.quickStartSeed)
      || input.retentionMode !== "keep_extracted_only"
    ) {
      return {
        primaryActionId: "use_recommended_setup",
        primaryActionLabel: "Use recommended setup",
        secondaryActionId: input.query.trim() ? "run_now" : "load_suggested_prompt",
        secondaryActionLabel: input.query.trim()
          ? reportLabel ? "Generate report" : "Run retained-context pass"
          : reportLabel ? "Load report prompt" : "Load grounded prompt",
      };
    }
    if (!input.query.trim()) {
      return {
        primaryActionId: "load_suggested_prompt",
        primaryActionLabel: reportLabel ? "Load report prompt" : "Load grounded prompt",
        secondaryActionId: null,
        secondaryActionLabel: null,
      };
    }
    return {
      primaryActionId: "run_now",
      primaryActionLabel: input.quickStartSeed.flowKind === "adjacent_source_planning"
        ? "Plan next source"
        : reportLabel ? "Generate report" : "Run retained-context pass",
      secondaryActionId: null,
      secondaryActionLabel: null,
    };
  }
  if (input.supportedCount === 0) {
    return {
      primaryActionId: "add_supported_file",
      primaryActionLabel: "Add a readable study file",
      secondaryActionId: input.attachedCount > 0 ? "use_recommended_setup" : null,
      secondaryActionLabel: input.attachedCount > 0 ? "Use recommended setup" : null,
    };
  }
  if (
    input.knowledgeMode !== recommendedKnowledgeMode(input.quickStartSeed)
    || input.retentionMode !== "keep_extracted_only"
  ) {
    const reportLabel = reportLabelFromQuickStartSeed(input.quickStartSeed);
    return {
      primaryActionId: "use_recommended_setup",
      primaryActionLabel: "Use recommended setup",
      secondaryActionId: input.query.trim() ? "run_now" : "load_suggested_prompt",
      secondaryActionLabel: input.query.trim()
        ? reportLabel ? "Generate report" : "Run study pass"
        : reportLabel ? "Load report prompt" : "Load suggested prompt",
    };
  }
  if (!input.query.trim()) {
    const reportLabel = reportLabelFromQuickStartSeed(input.quickStartSeed);
    return {
      primaryActionId: "load_suggested_prompt",
      primaryActionLabel: reportLabel ? "Load report prompt" : "Load suggested prompt",
      secondaryActionId: null,
      secondaryActionLabel: null,
    };
  }
  const reportLabel = reportLabelFromQuickStartSeed(input.quickStartSeed);
  return {
    primaryActionId: "run_now",
    primaryActionLabel: reportLabel ? "Generate report" : "Run study pass",
    secondaryActionId: null,
    secondaryActionLabel: null,
  };
}

export function buildStudentStudyOutcomeState(input: {
  attachedCount: number;
  supportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  query: string;
  suggestedPrompt: string | null;
  quickStartSeed: OnboardingQuickStartSeed;
}): StudentStudyOutcomeState {
  const sourceScope =
    input.supportedCount >= 2
      ? `${input.supportedCount} readable sources`
      : input.supportedCount === 1
        ? "1 readable source"
        : usesRetainedContext(input.quickStartSeed)
          ? "retained study context"
        : input.attachedCount > 0
          ? `${input.attachedCount} attached file${input.attachedCount === 1 ? "" : "s"}`
          : "your first study source";

  const action = actionState(input);
  const retainedContext = usesRetainedContext(input.quickStartSeed);
  const reportLabel = reportLabelFromQuickStartSeed(input.quickStartSeed);

  return {
    headline:
      input.supportedCount > 0 || retainedContext
        ? reportLabel
          ? "This report is positioned to give the student usable value immediately."
          : "This run is positioned to give the student usable value immediately."
        : "This run is close, but it still needs one readable study source.",
    detail:
      retainedContext
        ? `OmnyID should use ${sourceScope} to deliver ${reportLabel ? `the ${reportLabel}` : "a grounded answer or next-source decision"} now, then keep the useful parts available so the student does not start from scratch in the next study session.`
        : input.supportedCount > 0
        ? `OmnyID should use ${sourceScope} to deliver ${reportLabel ? `the ${reportLabel}` : "a grounded answer"} now, then keep the useful parts available so the student does not start from scratch in the next study session.`
        : `The workflow is ready, but OmnyID still needs at least one readable lecture file, note, reading, or audio source before it can deliver the promised first-run study value.`,
    badge:
      input.supportedCount > 0 || retainedContext
        ? retainedContext && input.quickStartSeed.flowKind === "adjacent_source_planning"
          ? "Next-source value"
          : "Immediate student value"
        : "One blocker remains",
    cards: [
      {
        label: "Right now",
        detail: input.quickStartSeed.valuePromise,
        tone: "sky",
      },
      {
        label: "What stays after the answer",
        detail: retentionSummary(input.retentionMode),
        tone: input.retentionMode === "keep_nothing" ? "amber" : "emerald",
      },
      {
        label: "What the next session gets",
        detail: retainedContext
          ? input.quickStartSeed.flowKind === "adjacent_source_planning"
            ? "After the answer, OmnyID should leave the student with one clear next source to attach so the same thread can deepen without random folder hunting."
            : "After the answer, the retained Files, supertags, and graph context should stay reusable so the student can keep asking grounded follow-ups without restating the same material."
          : continuationSummary(input.knowledgeMode, input.supportedCount),
        tone: input.knowledgeMode === "zettelkasten" ? "violet" : "emerald",
      },
    ],
    pressureReliefLabel: pressureReliefLabel(
      input.supportedCount,
      input.quickStartSeed,
      input.retentionMode,
    ),
    continuationLabel:
      retainedContext && input.quickStartSeed.flowKind === "adjacent_source_planning"
        ? "Best continuation: attach the recommended adjacent lecture, reading, note, or recording next, then rerun so OmnyID strengthens the same thread instead of widening randomly."
        : input.supportedCount >= 2
        ? "Best continuation: move into Files and Linked ideas after the run, then keep adding adjacent course material instead of isolated uploads."
        : input.knowledgeMode === "zettelkasten"
          ? "Best continuation: review the first source note after the run, then add the next related source to strengthen the chain."
          : "Best continuation: review the first retained source after the run, then add one adjacent lecture, reading, or note to strengthen cross-source retrieval.",
    primaryActionId: action.primaryActionId,
    primaryActionLabel: action.primaryActionLabel,
    secondaryActionId: action.secondaryActionId,
    secondaryActionLabel: action.secondaryActionLabel,
  };
}
