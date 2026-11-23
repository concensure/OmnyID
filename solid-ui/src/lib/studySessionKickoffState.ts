// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "./api";
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";

export type StudySessionKickoffStep = {
  label: string;
  detail: string;
  status: "complete" | "current" | "upcoming";
};

export type StudySessionKickoffState = {
  headline: string;
  detail: string;
  tone: "amber" | "sky" | "emerald";
  primaryActionId: "pick_files" | "use_recommended_setup" | "load_prompt" | "run_now";
  primaryActionLabel: string;
  secondaryActionId: "pick_files" | "use_recommended_setup" | "load_prompt" | "run_now" | null;
  secondaryActionLabel: string | null;
  steps: StudySessionKickoffStep[];
};

function usesRetainedContext(seed: OnboardingQuickStartSeed): boolean {
  return seed.flowKind === "grounded_followup" || seed.flowKind === "adjacent_source_planning";
}

function uploadStepLabel(seed: OnboardingQuickStartSeed): string {
  if (seed.flowKind === "adjacent_source_planning") {
    return "Attach the next related source";
  }
  if (seed.flowKind === "grounded_followup") {
    return "Add another related source";
  }
  return "Attach study material";
}

function conciseUploadRecommendation(seed: OnboardingQuickStartSeed): string {
  return seed.recommendedUpload
    .trim()
    .replace(/^(Best with|Optional:)\s*/i, "")
    .replace(/\.$/, "");
}

export function buildStudySessionKickoffState(input: {
  quickStartSeed: OnboardingQuickStartSeed;
  attachedCount: number;
  supportedCount: number;
  queryReady: boolean;
  recommendedSetupReady: boolean;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): StudySessionKickoffState | null {
  if (!input.quickStartSeed) return null;
  const retainedContext = usesRetainedContext(input.quickStartSeed);

  const uploadStep: StudySessionKickoffStep = {
    label: uploadStepLabel(input.quickStartSeed),
    detail: input.attachedCount > 0
      ? `${input.attachedCount} file${input.attachedCount === 1 ? "" : "s"} attached.`
      : retainedContext
        ? `Optional now. ${input.quickStartSeed.recommendedUpload}`
        : input.quickStartSeed.recommendedUpload,
    status: input.attachedCount > 0
      ? "complete"
      : retainedContext
        ? "upcoming"
        : "current",
  };
  const setupStep: StudySessionKickoffStep = {
    label: "Keep the right memory",
    detail: input.recommendedSetupReady
      ? "Connected notes plus kept extracted notes is active."
      : "Use connected notes plus kept extracted notes so the result stays searchable after this chat.",
    status: input.recommendedSetupReady
      ? "complete"
      : input.attachedCount > 0
        ? "current"
        : "upcoming",
  };
  const runStep: StudySessionKickoffStep = {
    label: input.quickStartSeed.flowKind === "adjacent_source_planning"
      ? "Run the next-source planning pass"
      : "Run the grounded study pass",
    detail: input.supportedCount > 0 || retainedContext
      ? input.quickStartSeed.valuePromise
      : "A readable file is needed before OmnyID can produce grounded connected notes from your own material.",
    status: (input.supportedCount > 0 || retainedContext) && input.queryReady && input.recommendedSetupReady
      ? "current"
      : "upcoming",
  };

  if (input.attachedCount === 0 && !retainedContext) {
    const recommendedUpload = conciseUploadRecommendation(input.quickStartSeed);
    return {
      headline: "Your first study win starts with one real class source.",
      detail: `Use ${recommendedUpload}. The point is to make the first answer come from your own material, not generic model knowledge.`,
      tone: "sky",
      primaryActionId: "pick_files",
      primaryActionLabel: "Choose study files",
      secondaryActionId: "load_prompt",
      secondaryActionLabel: "Review loaded prompt",
      steps: [uploadStep, setupStep, runStep],
    };
  }

  if (!input.recommendedSetupReady) {
    return {
      headline: "Your files are here, but the retention setup still needs one fix.",
      detail: input.retentionMode === "keep_nothing"
        ? "This run can still answer now, but the study material will disappear from Files and the graph afterward."
        : "Switch back to connected notes plus kept extracted notes so the first useful answer also becomes reusable study memory.",
      tone: "amber",
      primaryActionId: "use_recommended_setup",
      primaryActionLabel: "Use recommended setup",
      secondaryActionId: input.supportedCount > 0 ? "run_now" : "pick_files",
      secondaryActionLabel: input.supportedCount > 0 ? "Run anyway" : "Choose another file",
      steps: [uploadStep, setupStep, runStep],
    };
  }

  if (retainedContext) {
    const adjacentPlanning = input.quickStartSeed.flowKind === "adjacent_source_planning";
    return {
      headline: adjacentPlanning
        ? "This study focus is ready to decide the next source immediately."
        : "This retained study focus is ready for the next answer immediately.",
      detail: adjacentPlanning
        ? "Run now from the retained Files or graph context, then attach the single best adjacent source OmnyID recommends."
        : "Run now from the retained Files or graph context. Add another related source only when you want stronger overlap, denser supertags, or better graph coverage.",
      tone: input.queryReady ? "emerald" : "sky",
      primaryActionId: input.queryReady ? "run_now" : "load_prompt",
      primaryActionLabel: input.queryReady
        ? adjacentPlanning
          ? "Plan next source"
          : "Run grounded follow-up"
        : "Load grounded prompt",
      secondaryActionId: "pick_files",
      secondaryActionLabel: adjacentPlanning ? "Attach source now" : "Add related source",
      steps: [uploadStep, setupStep, runStep],
    };
  }

  if (input.supportedCount === 0) {
    return {
      headline: "These files need one readable source before the first study answer can land.",
      detail: "Add PDF, DOCX, Markdown, TXT, CSV, or common audio so OmnyID can extract concepts, apply supertags, and retain something useful after the run.",
      tone: "amber",
      primaryActionId: "pick_files",
      primaryActionLabel: "Add readable file",
      secondaryActionId: "load_prompt",
      secondaryActionLabel: "Keep prompt ready",
      steps: [uploadStep, setupStep, runStep],
    };
  }

  return {
    headline: input.knowledgeMode === "zettelkasten"
      ? "This session is ready to create the first durable note chain."
      : "This session is ready to produce immediate study value.",
    detail: input.supportedCount >= 2
      ? "You have enough grounded material to compare sources immediately, then keep the result searchable in Files and the graph."
      : "One grounded source is enough to get a useful answer now, and the next upload will strengthen the graph later.",
    tone: "emerald",
    primaryActionId: "run_now",
    primaryActionLabel: input.knowledgeMode === "zettelkasten" ? "Start first source note" : "Run first study answer",
    secondaryActionId: input.supportedCount === 1 ? "pick_files" : "load_prompt",
    secondaryActionLabel: input.supportedCount === 1 ? "Add one more source" : "Review prompt",
    steps: [uploadStep, setupStep, runStep],
  };
}
