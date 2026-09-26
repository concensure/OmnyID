// @locs-version: 1.0
import type { KnowledgeOrganizationMode } from "./api";
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";
import { extractReportSeedMetadata, isReportQuickStartSeed } from "./reportSeedMetadata";
import {
  courseTagFromStudyLaunchMetadata,
  normalizeStudyLaunchMetadata,
  sessionIdFromStudyLaunchMetadata,
} from "./studyLaunchMetadataState";

export type StudyPromptPath = {
  id: "summary" | "compare" | "revise" | "notes";
  label: string;
  detail: string;
  prompt: string;
  tone: "sky" | "emerald" | "violet" | "amber";
  prompts: string[];
  recommended: boolean;
};

export type StudyPromptPathState = {
  headline: string;
  supportingText: string;
  recommendedPathId: StudyPromptPath["id"] | null;
  recommendationReason: string | null;
  options: StudyPromptPath[];
};

function focusLabel(seed: OnboardingQuickStartSeed | null | undefined): string | null {
  if (seed && isReportQuickStartSeed(seed)) {
    const metadata = extractReportSeedMetadata(seed);
    const badges = (seed.focusBadges ?? []).map((badge) => badge.toLowerCase());
    const medicalTopology = badges.includes("medical_topology_coverage")
      ? badges.includes("topology_gap:needs_locator")
        ? "medical topology needs source locator"
        : badges.includes("topology_gap:overload")
          ? "medical topology review overload"
          : badges.includes("topology_gap:source_only")
            ? "medical topology source-only gap"
            : "medical topology coverage"
      : null;
    return [
      metadata.label,
      metadata.courseTag,
      metadata.sessionId ? `guided session ${metadata.sessionId}` : null,
      medicalTopology,
    ]
      .filter((value): value is string => Boolean(value))
      .slice(0, 4)
      .join(", ") || null;
  }
  const launchMetadata = normalizeStudyLaunchMetadata(seed);
  const courseTag = courseTagFromStudyLaunchMetadata(launchMetadata);
  const sessionId = sessionIdFromStudyLaunchMetadata(launchMetadata);
  const badges = (seed?.focusBadges ?? [])
    .map((badge) => badge.trim())
    .filter((badge) => {
      const normalized = badge.toLowerCase();
      return badge.length > 0
        && !normalized.startsWith("source_need:")
        && !normalized.startsWith("readiness:")
        && !normalized.startsWith("coverage:")
        && !normalized.startsWith("urgency:")
        && !normalized.startsWith("stress:")
        && !normalized.startsWith("output_format:")
        && !normalized.startsWith("route_source:");
    });
  const subjectParts = [
    courseTag,
    sessionId ? `guided session ${sessionId}` : null,
    ...badges,
  ].filter((value): value is string => Boolean(value));
  const deduped = [...new Map(subjectParts.map((value) => [value.toLowerCase(), value])).values()];
  const limited = deduped.slice(0, 4);
  if (limited.length === 0) return null;
  if (limited.length === 1) return limited[0] ?? null;
  if (limited.length === 2) return `${limited[0]} and ${limited[1]}`;
  return `${limited.slice(0, 2).join(", ")}, and ${deduped.length - 2} more`;
}

function summaryPrompt(subject: string, multiSource: boolean): string {
  return multiSource
    ? `Using ${subject}, summarize the key ideas across the sources, what matters most, and what I should revise first.`
    : `Using ${subject}, summarize the key ideas, what matters most, and what I should revise first.`;
}

function comparePrompt(subject: string): string {
  return `Using ${subject}, compare the strongest overlaps, what each source adds, and what contradictions or gaps I should review next.`;
}

function revisePrompt(subject: string): string {
  return `Using ${subject}, tell me the likely exam angles, weak spots, and the highest-priority revision steps I should take next.`;
}

function notesPrompt(subject: string, knowledgeMode: KnowledgeOrganizationMode): string {
  if (knowledgeMode === "zettelkasten") {
    return `Use ${subject} as Zettelkasten material. Turn the strongest ideas into source notes and permanent-note candidates, then show what links are still weak.`;
  }
  return `Turn ${subject} into connected notes. Pull out the main concepts, definitions, conflicts, and the best next note to keep.`;
}

function summaryPrompts(subject: string, multiSource: boolean): string[] {
  return [
    summaryPrompt(subject, multiSource),
    `Using ${subject}, explain the key concepts in plain language and tell me what matters most.`,
    `From ${subject}, give me the shortest accurate summary I can use before revision.`,
  ];
}

function comparePrompts(subject: string): string[] {
  return [
    comparePrompt(subject),
    `Using ${subject}, show where the sources agree, disagree, and leave gaps I should close.`,
    `From ${subject}, tell me what each source adds that the others miss.`,
  ];
}

function revisePrompts(subject: string): string[] {
  return [
    revisePrompt(subject),
    `Using ${subject}, tell me what I am most likely to be tested on and what I still do not understand well.`,
    `From ${subject}, prioritize the next three revision actions I should take.`,
  ];
}

function notesPrompts(subject: string, knowledgeMode: KnowledgeOrganizationMode): string[] {
  if (knowledgeMode === "zettelkasten") {
    return [
      notesPrompt(subject, knowledgeMode),
      `Using ${subject}, build source notes, tension points, and the strongest permanent-note candidates.`,
      `From ${subject}, show which ideas deserve permanent notes and which still need another source.`,
    ];
  }
  return [
    notesPrompt(subject, knowledgeMode),
    `Using ${subject}, turn the material into reusable connected notes and show the main themes.`,
    `From ${subject}, create connected notes with the best definitions, patterns, and unresolved questions.`,
  ];
}

function chooseRecommendedPath(args: {
  knowledgeMode: KnowledgeOrganizationMode;
  multiSource: boolean;
  quickStartSeed?: OnboardingQuickStartSeed | null;
}): { id: StudyPromptPath["id"]; reason: string } {
  const label = (args.quickStartSeed?.label ?? "").toLowerCase();
  const badges = (args.quickStartSeed?.focusBadges ?? []).map((badge) => badge.toLowerCase());
  const hasLinkedIdeas = badges.some((badge) => badge.includes("lens linked ideas")) || label.includes("linked ideas");
  const hasZettelkastenStage = badges.some((badge) => badge.includes("stage "));
  const hasWeekOrCourse = badges.some((badge) => (
    badge.startsWith("course:")
    || badge.startsWith("week:")
    || badge.startsWith("lecture:")
  ));
  const hasMedicalTopologyGap = badges.some((badge) =>
    badge === "medical_topology_coverage"
    || badge === "topology_gap:needs_locator"
    || badge === "topology_gap:overload"
    || badge === "topology_gap:source_only"
  );

  if (args.knowledgeMode === "zettelkasten") {
    if (hasZettelkastenStage) {
      return {
        id: "notes",
        reason: "Recommended because this focus is already in a Zettelkasten stage and the highest-value next step is to strengthen source notes and permanent-note candidates.",
      };
    }
    return {
      id: "revise",
      reason: "Recommended because this note chain still benefits from surfacing weak links before it expands further.",
    };
  }

  if (hasMedicalTopologyGap) {
    return {
      id: "revise",
      reason: "Recommended because this medical topology carryover already identifies a specific coverage, locator, or review-load gap to repair next.",
    };
  }

  if (hasLinkedIdeas || args.multiSource) {
    return {
      id: "compare",
      reason: "Recommended because this focus already spans multiple related sources, so the highest-value next step is comparing overlap, differences, and gaps.",
    };
  }

  if (hasWeekOrCourse) {
    return {
      id: "revise",
      reason: "Recommended because this focus is already narrowed to a course, week, or lecture and the highest-value next step is finding exam angles and revision priorities.",
    };
  }

  return {
    id: "summary",
    reason: "Recommended because the fastest first step is to compress the current material into the key ideas before branching into comparisons or notes.",
  };
}

export function buildStudyPromptPathState(input: {
  quickStartSeed?: OnboardingQuickStartSeed | null;
  knowledgeMode: KnowledgeOrganizationMode;
  supportedCount: number;
}): StudyPromptPathState {
  const subject = focusLabel(input.quickStartSeed) ?? "my current study material";
  const multiSource = input.supportedCount >= 2
    || (input.quickStartSeed?.label ?? "").toLowerCase().includes("compare")
    || (input.quickStartSeed?.originLabel ?? "").toLowerCase().includes("knowledge graph");
  const recommendation = chooseRecommendedPath({
    knowledgeMode: input.knowledgeMode,
    multiSource,
    quickStartSeed: input.quickStartSeed,
  });

  if (input.knowledgeMode === "zettelkasten") {
    return {
      headline: "Choose the next note-development path",
      supportingText: `Stay on ${subject} and decide whether this run should build source notes, permanent notes, or review guidance.`,
      recommendedPathId: recommendation.id,
      recommendationReason: recommendation.reason,
      options: [
        {
          id: "notes",
          label: "Build notes",
          detail: "Turn the current material into source notes and permanent-note candidates.",
          prompt: notesPrompt(subject, input.knowledgeMode),
          tone: "emerald",
          prompts: notesPrompts(subject, input.knowledgeMode),
          recommended: recommendation.id === "notes",
        },
        {
          id: "revise",
          label: "Find weak links",
          detail: "Surface tension points, missing links, and what needs another source.",
          prompt: `Using ${subject}, show the weak links, tension points, and what I should add or review before these notes become reliable.`,
          tone: "amber",
          prompts: [
            `Using ${subject}, show the weak links, tension points, and what I should add or review before these notes become reliable.`,
            `From ${subject}, tell me which notes are still fragile and what evidence or source is missing.`,
            `Using ${subject}, identify the unresolved tensions before I turn these ideas into permanent notes.`,
          ],
          recommended: recommendation.id === "revise",
        },
        {
          id: "summary",
          label: "Clarify ideas",
          detail: "Reduce the current note chain to the main ideas before linking further.",
          prompt: `Using ${subject}, clarify the main ideas in plain language before I turn them into permanent notes.`,
          tone: "sky",
          prompts: [
            `Using ${subject}, clarify the main ideas in plain language before I turn them into permanent notes.`,
            `From ${subject}, reduce the note chain to the clearest ideas worth keeping.`,
            `Using ${subject}, summarize the core ideas before I extend the chain further.`,
          ],
          recommended: recommendation.id === "summary",
        },
      ],
    };
  }

  return {
    headline: "Choose the next study path",
    supportingText: `Stay on ${subject} and choose whether this run should summarize, compare, surface revision gaps, or turn the material into stronger notes.`,
    recommendedPathId: recommendation.id,
    recommendationReason: recommendation.reason,
    options: [
      {
        id: "summary",
        label: "Summarize",
        detail: "Get the main ideas and what matters most first.",
        prompt: summaryPrompt(subject, multiSource),
        tone: "sky",
        prompts: summaryPrompts(subject, multiSource),
        recommended: recommendation.id === "summary",
      },
      ...(multiSource
        ? [{
            id: "compare" as const,
            label: "Compare",
            detail: "See overlap, differences, and what each source adds.",
            prompt: comparePrompt(subject),
            tone: "emerald" as const,
            prompts: comparePrompts(subject),
            recommended: recommendation.id === "compare",
          }]
        : []),
      {
        id: "revise",
        label: "Revision gaps",
        detail: "Find likely exam angles, weak spots, and next revision steps.",
        prompt: revisePrompt(subject),
        tone: "amber",
        prompts: revisePrompts(subject),
        recommended: recommendation.id === "revise",
      },
      {
        id: "notes",
        label: "Connected notes",
        detail: "Turn the current material into reusable connected notes.",
        prompt: notesPrompt(subject, input.knowledgeMode),
        tone: "violet",
        prompts: notesPrompts(subject, input.knowledgeMode),
        recommended: recommendation.id === "notes",
      },
    ],
  };
}
