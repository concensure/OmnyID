// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import { buildStudyAdjacentSourceRecommendation } from "@/lib/studyAdjacentSourceRecommendation";

export type StudyThreadReinforcementPathCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyThreadReinforcementPathState = {
  headline: string;
  detail: string;
  badge: string;
  cards: StudyThreadReinforcementPathCard[];
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
};

export function buildStudyThreadReinforcementPathState(input: {
  evidence: AttachmentGroundingEvidence | null;
  continuationSeed: OnboardingQuickStartSeed | null;
}): StudyThreadReinforcementPathState | null {
  const evidence = input.evidence;
  if (!evidence || evidence.sourceCount === 0) return null;

  const recommendation = buildStudyAdjacentSourceRecommendation(evidence);
  if (!recommendation) return null;
  const carryoverReady = evidence.retentionMode !== "keep_nothing";

  return {
    headline: carryoverReady
      ? "The fastest way to strengthen this study thread is to stay narrow and add the right adjacent source."
      : "Do not broaden this thread yet. First make it reusable.",
    detail: carryoverReady
      ? recommendation.helperLabel
      : `Before adding another source, rerun the same material with retention so ${recommendation.anchorLabel} becomes reusable across sessions.`,
    badge: carryoverReady ? "Reinforcement recipe" : "Fix retention first",
    cards: [
      {
        label: "Stay on this anchor",
        detail: carryoverReady
          ? `Use the next upload or follow-up question on ${recommendation.anchorLabel}.`
          : `Stay on ${recommendation.anchorLabel} when you rerun so the same study thread becomes reusable.`,
        tone: "sky",
      },
      {
        label: "Best next source",
        detail: recommendation.nextSourceLabel,
        tone: carryoverReady ? "emerald" : "amber",
      },
      {
        label: "Why this strengthens the graph",
        detail: recommendation.rationaleLabel,
        tone: evidence.knowledgeMode === "zettelkasten" ? "violet" : "emerald",
      },
    ],
    primaryActionLabel: carryoverReady ? "Load reinforcement run" : "Rerun with retention",
    secondaryActionLabel: carryoverReady ? "Review retained sources" : null,
  };
}
