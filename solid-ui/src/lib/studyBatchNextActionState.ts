// @locs-version: 1.0
import { continueStudyFocusLabel } from "./studyFocusActionCopy";

import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "./api";

export type StudyBatchNextActionId =
  | "load_recommended_prompt"
  | "use_recommended_setup"
  | "add_supported_file";

export type StudyBatchNextActionState = {
  headline: string;
  detail: string;
  tone: "amber" | "sky" | "emerald";
  primaryActionId: StudyBatchNextActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyBatchNextActionId | null;
  secondaryActionLabel: string | null;
};

export function buildStudyBatchNextActionState(input: {
  attachedCount: number;
  supportedCount: number;
  unsupportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  recommendedSetupReady: boolean;
}): StudyBatchNextActionState | null {
  if (input.attachedCount === 0) return null;

  if (input.supportedCount === 0) {
    return {
      headline: "This batch is blocked until at least one study file becomes readable.",
      detail: "Use the conversion-first prompt or replace one blocked file with PDF, DOCX, Markdown, CSV, TXT, or common audio so OmnyID can build grounded notes.",
      tone: "amber",
      primaryActionId: "load_recommended_prompt",
      primaryActionLabel: "Use conversion-first prompt",
      secondaryActionId: "add_supported_file",
      secondaryActionLabel: "Add supported file",
    };
  }

  if (!input.recommendedSetupReady) {
    return {
      headline: "This batch can already produce value, but the retention setup is weaker than it should be.",
      detail: input.retentionMode === "keep_nothing"
        ? "The answer can still run now, but nothing from the batch will remain searchable afterward."
        : "Switching to Connected notes plus Keep extracted notes gives the best default retrieval path for stressed students.",
      tone: "amber",
      primaryActionId: "use_recommended_setup",
      primaryActionLabel: "Use recommended setup",
      secondaryActionId: "load_recommended_prompt",
      secondaryActionLabel: input.supportedCount >= 2
        ? "Run comparison anyway"
        : input.knowledgeMode === "zettelkasten"
          ? "Run source-note prompt"
          : "Run grounded summary",
    };
  }

  if (input.supportedCount >= 2) {
    return {
      headline: input.knowledgeMode === "zettelkasten"
        ? "This batch is ready to extend a linked note chain."
        : "This batch is ready for cross-source study synthesis.",
      detail: input.knowledgeMode === "zettelkasten"
        ? "Use the current sources to turn overlaps into source notes, note links, and permanent-note candidates."
        : "OmnyID has enough readable study material to compare overlaps, differences, and revision gaps immediately.",
      tone: "emerald",
      primaryActionId: "load_recommended_prompt",
      primaryActionLabel: input.knowledgeMode === "zettelkasten"
        ? continueStudyFocusLabel("zettelkasten")
        : "Run comparison now",
      secondaryActionId: null,
      secondaryActionLabel: null,
    };
  }

  return {
    headline: input.knowledgeMode === "zettelkasten"
      ? "This batch is ready to start a usable source note."
      : "This batch is ready for a first grounded study answer.",
    detail: input.unsupportedCount > 0
      ? "Run the readable source now. Blocked files can be converted or replaced afterward without losing momentum."
      : input.knowledgeMode === "zettelkasten"
        ? "Start with the readable source now, then add one more related file later to strengthen the chain."
        : "Run the first grounded answer now, then add one more related source later for stronger comparison.",
    tone: "sky",
    primaryActionId: "load_recommended_prompt",
    primaryActionLabel: input.knowledgeMode === "zettelkasten"
      ? continueStudyFocusLabel("zettelkasten")
      : "Run grounded summary",
    secondaryActionId: "add_supported_file",
    secondaryActionLabel: "Add one more source",
  };
}
