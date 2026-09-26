// @locs-version: 1.0
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";
import { studentQuickStartForIntent } from "./onboardingQuickStart";
import {
  buildStudentReportMemoryState,
  type StudentReportMemoryState,
} from "./studentReportMemoryState";
import type { StudyReportArtifact } from "./studyReportArtifactLocalState";

export type StudentActivationFeaturedStarter = {
  slot: "primary" | "secondary" | "deeper";
  badge: string;
  emphasis: string;
  starter: OnboardingQuickStartSeed;
};

export type StudentActivationLaunchState = {
  headline: string;
  detail: string;
  tone: "amber" | "sky" | "emerald";
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
  firstUploadTitle: string;
  firstUploadDetail: string;
  firstMinuteTitle: string;
  firstMinuteDetail: string;
  firstMinuteChecklist: string[];
  firstValueChecklist: string[];
  featuredStarters: StudentActivationFeaturedStarter[];
  savedReportMemory: StudentReportMemoryState | null;
};

function buildFeaturedStarters(
  recommendedSeed: OnboardingQuickStartSeed,
): StudentActivationFeaturedStarter[] {
  return [
    {
      slot: "primary",
      badge: "Best first win",
      emphasis: "Fastest way to feel grounded value in the first session.",
      starter: recommendedSeed,
    },
    {
      slot: "secondary",
      badge: "Lowest effort",
      emphasis: "Works when the student only has one lecture pack, reading, or assignment brief ready.",
      starter: studentQuickStartForIntent("week_summary"),
    },
    {
      slot: "deeper",
      badge: "Build longer memory",
      emphasis: "Use when the student wants note chains and durable idea development, not just a quick summary.",
      starter: studentQuickStartForIntent("zettelkasten_chain"),
    },
  ];
}

function cleanRecommendedUpload(upload: string): string {
  return upload
    .trim()
    .replace(/^(Best with|Optional:)\s*/i, "")
    .replace(/\.$/, "");
}

function lowerRecommendedUpload(upload: string): string {
  return cleanRecommendedUpload(upload).toLowerCase();
}

export function buildStudentActivationLaunchState(input: {
  llmReady: boolean;
  gmailReady: boolean;
  recommendedSeed: OnboardingQuickStartSeed;
  savedReportArtifacts?: readonly StudyReportArtifact[];
}): StudentActivationLaunchState {
  const savedReportMemory = buildStudentReportMemoryState(input.savedReportArtifacts ?? []);
  const timeToValue = input.recommendedSeed.timeToValueLabel ?? "useful study output in the first run";
  const firstUploadTitle =
    input.recommendedSeed.knowledgeMode === "zettelkasten"
      ? "Best first upload for a Zettelkasten start"
      : "Best first upload for immediate study value";
  const firstUploadDetail =
    input.recommendedSeed.knowledgeMode === "zettelkasten"
      ? "Use one reading, lecture source, or rough note with one strong idea worth developing into a source-note chain."
      : "Use one lecture PDF plus one reading or rough note when possible. If you only have one source, that is still enough to get a grounded first result.";
  const firstMinuteTitle =
    input.recommendedSeed.knowledgeMode === "zettelkasten"
      ? "First 60 seconds to start a note chain"
      : "First 60 seconds to get study value";
  const firstMinuteDetail =
    input.recommendedSeed.knowledgeMode === "zettelkasten"
      ? "Choose the source-note path, attach one strong source, and let OmnyID turn it into the first branch instead of a loose file."
      : "Choose one study quick start, attach one real class source, and let OmnyID return concepts, overlaps, or revision priorities before the student starts organising folders.";
  const firstMinuteChecklist = [
    `Open "${input.recommendedSeed.label}" with the prompt already loaded.`,
    cleanRecommendedUpload(input.recommendedSeed.recommendedUpload),
    input.recommendedSeed.retentionMode === "keep_extracted_only"
      ? "Leave extracted-note retention on so the first answer becomes reusable study memory."
      : "Choose the recommended retention mode before running the first study pass.",
    input.recommendedSeed.knowledgeMode === "zettelkasten"
      ? "Run the pass, then continue the strongest branch instead of starting a new thread."
      : "Run the pass, then open Files or Linked ideas so the result stays connected to the same sources.",
  ];
  const firstValueChecklist = [
    cleanRecommendedUpload(input.recommendedSeed.recommendedUpload),
    input.recommendedSeed.retentionMode === "keep_extracted_only"
      ? "Keep extracted notes on so the result stays searchable in Files, supertags, and linked retrieval."
      : input.recommendedSeed.retentionMode === "keep_file"
        ? "Keep the original file when exact file recall matters later."
        : "Use session-only retention only for one-off questions you do not need to keep.",
    input.recommendedSeed.knowledgeMode === "zettelkasten"
      ? "Ask for source notes, promising permanent-note directions, and the best next branch."
      : "Ask for concepts, overlaps, and what to revise first so the first run returns immediate study value.",
  ];

  if (!input.llmReady) {
    return {
      headline: "Connect AI first, then go straight into your first study run.",
      detail: "The fastest student path is still connected notes plus kept extracted notes. Once AI is connected, OmnyID should turn a lecture PDF, reading, or rough note into useful study output in the first session.",
      tone: "amber",
      primaryActionLabel: "Connect AI first",
      secondaryActionLabel: null,
      firstUploadTitle,
      firstUploadDetail,
      firstMinuteTitle,
      firstMinuteDetail,
      firstMinuteChecklist,
      firstValueChecklist,
      featuredStarters: buildFeaturedStarters(input.recommendedSeed),
      savedReportMemory,
    };
  }

  if (!input.gmailReady) {
    return {
      headline: "Your first student value does not depend on Gmail.",
      detail: `Open "${input.recommendedSeed.label}" now for ${timeToValue.toLowerCase()}, upload ${lowerRecommendedUpload(input.recommendedSeed.recommendedUpload)}, and OmnyID should deliver a useful study result before you touch inbox setup.`,
      tone: "sky",
      primaryActionLabel: "Open study workspace",
      secondaryActionLabel: "Connect Gmail later",
      firstUploadTitle,
      firstUploadDetail,
      firstMinuteTitle,
      firstMinuteDetail,
      firstMinuteChecklist,
      firstValueChecklist,
      featuredStarters: buildFeaturedStarters(input.recommendedSeed),
      savedReportMemory,
    };
  }

  return {
    headline: "Core setup is ready and study value can start immediately.",
    detail: `Open "${input.recommendedSeed.label}" now for ${timeToValue.toLowerCase()}, get the first study output grounded in your own material, then add Gmail later only if you want inbox assistance in the same workspace.`,
    tone: "emerald",
    primaryActionLabel: "Start first study run",
    secondaryActionLabel: "Open inbox later",
    firstUploadTitle,
    firstUploadDetail,
    firstMinuteTitle,
    firstMinuteDetail,
    firstMinuteChecklist,
    firstValueChecklist,
    featuredStarters: buildFeaturedStarters(input.recommendedSeed),
    savedReportMemory,
  };
}
