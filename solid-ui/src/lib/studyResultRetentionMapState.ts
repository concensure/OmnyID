// @locs-version: 1.0
import {
  continueStudyFocusLabel,
  openRetainedSourcesLabel,
} from "@/lib/studyFocusActionCopy";

import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import type { StudySourceMapSummary } from "@/lib/studySourceMapState";

export type StudyResultRetentionMapActionId = "files" | "graph" | "search";

export type StudyResultRetentionMapCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyResultRetentionMapState = {
  headline: string;
  detail: string;
  badge: string;
  tone: "sky" | "emerald" | "violet" | "amber";
  cards: StudyResultRetentionMapCard[];
  primaryActionId: StudyResultRetentionMapActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyResultRetentionMapActionId | null;
  secondaryActionLabel: string | null;
};

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

function descriptorGraphLinkTags(evidence: AttachmentGroundingEvidence): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const descriptor of evidence.sourceDescriptors) {
    for (const tag of descriptor.knowledgeGraphLinkTags ?? []) {
      const normalized = tag.trim();
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      tags.push(normalized);
      if (tags.length >= 4) return tags;
    }
  }
  return tags;
}

function graphContinuityDetail(evidence: AttachmentGroundingEvidence): string | null {
  const groupKey = firstDescriptorValue(evidence, (descriptor) => descriptor.knowledgeGraphGroupKey);
  const linkTags = descriptorGraphLinkTags(evidence);
  if (!groupKey && linkTags.length === 0) return null;
  const parts = [
    groupKey ? `graph anchor ${groupKey}` : null,
    linkTags.length > 0 ? `linked supertags ${linkTags.join(", ")}` : null,
  ].filter((value): value is string => Boolean(value));
  return `Graph continuity is already available through ${parts.join(" and ")}.`;
}

function zettelkastenNextActionDetail(evidence: AttachmentGroundingEvidence): string | null {
  const nextAction = firstDescriptorValue(evidence, (descriptor) => descriptor.zettelkastenNextAction);
  return nextAction ? `Next note move: ${nextAction}` : null;
}

function appendDetail(base: string, extra: string | null): string {
  return extra ? `${base} ${extra}` : base;
}

function keepNothingState(
  evidence: AttachmentGroundingEvidence,
): StudyResultRetentionMapState {
  return {
    headline: "This answer used the uploaded study material, but it did not start reusable study memory.",
    detail: "Nothing from the attachment will remain in Files, supertags, or linked retrieval after this run finishes. For stressed students, that means the value disappears unless the same source is uploaded again.",
    badge: "Transient only",
    tone: "amber",
    cards: [
      {
        label: "What OmnyID kept",
        detail: "Grounding was used for this answer only. No retained file, extracted notes, or reusable concept memory will remain after completion.",
        tone: "amber",
      },
      {
        label: "Where it lives now",
        detail: "Only in the current result. Files and Linked ideas will not show a reusable study artifact from this upload afterward.",
        tone: "sky",
      },
      {
        label: "Best recovery move",
        detail: evidence.sourceCount > 1
          ? "Rerun this same study pack with Keep extracted notes so the uploaded sources become searchable, linkable, and reusable under pressure later."
          : "Rerun this same source with Keep extracted notes so the upload becomes searchable, linkable, and reusable under pressure later.",
        tone: "violet",
      },
    ],
    primaryActionId: "search",
    primaryActionLabel: "Rerun with retention",
    secondaryActionId: null,
    secondaryActionLabel: null,
  };
}

function singleSourceState(
  evidence: AttachmentGroundingEvidence,
  summary: StudySourceMapSummary | null,
): StudyResultRetentionMapState {
  const findabilityDetail = summary?.retrievalSummary
    ?? "Retained extracted notes, study metadata, and supertags now make this source easier to reopen by concept instead of filename alone.";
  const graphDetail = graphContinuityDetail(evidence);
  return {
    headline: "The first study source is retained and should already be reusable.",
    detail: "This is the right first-session outcome: the student should be able to reopen the material in Files, see how it was classified, and continue from the same topic without starting over.",
    badge: "Retained source ready",
    tone: "sky",
    cards: [
      {
        label: "What OmnyID kept",
        detail: evidence.retentionMode === "keep_file"
          ? "The original file and its extracted study content were retained."
          : "The extracted study content was retained without keeping the original file.",
        tone: "emerald",
      },
      {
        label: "Where it lives now",
        detail: "Files should show the retained study material, and the same topic can continue from search without re-uploading the source.",
        tone: "sky",
      },
      {
        label: "How it stays searchable",
        detail: appendDetail(findabilityDetail, graphDetail),
        tone: "violet",
      },
    ],
    primaryActionId: "files",
    primaryActionLabel: openRetainedSourcesLabel(),
    secondaryActionId: "search",
    secondaryActionLabel: continueStudyFocusLabel(evidence.knowledgeMode),
  };
}

function connectedPackState(
  evidence: AttachmentGroundingEvidence,
  summary: StudySourceMapSummary | null,
): StudyResultRetentionMapState {
  const graphDetail = graphContinuityDetail(evidence);
  return {
    headline: "The uploaded study pack is now retained as one connected study set.",
    detail: "This is where students should feel immediate value: multiple sources have been kept, classified, and linked so follow-up questions can use the same pack instead of rebuilding context manually.",
    badge: "Connected study pack",
    tone: "emerald",
    cards: [
      {
        label: "What OmnyID kept",
        detail: evidence.retentionMode === "keep_file"
          ? "The uploaded files and their extracted study content were retained together."
          : "The extracted study content from the uploaded pack was retained together without keeping every original file.",
        tone: "emerald",
      },
      {
        label: "Where it lives now",
        detail: appendDetail(
          "Files should show the retained pack, while Linked ideas should reveal overlap across lecture material, readings, rough notes, or transcripts.",
          graphDetail,
        ),
        tone: "sky",
      },
      {
        label: "How it stays searchable",
        detail: summary?.retrievalSummary
          ?? "Supertags, academic metadata, and graph links now make the pack searchable by course, week, lecture, and concept instead of folder location.",
        tone: "violet",
      },
    ],
    primaryActionId: "graph",
    primaryActionLabel: evidence.knowledgeMode === "zettelkasten" ? "Open Zettelkasten view" : "Open Linked ideas",
    secondaryActionId: "files",
    secondaryActionLabel: openRetainedSourcesLabel(),
  };
}

function zettelkastenState(
  evidence: AttachmentGroundingEvidence,
  summary: StudySourceMapSummary | null,
): StudyResultRetentionMapState {
  const graphDetail = graphContinuityDetail(evidence);
  const nextActionDetail = zettelkastenNextActionDetail(evidence);
  return {
    headline: "This upload was retained as note material that can grow into a Zettelkasten branch.",
    detail: "The student does not need to hand-build the branch structure first. OmnyID has already kept the source-backed material, supertags, and note-stage cues needed for follow-through.",
    badge: "Zettelkasten retained",
    tone: "violet",
    cards: [
      {
        label: "What OmnyID kept",
        detail: evidence.retentionMode === "keep_file"
          ? "The file and its extracted note material were retained for source-note and permanent-note development."
          : "The extracted note material was retained for source-note and permanent-note development without keeping the full file.",
        tone: "emerald",
      },
      {
        label: "Where it lives now",
        detail: appendDetail(
          "Files should hold the retained source-backed material, while the Zettelkasten graph view should expose note stages and related branches.",
          graphDetail,
        ),
        tone: "sky",
      },
      {
        label: "How it stays searchable",
        detail: appendDetail(
          summary?.retrievalSummary
            ?? "Supertags, stage labels, and graph links keep the branch searchable as a chain of developing notes rather than a loose upload.",
          nextActionDetail,
        ),
        tone: "violet",
      },
    ],
    primaryActionId: "graph",
    primaryActionLabel: "Open Zettelkasten view",
    secondaryActionId: "files",
    secondaryActionLabel: openRetainedSourcesLabel(),
  };
}

export function buildStudyResultRetentionMapState(input: {
  evidence: AttachmentGroundingEvidence | null;
  summary: StudySourceMapSummary | null;
}): StudyResultRetentionMapState | null {
  const evidence = input.evidence;
  if (!evidence || evidence.sourceCount === 0) return null;
  if (evidence.retentionMode === "keep_nothing") return keepNothingState(evidence);
  if (evidence.knowledgeMode === "zettelkasten") return zettelkastenState(evidence, input.summary);
  if (evidence.sourceCount >= 2) return connectedPackState(evidence, input.summary);
  return singleSourceState(evidence, input.summary);
}
