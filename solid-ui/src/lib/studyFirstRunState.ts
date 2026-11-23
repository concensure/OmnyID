// @locs-version: 1.0
import type {
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
} from "@/lib/api";
import type { OnboardingQuickStartFlowKind } from "@/lib/onboardingQuickStart";

export type StudyFirstRunStepStatus =
  | "complete"
  | "in_progress"
  | "attention"
  | "upcoming";

export type StudyFirstRunStep = {
  id: "attach" | "setup" | "prompt" | "follow_through";
  label: string;
  detail: string;
  status: StudyFirstRunStepStatus;
};

export type StudyFirstRunState = {
  headline: string;
  supportingText: string;
  steps: StudyFirstRunStep[];
  suggestedPrompt: string | null;
  suggestedPromptReady: boolean;
  recommendedSetupReady: boolean;
};

function attachStep(
  attachedCount: number,
  supportedCount: number,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): StudyFirstRunStep {
  if (supportedCount > 0) {
    return {
      id: "attach",
      label: "Readable study source attached",
      detail:
        supportedCount > 1
          ? `${supportedCount} readable sources are ready for grounded synthesis.`
          : "Your first readable study source is ready for grounded synthesis.",
      status: "complete",
    };
  }
  if (flowKind === "grounded_followup" || flowKind === "adjacent_source_planning") {
    return {
      id: "attach",
      label: flowKind === "adjacent_source_planning"
        ? "Retained study thread is ready"
        : "Retained study focus is ready",
      detail: flowKind === "adjacent_source_planning"
        ? "This run can use the current Files or graph context to decide the next source before you upload anything else."
        : "This run can use the current Files or graph context without requiring a new upload first.",
      status: "complete",
    };
  }
  if (attachedCount > 0) {
    return {
      id: "attach",
      label: "Readable study source needed",
      detail:
        attachedCount > 1
          ? `${attachedCount} files are attached, but none of them can be read in this run yet.`
          : "A file is attached, but it is not readable in this run yet.",
      status: "attention",
    };
  }
  return {
    id: "attach",
    label: "Attach one study source",
    detail: "Start with lecture slides, a reading, rough notes, or a voice memo.",
    status: "in_progress",
  };
}

function setupStep(
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
  preferredKnowledgeMode: KnowledgeOrganizationMode,
): StudyFirstRunStep {
  if (
    knowledgeMode === preferredKnowledgeMode
    && retentionMode === "keep_extracted_only"
  ) {
    return {
      id: "setup",
      label: "Recommended study setup active",
      detail:
        preferredKnowledgeMode === "zettelkasten"
          ? "Zettelkasten plus Keep extracted notes should retain source notes, review stages, and linked ideas without keeping the original file by default."
          : "Connected notes plus Keep extracted notes should retain searchable study material without keeping the original file by default.",
      status: "complete",
    };
  }
  if (retentionMode === "keep_nothing") {
    return {
      id: "setup",
      label: "Retention needs attention",
      detail:
        "This run can answer the question, but nothing will stay in Files, supertags, or the graph afterward.",
      status: "attention",
    };
  }
  return {
    id: "setup",
    label: "Use the safest first-run setup",
    detail:
      preferredKnowledgeMode === "zettelkasten"
        ? "Zettelkasten plus Keep extracted notes is the right setup when the student wants durable note chains without manual file maintenance."
        : "Connected notes plus Keep extracted notes is the best default for stressed uni students who want zero folder maintenance.",
    status: "in_progress",
  };
}

function promptStep(query: string, suggestedPrompt: string | null): StudyFirstRunStep {
  if (query.trim().length > 0) {
    return {
      id: "prompt",
      label: "Grounded study prompt ready",
      detail:
        suggestedPrompt && query.trim() === suggestedPrompt.trim()
          ? "The suggested first-run prompt is loaded and ready to run."
          : "A study prompt is loaded, so OmnyID can turn the upload into a grounded answer.",
      status: "complete",
    };
  }
  return {
    id: "prompt",
    label: "Load a grounded study prompt",
    detail:
      "Use a concrete study prompt so the first answer produces concepts, overlaps, and revision priorities instead of a generic summary.",
    status: "in_progress",
  };
}

function followThroughStep(
  supportedCount: number,
  knowledgeMode: KnowledgeOrganizationMode,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): StudyFirstRunStep {
  if (flowKind === "adjacent_source_planning") {
    return {
      id: "follow_through",
      label: "Attach the recommended adjacent source",
      detail: "After the run, add the recommended lecture, reading, note, or recording so supertags and graph links strengthen the same study thread.",
      status: "upcoming",
    };
  }
  if (knowledgeMode === "zettelkasten") {
    return {
      id: "follow_through",
      label: "Continue into source notes and permanent notes",
      detail:
        supportedCount > 1
          ? "After the run, review retained source notes in Files and continue the note chain in the Zettelkasten view."
          : "After the run, review the retained source note in Files and use the next upload to strengthen the chain.",
      status: "upcoming",
    };
  }
  return {
    id: "follow_through",
    label: "Continue into Files and Linked ideas",
    detail:
      supportedCount > 1
        ? "After the run, inspect retained sources in Files and use Linked ideas to review overlap, divergence, and revision gaps."
        : "After the run, inspect the retained source in Files and use Linked ideas as the graph grows with later uploads.",
    status: "upcoming",
  };
}

function headlineForState(
  steps: readonly StudyFirstRunStep[],
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): string {
  const hasAttention = steps.some((step) => step.status === "attention");
  const firstThreeDone = steps
    .filter((step) => step.id !== "follow_through")
    .every((step) => step.status === "complete");
  if (firstThreeDone) {
    return flowKind === "adjacent_source_planning"
      ? "This next-source planning run is set up for immediate value."
      : flowKind === "grounded_followup"
        ? "This retained-context study run is set up for immediate value."
        : "This first study run is set up for immediate value.";
  }
  if (hasAttention) {
    return "One gap is blocking a study-ready first run.";
  }
  return "You are close to a study-ready first run.";
}

function supportingTextForState(
  supportedCount: number,
  knowledgeMode: KnowledgeOrganizationMode,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): string {
  if (flowKind === "adjacent_source_planning") {
    return "The immediate value is not another generic summary. OmnyID should decide the single best adjacent source to attach next so the graph, supertags, and retrieval quality improve without folder work."
  }
  if (flowKind === "grounded_followup") {
    return "The retained Files or graph context should already be enough for a grounded follow-up, so the student can keep momentum without hunting for another file first."
  }
  if (supportedCount > 1) {
    return "The goal is not just summarization. OmnyID should retain linked study material, supertags, and cross-source connections so later retrieval does not depend on folders or manual tagging.";
  }
  if (knowledgeMode === "zettelkasten") {
    return "The first run should create usable source notes immediately, then make the next upload stronger rather than starting from scratch.";
  }
  return "The first run should leave the student with a useful answer now and one searchable retained study source immediately afterward.";
}

export function buildStudyFirstRunState(input: {
  attachedCount: number;
  supportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  query: string;
  suggestedPrompt?: string | null;
  flowKind?: OnboardingQuickStartFlowKind | null;
  preferredKnowledgeMode?: KnowledgeOrganizationMode | null;
}): StudyFirstRunState {
  const suggestedPrompt = input.suggestedPrompt?.trim() ? input.suggestedPrompt.trim() : null;
  const preferredKnowledgeMode = input.preferredKnowledgeMode ?? "connected_notes";
  const steps = [
    attachStep(input.attachedCount, input.supportedCount, input.flowKind),
    setupStep(input.knowledgeMode, input.retentionMode, preferredKnowledgeMode),
    promptStep(input.query, suggestedPrompt),
    followThroughStep(input.supportedCount, input.knowledgeMode, input.flowKind),
  ];

  return {
    headline: headlineForState(steps, input.flowKind),
    supportingText: supportingTextForState(
      input.supportedCount,
      input.knowledgeMode,
      input.flowKind,
    ),
    steps,
    suggestedPrompt,
    suggestedPromptReady:
      Boolean(suggestedPrompt)
      && input.query.trim() === suggestedPrompt,
    recommendedSetupReady:
      input.knowledgeMode === preferredKnowledgeMode
      && input.retentionMode === "keep_extracted_only",
  };
}
