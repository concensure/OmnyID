// @locs-version: 1.0
import {
  continueStudyFocusLabel,
  openRetainedSourcesLabel,
} from "@/lib/studyFocusActionCopy";

import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import {
  extractReportSeedMetadata,
  reportLabelFromQuickStartSeed,
  reportSourceNeedsFromQuickStartSeed,
} from "@/lib/reportSeedMetadata";
import {
  courseTagFromStudyLaunchMetadata,
  normalizeStudyLaunchMetadata,
  sessionIdFromStudyLaunchMetadata,
} from "@/lib/studyLaunchMetadataState";

export type StudyResultValuePathActionId = "files" | "graph" | "search";

export type StudyResultValuePathCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyResultValuePathState = {
  grade: "fix_retention" | "single_source_ready" | "connected_pack_ready" | "zettelkasten_ready";
  headline: string;
  detail: string;
  badge: string;
  cards: StudyResultValuePathCard[];
  primaryActionId: StudyResultValuePathActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyResultValuePathActionId | null;
  secondaryActionLabel: string | null;
};

function hasAcademicContext(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((item) =>
    Boolean(item.academicKind || item.courseTag || item.unitTag || item.chapterTag || item.weekTag || item.lectureTag),
  );
}

function hasZettelkastenStage(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((item) => Boolean(item.zettelkastenStage));
}

function firstFocusBadge(seed: OnboardingQuickStartSeed | null): string | null {
  if (seed && reportLabelFromQuickStartSeed(seed)) {
    const metadata = extractReportSeedMetadata(seed);
    return metadata.courseTag ?? metadata.label ?? null;
  }
  const launchMetadata = normalizeStudyLaunchMetadata(seed);
  const courseTag = courseTagFromStudyLaunchMetadata(launchMetadata);
  if (courseTag) return courseTag;
  const sessionId = sessionIdFromStudyLaunchMetadata(launchMetadata);
  if (sessionId) return `guided session ${sessionId}`;
  const badge = seed?.focusBadges?.find((value) => typeof value === "string" && value.trim().length > 0);
  return badge?.trim() ?? null;
}

function reportFollowThroughSentence(seed: OnboardingQuickStartSeed | null): string | null {
  const label = reportLabelFromQuickStartSeed(seed);
  if (!label) return null;
  const needs = reportSourceNeedsFromQuickStartSeed(seed);
  return needs.length > 0
    ? `Because this came from a ${label}, strengthen it next with ${needs.join(" or ")} if those sources were not already used.`
    : `Because this came from a ${label}, keep the next step tied to the report instead of switching to a generic summary.`;
}

function firstDescriptorValue(
  evidence: AttachmentGroundingEvidence,
  select: (descriptor: AttachmentGroundingEvidence["sourceDescriptors"][number]) => string | null | undefined,
): string | null {
  for (const descriptor of evidence.sourceDescriptors) {
    const value = select(descriptor)?.trim();
    if (value) return value;
  }
  return null;
}

function graphLinkTags(evidence: AttachmentGroundingEvidence): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const descriptor of evidence.sourceDescriptors) {
    for (const tag of descriptor.knowledgeGraphLinkTags ?? []) {
      const value = tag.trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      tags.push(value);
      if (tags.length >= 4) return tags;
    }
  }
  return tags;
}

function graphFocusSentence(evidence: AttachmentGroundingEvidence): string | null {
  const groupKey = firstDescriptorValue(evidence, (descriptor) => descriptor.knowledgeGraphGroupKey);
  const tags = graphLinkTags(evidence);
  if (!groupKey && tags.length === 0) return null;
  const parts = [
    groupKey ? `graph anchor ${groupKey}` : null,
    tags.length > 0 ? `linked supertags ${tags.join(", ")}` : null,
  ].filter((value): value is string => Boolean(value));
  return `Use ${parts.join(" and ")} to stay on the same connected study thread.`;
}

function zettelkastenNextAction(evidence: AttachmentGroundingEvidence): string | null {
  return firstDescriptorValue(evidence, (descriptor) => descriptor.zettelkastenNextAction);
}

function withExtraDetail(detail: string, extra: string | null): string {
  return extra ? `${detail} ${extra}` : detail;
}

export function buildStudyResultValuePathState(input: {
  evidence: AttachmentGroundingEvidence | null;
  continuationSeed: OnboardingQuickStartSeed | null;
}): StudyResultValuePathState | null {
  const evidence = input.evidence;
  if (!evidence || evidence.sourceCount === 0) return null;

  const focusBadge = firstFocusBadge(input.continuationSeed);
  const graphDetail = graphFocusSentence(evidence);
  const reportFollowThrough = reportFollowThroughSentence(input.continuationSeed);
  if (evidence.retentionMode === "keep_nothing") {
    return {
      grade: "fix_retention",
      headline: "The answer is grounded, but the reusable study system did not start yet.",
      detail: "For stressed students, the commercial-standard path is simple: rerun with kept extracted notes so Files, supertags, and linked retrieval can remember this material after the chat ends.",
      badge: "Fix retention first",
      cards: [
        {
          label: "What is missing",
          detail: "This run produced an answer, but not retained study memory. Nothing here will power Files search, supertags, or the knowledge graph afterward.",
          tone: "amber",
        },
        {
          label: "Best immediate fix",
          detail: "Repeat the same grounded question with Keep extracted notes so the result becomes reusable without forcing the student to upload and explain everything again.",
          tone: "sky",
        },
        {
          label: "Why this matters",
          detail: "Zero-maintenance connected notes only work when retained extracted content can be linked, tagged, and reopened later under time pressure.",
          tone: "violet",
        },
      ],
      primaryActionId: "search",
      primaryActionLabel: "Rerun with retention",
      secondaryActionId: null,
      secondaryActionLabel: null,
    };
  }

  if (evidence.knowledgeMode === "zettelkasten") {
    const chainReady = hasZettelkastenStage(evidence) || evidence.sourceCount > 1;
    const nextAction = zettelkastenNextAction(evidence);
    return {
      grade: "zettelkasten_ready",
      headline: chainReady
        ? "This result can continue as a reusable note branch immediately."
        : "This result started a Zettelkasten branch and needs one clean follow-through step.",
      detail: chainReady
        ? withExtraDetail(
          "OmnyID retained note-ready material with supertags and stage cues, so the next value comes from reviewing the branch, promoting stronger notes, and deepening the same topic.",
          reportFollowThrough,
        )
        : withExtraDetail(
          "The first branch exists, but it is still thin. Files and the Zettelkasten view should help the student stay on one idea instead of opening disconnected topics.",
          reportFollowThrough,
        ),
      badge: chainReady ? "Zettelkasten ready" : "Branch forming",
      cards: [
        {
          label: "Open the branch first",
          detail: withExtraDetail(
            chainReady
              ? "Use the Zettelkasten lens to inspect source-note progression, related links, and the strongest candidate for permanent-note development."
              : "Use the Zettelkasten lens to verify that the first source note is grounded before broadening the branch.",
            graphDetail,
          ),
          tone: "violet",
        },
        {
          label: "Keep the source visible",
          detail: "Files should now hold the retained source material, extracted content, and supertags behind this branch so note development stays evidence-backed.",
          tone: "sky",
        },
        {
          label: "Best next move",
          detail: nextAction
            ? `Next note move: ${nextAction}`
            : focusBadge
              ? `Continue with the same focus: ${focusBadge}. Ask the next grounded note-development question or attach one adjacent source only if it deepens the same branch.`
              : "Ask the next grounded note-development question or attach one adjacent source only if it deepens the same branch.",
          tone: "emerald",
        },
      ],
      primaryActionId: "graph",
      primaryActionLabel: "Open Zettelkasten view",
      secondaryActionId: "search",
      secondaryActionLabel: continueStudyFocusLabel("zettelkasten"),
    };
  }

  if (evidence.sourceCount >= 2 && hasAcademicContext(evidence)) {
    return {
      grade: "connected_pack_ready",
      headline: "This first answer already created a reusable connected study pack.",
      detail: withExtraDetail(
        "The student should be able to feel the value immediately: retained sources, supertags, and linked ideas are now dense enough to support faster follow-up questions without manual filing.",
        reportFollowThrough,
      ),
      badge: "Connected pack ready",
      cards: [
        {
          label: "Open linked ideas",
          detail: withExtraDetail(
            "Check where lecture material, readings, notes, or audio overlap so revision starts from the densest concepts instead of from isolated files.",
            graphDetail,
          ),
          tone: "violet",
        },
        {
          label: "Review the retained pack",
          detail: "Files should now show the extracted notes, academic metadata, and supertags that make this topic searchable later by course, week, lecture, and concept.",
          tone: "sky",
        },
        {
          label: "Stay on the same topic",
          detail: "Ask the next grounded follow-up from this same pack while the context is hot. Add another source only when it strengthens the same week or concept cluster.",
          tone: "emerald",
        },
      ],
      primaryActionId: "graph",
      primaryActionLabel: "Open Linked ideas",
      secondaryActionId: "search",
      secondaryActionLabel: "Continue this topic",
    };
  }

  return {
    grade: "single_source_ready",
    headline: "One grounded study source is ready now, and one adjacent source will make it much stronger.",
    detail: withExtraDetail(
      "This is the right lightweight first-session outcome for a student: the source is already retained and searchable, and the next step is to stay narrow so supertags and the graph strengthen instead of fragmenting.",
      reportFollowThrough,
    ),
    badge: "Single-source ready",
    cards: [
      {
        label: "Review what was kept",
        detail: "Open Files to inspect the retained extracted notes, study metadata, and supertags from this upload while the topic is still fresh.",
        tone: "sky",
      },
      {
        label: "Ask one sharper follow-up",
        detail: "Use the same retained source for likely exam topics, weak spots, examples, or revision priorities before jumping to a new class topic.",
        tone: "emerald",
      },
      {
        label: "Best way to strengthen the graph",
        detail: "Add one adjacent lecture, reading, rough note, or voice memo from the same subject next. That is the smallest move that upgrades this from storage into connected study memory.",
        tone: "violet",
      },
    ],
    primaryActionId: "files",
    primaryActionLabel: openRetainedSourcesLabel(),
    secondaryActionId: "search",
    secondaryActionLabel: "Continue this topic",
  };
}
