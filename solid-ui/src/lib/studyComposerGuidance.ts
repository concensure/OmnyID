// @locs-version: 1.0
import type {
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
} from "./api";
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";
import {
  extractReportSeedMetadata,
  isReportQuickStartSeed,
  reportLabelFromQuickStartSeed,
  reportSourceNeedsFromQuickStartSeed,
} from "./reportSeedMetadata";

export type StudyComposerGuidanceInput = {
  attachedCount: number;
  supportedCount: number;
  unsupportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  quickStartSeed?: OnboardingQuickStartSeed | null;
};

export type StudyComposerGuidance = {
  recommendedKnowledgeMode: KnowledgeOrganizationMode;
  recommendedRetentionMode: AttachmentRetentionMode;
  recommendationTitle: string;
  recommendationBody: string;
  recommendationMatchesCurrent: boolean;
  suggestionHeading: string;
  suggestionDetail: string;
  suggestedPrompts: string[];
};

const DEFAULT_RECOMMENDED_KNOWLEDGE_MODE: KnowledgeOrganizationMode = "connected_notes";
const DEFAULT_RECOMMENDED_RETENTION_MODE: AttachmentRetentionMode = "keep_extracted_only";

function suggestionSetForSourceCount(supportedCount: number): string[] {
  if (supportedCount >= 2) {
    return [
      "Compare these sources. Show the overlap, what is new, and what I should revise first.",
      "Turn these study sources into connected notes. Pull out the main concepts, conflicts, and exam risks.",
      "What are the most important ideas across these files, and where are my biggest understanding gaps?",
    ];
  }

  return [
    "Summarize this study material. Show the main concepts, definitions, and what I should revise first.",
    "Turn this file into connected notes and tell me the likely exam topics, weak points, and next study steps.",
    "What matters most in this source, and what should I memorize, understand, or practice next?",
  ];
}

function suggestionSetForZettelkasten(supportedCount: number): string[] {
  const sourceScope = supportedCount >= 2 ? "these sources" : "this source";
  return [
    `Turn ${sourceScope} into source notes, identify the strongest idea links, and suggest permanent notes I should keep.`,
    `Build a Zettelkasten chain from ${sourceScope}. Show source notes, tension points, and candidate permanent notes.`,
    `What ideas here should become permanent notes, and which existing themes should they connect to?`,
  ];
}

function cleanBadgeList(seed: OnboardingQuickStartSeed | null | undefined): string[] {
  return (seed?.focusBadges ?? [])
    .map((badge) => badge.trim())
    .filter((badge) => badge.length > 0);
}

function buildFocusLabel(seed: OnboardingQuickStartSeed | null | undefined): string | null {
  if (seed && isReportQuickStartSeed(seed)) {
    const metadata = extractReportSeedMetadata(seed);
    return [
      metadata.label,
      metadata.courseTag,
      metadata.sessionId ? `guided session ${metadata.sessionId}` : null,
      metadata.routeSource ? `from ${metadata.routeSource.replace(/_/g, " ")}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .slice(0, 4)
      .join(", ") || null;
  }
  const badges = cleanBadgeList(seed);
  if (badges.length === 0) return null;
  if (badges.length === 1) return badges[0] ?? null;
  if (badges.length === 2) return `${badges[0]} and ${badges[1]}`;
  return `${badges.slice(0, 2).join(", ")}, and ${badges.length - 2} more`;
}

function hasLinkedIdeasFocus(seed: OnboardingQuickStartSeed | null | undefined): boolean {
  return cleanBadgeList(seed).some((badge) => badge.toLowerCase().includes("lens linked ideas"));
}

function hasWeekOrCourseFocus(seed: OnboardingQuickStartSeed | null | undefined): boolean {
  return cleanBadgeList(seed).some((badge) => (
    badge.toLowerCase().startsWith("course:")
    || badge.toLowerCase().startsWith("week:")
    || badge.toLowerCase().startsWith("lecture:")
  ));
}

function medicalTopologyPromptPrefix(seed: OnboardingQuickStartSeed | null | undefined): string | null {
  const badges = cleanBadgeList(seed).map((badge) => badge.toLowerCase());
  if (!badges.includes("medical_topology_coverage")) return null;
  if (badges.includes("topology_gap:needs_locator")) {
    return "Continue this medical topology coverage run by fixing source-locator gaps before treating cloze or vignette rows as source-grounded.";
  }
  if (badges.includes("topology_gap:overload")) {
    return "Continue this medical topology coverage run by reducing review load, upgrading shallow cards, and avoiding unnecessary new cards.";
  }
  if (badges.includes("topology_gap:source_only")) {
    return "Continue this medical topology coverage run by generating only the missing source-backed cloze or short-vignette rows.";
  }
  return "Continue this medical topology coverage run using the same concept tags, source-locator state, and conservative readiness evidence.";
}

function usesRetainedContext(seed: OnboardingQuickStartSeed | null | undefined): boolean {
  return seed?.flowKind === "grounded_followup" || seed?.flowKind === "adjacent_source_planning";
}

function contextualReportPrompts(seed: OnboardingQuickStartSeed): string[] {
  const metadata = extractReportSeedMetadata(seed);
  const kind = metadata.label ?? reportLabelFromQuickStartSeed(seed) ?? "study report";
  const medicalTopologyPrompt = medicalTopologyPromptPrefix(seed);
  const sourceNeeds = metadata.sourceNeeds.length ? metadata.sourceNeeds : reportSourceNeedsFromQuickStartSeed(seed);
  const sourceClause = sourceNeeds.length
    ? ` If evidence is thin, ask only for ${sourceNeeds.join(" or ")}.`
    : " If evidence is thin, ask for the single highest-value missing source.";
  const scopeClause = [
    metadata.courseTag ? ` Keep it scoped to ${metadata.courseTag}.` : "",
    metadata.sessionId ? ` Treat guided session ${metadata.sessionId} as carryover evidence, not mastery proof.` : "",
  ].join("");
  if (medicalTopologyPrompt) {
    return [
      `${medicalTopologyPrompt}${scopeClause}${sourceClause}`,
      `Create this ${kind} with medical topology scope preserved, source caveats visible, and no copied proprietary QBank wording.`,
      "Use the loaded report prompt, preserve concept supertags and source locators, and tell me whether the next action is cards, attempt evidence, overload reduction, or a timed vignette block.",
    ];
  }
  return [
    `Generate the loaded ${kind} from my retained study context and any attached sources.${scopeClause}${sourceClause}`,
    `Create this ${kind} with source-backed caveats, a first 15-minute step, and the next 48 hours.`,
    `Use the loaded report prompt, prioritize linked notes and supertags, and tell me exactly which sources or graph cards you used.`,
  ];
}

function contextualSourcePrompts(
  supportedCount: number,
  seed: OnboardingQuickStartSeed | null | undefined,
): string[] {
  const focusLabel = buildFocusLabel(seed);
  if (seed && isReportQuickStartSeed(seed)) return contextualReportPrompts(seed);
  if (!focusLabel) return suggestionSetForSourceCount(supportedCount);
  if (seed?.flowKind === "adjacent_source_planning") {
    return [
      `Using ${focusLabel}, tell me the single best adjacent source I should attach next, why it matters, and what question I should ask after it is attached.`,
      `From ${focusLabel}, identify the narrowest next lecture, reading, note, or recording that will strengthen overlap and retrieval instead of widening scope.`,
      `What is the highest-value next source for ${focusLabel}, and how would it improve supertags, linked ideas, and revision coverage?`,
    ];
  }
  if (usesRetainedContext(seed) && supportedCount === 0) {
    return [
      `Using ${focusLabel}, answer from the retained study context and tell me what matters most next.`,
      `From ${focusLabel}, summarize the strongest concepts, weak spots, and the best next revision step without requiring another upload first.`,
      `What is the most important grounded follow-up I can get from ${focusLabel} right now, and where are the main gaps?`,
    ];
  }

  if (hasLinkedIdeasFocus(seed) || supportedCount >= 2) {
    return [
      `Using ${focusLabel}, compare the strongest overlaps, what is new across the sources, and what I should revise first.`,
      `From ${focusLabel}, turn the material into connected notes and show the conflicts, patterns, and exam risks.`,
      `What are the biggest gaps, contradictions, or weak spots across ${focusLabel}?`,
    ];
  }

  if (hasWeekOrCourseFocus(seed)) {
    return [
      `Using ${focusLabel}, summarize what matters most, the examinable ideas, and what I should revise first.`,
      `From ${focusLabel}, pull out the key concepts, definitions, and likely exam angles.`,
      `What am I most likely to be tested on in ${focusLabel}, and what should I understand versus memorize?`,
    ];
  }

  return [
    `Using ${focusLabel}, summarize the main concepts, definitions, and what I should revise first.`,
    `Turn ${focusLabel} into connected notes and tell me the likely exam topics, weak points, and next study steps.`,
    `What matters most in ${focusLabel}, and what should I memorize, understand, or practice next?`,
  ];
}

function contextualZettelkastenPrompts(
  supportedCount: number,
  seed: OnboardingQuickStartSeed | null | undefined,
): string[] {
  const focusLabel = buildFocusLabel(seed);
  if (seed && isReportQuickStartSeed(seed)) return contextualReportPrompts(seed);
  if (!focusLabel) return suggestionSetForZettelkasten(supportedCount);
  if (seed?.flowKind === "adjacent_source_planning") {
    return [
      `Using ${focusLabel}, tell me the single best adjacent source I should attach next to deepen the same note chain and explain why.`,
      `From ${focusLabel}, identify the narrowest next source that will strengthen this Zettelkasten branch instead of creating a disconnected note.`,
      `What source should I add next for ${focusLabel}, and how would it improve source notes, permanent-note candidates, and branch continuity?`,
    ];
  }
  const sourceScope = supportedCount >= 2 ? `these sources from ${focusLabel}` : `${focusLabel}`;
  return [
    `Turn ${sourceScope} into source notes, identify the strongest idea links, and suggest permanent notes I should keep.`,
    `Build a Zettelkasten chain from ${sourceScope}. Show source notes, tension points, and candidate permanent notes.`,
    `What ideas in ${focusLabel} should become permanent notes, and which themes should they connect to next?`,
  ];
}

export function buildStudyComposerGuidance(
  input: StudyComposerGuidanceInput,
): StudyComposerGuidance {
  const recommendedKnowledgeMode = DEFAULT_RECOMMENDED_KNOWLEDGE_MODE;
  const recommendedRetentionMode = DEFAULT_RECOMMENDED_RETENTION_MODE;
  const recommendationMatchesCurrent =
    input.knowledgeMode === recommendedKnowledgeMode
    && input.retentionMode === recommendedRetentionMode;
  const supportedLabel =
    input.supportedCount >= 2
      ? `${input.supportedCount} readable study sources`
      : input.supportedCount === 1
        ? "1 readable study source"
        : `${input.attachedCount} attached file${input.attachedCount === 1 ? "" : "s"}`;
  const unsupportedSentence =
    input.unsupportedCount > 0
      ? ` ${input.unsupportedCount} file${input.unsupportedCount === 1 ? " is" : "s are"} not readable yet, so OmnyID will focus on the supported material first.`
      : "";

  const recommendationBody = recommendationMatchesCurrent
    ? `This is the best default for stressed uni students: keep the connected knowledge, drop the original file, and make ${supportedLabel} reusable in Files, supertags, and Linked ideas.${unsupportedSentence}`
    : `Recommended for the first study run: use Connected notes plus Keep extracted notes only. That keeps ${supportedLabel} searchable through supertags and linked retrieval without storing the original upload by default.${unsupportedSentence}`;
  const focusLabel = buildFocusLabel(input.quickStartSeed);
  const suggestionHeading = focusLabel
    ? "Ask from the current study focus"
    : "Ask this now";
  const suggestionDetail = focusLabel
    ? `One tap fills the prompt with a grounded question that stays on ${focusLabel}.`
    : "One tap fills the prompt with a grounded study question.";

  return {
    recommendedKnowledgeMode,
    recommendedRetentionMode,
    recommendationMatchesCurrent,
    recommendationTitle: recommendationMatchesCurrent
      ? "Recommended student setup is active"
      : "Recommended for the first study run",
    recommendationBody,
    suggestionHeading,
    suggestionDetail,
    suggestedPrompts:
      input.knowledgeMode === "zettelkasten"
        ? contextualZettelkastenPrompts(input.supportedCount, input.quickStartSeed)
        : contextualSourcePrompts(input.supportedCount, input.quickStartSeed),
  };
}
