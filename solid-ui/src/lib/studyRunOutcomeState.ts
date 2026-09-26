// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "./attachmentGroundingEvidence";

export type StudyRunOutcomeActionId = "files" | "graph" | "search";

export type StudyRunOutcomeCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyRunOutcomeState = {
  headline: string;
  detail: string;
  badge: string;
  cards: StudyRunOutcomeCard[];
  nextStepLabel: string;
  primaryActionId: StudyRunOutcomeActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyRunOutcomeActionId | null;
  secondaryActionLabel: string | null;
};

function sourceScope(evidence: AttachmentGroundingEvidence): string {
  if (evidence.sourceCount === 1) {
    return evidence.sourceLabels[0] ?? "your uploaded study source";
  }
  return `${evidence.sourceCount} uploaded study sources`;
}

function storageDetail(evidence: AttachmentGroundingEvidence): string {
  if (evidence.retentionMode === "keep_file") {
    return "The original files stay in Files together with extracted notes, supertags, and retrieval metadata.";
  }
  if (evidence.retentionMode === "keep_nothing") {
    return evidence.cleanupStatus === "complete"
      ? "The original files and extracted content were removed after the answer, so nothing remains to reuse."
      : "This run is temporary only. OmnyID answers now, then removes the file and extracted content after cleanup finishes.";
  }
  return "The original files were dropped, but the extracted notes, supertags, and source links remain reusable.";
}

function graphDetail(evidence: AttachmentGroundingEvidence): string {
  if (evidence.knowledgeMode === "zettelkasten") {
    const staged = evidence.sourceDescriptors.filter((item) => item.zettelkastenStage);
    return staged.length > 0
      ? "Supertags and note stages can now extend a deliberate note chain instead of leaving this upload as an isolated summary."
      : "OmnyID can use supertags and extracted note units to start a source-note chain from this upload.";
  }
  if (evidence.knowledgeMode === "connected_notes") {
    return evidence.sourceCount > 1
      ? "Supertags and linked ideas can connect these sources across course, week, lecture, and concept boundaries for later retrieval."
      : "The first source is now easier to reuse, and the next adjacent lecture, reading, or note can attach to the same supertag cluster.";
  }
  return "The source is organized for later retrieval, but without the stronger connected-notes overlay.";
}

function nextStepLabel(evidence: AttachmentGroundingEvidence): string {
  if (evidence.retentionMode === "keep_nothing") {
    return "Best next step: switch the next upload to Keep extracted notes only so the student gets compounding value instead of a one-off answer.";
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return "Best next step: open the Zettelkasten view, review the strongest linked note, then add one adjacent source so the chain grows instead of restarting.";
  }
  if (evidence.sourceCount > 1) {
    return "Best next step: open the linked study graph, follow the strongest supertag cluster, and ask the next revision question from that cluster.";
  }
  return "Best next step: open retained sources, confirm the first reusable note is grounded correctly, then add one adjacent lecture, reading, or scratch note.";
}

function actions(evidence: AttachmentGroundingEvidence): Pick<
  StudyRunOutcomeState,
  "primaryActionId" | "primaryActionLabel" | "secondaryActionId" | "secondaryActionLabel"
> {
  if (evidence.retentionMode === "keep_nothing") {
    return {
      primaryActionId: "search",
      primaryActionLabel: "Run next upload with memory on",
      secondaryActionId: null,
      secondaryActionLabel: null,
    };
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return {
      primaryActionId: "graph",
      primaryActionLabel: "Open Zettelkasten view",
      secondaryActionId: "files",
      secondaryActionLabel: "Open retained sources",
    };
  }
  if (evidence.sourceCount > 1 || evidence.knowledgeMode === "connected_notes") {
    return {
      primaryActionId: "graph",
      primaryActionLabel: evidence.knowledgeMode === "connected_notes" ? "Open linked study graph" : "Open knowledge graph",
      secondaryActionId: evidence.retentionMode === "keep_file" || evidence.retentionMode === "keep_extracted_only"
        ? "files"
        : null,
      secondaryActionLabel: evidence.retentionMode === "keep_file" || evidence.retentionMode === "keep_extracted_only"
        ? "Open retained sources"
        : null,
    };
  }
  return {
    primaryActionId: "files",
    primaryActionLabel: "Open retained sources",
    secondaryActionId: "search",
    secondaryActionLabel: "Ask the next grounded question",
  };
}

export function buildStudyRunOutcomeState(
  evidence: AttachmentGroundingEvidence | null,
): StudyRunOutcomeState | null {
  if (!evidence || evidence.sourceCount <= 0) return null;
  const action = actions(evidence);
  return {
    headline:
      evidence.retentionMode === "keep_nothing"
        ? "This study run delivered an answer, but it did not create reusable memory."
        : evidence.knowledgeMode === "zettelkasten"
          ? "This upload can now become part of a growing note chain."
          : evidence.knowledgeMode === "connected_notes"
            ? "This study run created reusable connected memory."
            : "This study run created a reusable organized source.",
    detail:
      evidence.retentionMode === "keep_nothing"
        ? `OmnyID used ${sourceScope(evidence)} for this answer only. Students can feel relief now, but the next session will not inherit this context unless retention is changed.`
        : evidence.knowledgeMode === "zettelkasten"
          ? `OmnyID used ${sourceScope(evidence)} to answer now and leave behind material that can be developed into source notes, permanent notes, and supertag-guided branches.`
          : evidence.knowledgeMode === "connected_notes"
            ? `OmnyID used ${sourceScope(evidence)} to answer now and keep the reusable parts available through files, supertags, and linked ideas for the next study session.`
            : `OmnyID used ${sourceScope(evidence)} to answer now and keep the retained material searchable for later grounded reuse.`,
    badge:
      evidence.retentionMode === "keep_nothing"
        ? "One-off answer"
        : evidence.knowledgeMode === "zettelkasten"
          ? "Zettelkasten ready"
          : evidence.knowledgeMode === "connected_notes"
            ? "Connected study memory"
            : "Reusable source",
    cards: [
      {
        label: "What stays after this run",
        detail: storageDetail(evidence),
        tone: evidence.retentionMode === "keep_nothing" ? "amber" : "emerald",
      },
      {
        label: evidence.knowledgeMode === "zettelkasten" ? "How the chain grows" : "How OmnyID links this",
        detail: graphDetail(evidence),
        tone: evidence.knowledgeMode === "zettelkasten" ? "violet" : "sky",
      },
      {
        label: "Why this scales",
        detail: evidence.retentionMode === "keep_nothing"
          ? "Nothing compounds from this run. The next upload starts from scratch unless the student chooses a retained mode."
          : "Supertags keep related material clustered so Files search, linked-idea retrieval, and future synthesis can grow without turning into manual folder maintenance.",
        tone: evidence.retentionMode === "keep_nothing" ? "amber" : "emerald",
      },
    ],
    nextStepLabel: nextStepLabel(evidence),
    primaryActionId: action.primaryActionId,
    primaryActionLabel: action.primaryActionLabel,
    secondaryActionId: action.secondaryActionId,
    secondaryActionLabel: action.secondaryActionLabel,
  };
}
