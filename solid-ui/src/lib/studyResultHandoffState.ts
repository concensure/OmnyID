// @locs-version: 1.0
import {
  continueStudyFocusLabel,
  openRetainedSourcesLabel,
} from "@/lib/studyFocusActionCopy";

import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";

export type StudyResultHandoffActionId = "files" | "graph" | "search";

export type StudyResultHandoffStep = {
  id: string;
  label: string;
  detail: string;
  actionId: StudyResultHandoffActionId;
  actionLabel: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyResultHandoffState = {
  headline: string;
  detail: string;
  badge: string;
  steps: StudyResultHandoffStep[];
};

function hasAcademicContext(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((item) =>
    Boolean(item.academicKind || item.courseTag || item.unitTag || item.chapterTag || item.weekTag || item.lectureTag),
  );
}

function hasZettelkastenStage(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((item) => Boolean(item.zettelkastenStage));
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

function graphContinuitySentence(evidence: AttachmentGroundingEvidence): string | null {
  const groupKey = firstDescriptorValue(evidence, (descriptor) => descriptor.knowledgeGraphGroupKey);
  const tags = graphLinkTags(evidence);
  if (!groupKey && tags.length === 0) return null;
  const parts = [
    groupKey ? `graph anchor ${groupKey}` : null,
    tags.length > 0 ? `linked supertags ${tags.join(", ")}` : null,
  ].filter((value): value is string => Boolean(value));
  return `Use ${parts.join(" and ")} to keep the next step attached to the same study thread.`;
}

function nextNoteMoveSentence(evidence: AttachmentGroundingEvidence): string | null {
  const nextAction = firstDescriptorValue(evidence, (descriptor) => descriptor.zettelkastenNextAction);
  return nextAction ? `Next note move: ${nextAction}` : null;
}

function descriptorSearchText(evidence: AttachmentGroundingEvidence): string {
  return evidence.sourceDescriptors
    .flatMap((descriptor) => [
      descriptor.title,
      descriptor.kindLabel,
      descriptor.academicKind,
      descriptor.academicSummary,
      descriptor.courseTag,
      descriptor.unitTag,
      descriptor.chapterTag,
      descriptor.weekTag,
      descriptor.lectureTag,
      descriptor.knowledgeGraphGroupKey,
      ...(descriptor.knowledgeGraphLinkTags ?? []),
    ])
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function likelyReportFollowThrough(evidence: AttachmentGroundingEvidence): string | null {
  const text = descriptorSearchText(evidence);
  if (/\b(assignment|assessment|brief|rubric|marking|criteria|essay)\b/.test(text)) {
    return "If this was for an assignment report, strengthen it next with the brief, rubric, and one relevant source before writing final prose.";
  }
  if (/\b(exam|quiz|practice|past paper|revision|test)\b/.test(text)) {
    return "If this was for exam preparation, strengthen it next with assessment scope, practice material, and the weakest lecture topic.";
  }
  if (/\b(week|lecture|tutorial|reading|slides)\b/.test(text)) {
    return "If this was for a weekly revision report, keep the next source in the same course/week so the graph gets denser instead of broader.";
  }
  return null;
}

function appendDetail(base: string, extra: string | null): string {
  return extra ? `${base} ${extra}` : base;
}

export function buildStudyResultHandoffState(
  evidence: AttachmentGroundingEvidence | null,
): StudyResultHandoffState | null {
  if (!evidence || evidence.sourceCount === 0) return null;
  const graphDetail = graphContinuitySentence(evidence);
  const nextNoteMove = nextNoteMoveSentence(evidence);
  const reportFollowThrough = likelyReportFollowThrough(evidence);

  if (evidence.retentionMode === "keep_nothing") {
    return {
      headline: "Turn this one-off answer into reusable study memory.",
      detail: "The answer is grounded, but the upload will disappear after this chat. The fastest fix is to rerun with retained extracted notes, then continue from the reusable result.",
      badge: "Needs retention",
      steps: [
        {
          id: "rerun",
          label: "Rerun with kept extracted notes",
          detail: "Repeat the same grounded question, but keep extracted notes on so Files, supertags, and the graph can reuse the material afterward.",
          actionId: "search",
          actionLabel: "Rerun with retention",
          tone: "amber",
        },
      ],
    };
  }

  if (evidence.knowledgeMode === "zettelkasten") {
    return {
      headline: hasZettelkastenStage(evidence)
        ? "This result can continue straight into note development."
        : "This result started a note chain and needs one follow-through step.",
      detail: hasZettelkastenStage(evidence)
        ? appendDetail(
          "The retained material is already organized for source-note or permanent-note progression, so the next value comes from strengthening the chain, not re-uploading from scratch.",
          reportFollowThrough,
        )
        : appendDetail(
          "The material is retained, but the next jump in value comes from reviewing the note chain and adding one adjacent source or follow-up question.",
          reportFollowThrough,
        ),
      badge: hasZettelkastenStage(evidence) ? "Note chain ready" : "Chain developing",
      steps: [
        {
          id: "graph",
          label: "Inspect the Zettelkasten chain",
          detail: appendDetail(
            "Open the Zettelkasten view to review linked notes, source-note progression, and any weak links before broadening the topic.",
            graphDetail,
          ),
          actionId: "graph",
          actionLabel: "Open Zettelkasten view",
          tone: "emerald",
        },
        {
          id: "files",
          label: "Review the retained source material",
          detail: "Check the retained source notes or extracted material in Files so the note chain stays grounded to the original study context.",
          actionId: "files",
          actionLabel: openRetainedSourcesLabel(),
          tone: "sky",
        },
        {
          id: "search",
          label: "Continue the same thought",
          detail: nextNoteMove
            ?? "Ask the next grounded note-development question from the same material instead of starting a fresh, unrelated study run.",
          actionId: "search",
          actionLabel: continueStudyFocusLabel("zettelkasten"),
          tone: "violet",
        },
      ],
    };
  }

  if (evidence.sourceCount >= 2 && hasAcademicContext(evidence)) {
    return {
      headline: "This first answer already created a usable study loop.",
      detail: appendDetail(
        "You have enough retained study context for immediate follow-through: inspect the overlap, review the retained pack, then ask the next grounded question from the same topic.",
        reportFollowThrough,
      ),
      badge: "Immediate study loop",
      steps: [
        {
          id: "graph",
          label: "Inspect overlap first",
          detail: appendDetail(
            "Open Linked ideas to see where lecture, reading, notes, or audio agreed, diverged, or left revision gaps.",
            graphDetail,
          ),
          actionId: "graph",
          actionLabel: "Open Linked ideas",
          tone: "violet",
        },
        {
          id: "files",
          label: "Review the retained study pack",
          detail: "Open Files to inspect the extracted notes, classifications, and supertags behind this answer while the topic is still fresh.",
          actionId: "files",
          actionLabel: openRetainedSourcesLabel(),
          tone: "sky",
        },
        {
          id: "search",
          label: "Ask the next grounded follow-up",
          detail: "Continue from the same study pack to get revision priorities, likely exam angles, or the next comparison without re-explaining the files.",
          actionId: "search",
          actionLabel: "Continue this topic",
          tone: "emerald",
        },
      ],
    };
  }

  return {
    headline: "This answer is useful now and can become a stronger study trail next.",
    detail: appendDetail(
      "One retained source is already enough to review in Files. The next jump in value comes from either adding one related source or continuing the same topic with a more specific follow-up.",
      reportFollowThrough,
    ),
    badge: "Single-source handoff",
    steps: [
      {
        id: "files",
        label: "Review the retained source",
        detail: "Open Files to inspect what OmnyID kept from the upload, including extracted notes, study metadata, and supertags.",
        actionId: "files",
        actionLabel: openRetainedSourcesLabel(),
        tone: "sky",
      },
      {
        id: "search",
        label: "Ask one sharper follow-up",
        detail: "Continue the same topic with a grounded question about concepts, examples, revision priorities, or likely weak spots.",
        actionId: "search",
        actionLabel: "Continue this topic",
        tone: "emerald",
      },
      {
        id: "graph",
        label: "Strengthen the graph with the next upload",
        detail: appendDetail(
          "After you add one related lecture, reading, or note, return to Linked ideas so the graph can compare sources instead of holding just one anchor.",
          graphDetail,
        ),
        actionId: "graph",
        actionLabel: "Open study graph",
        tone: "violet",
      },
    ],
  };
}
