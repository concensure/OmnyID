// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";

export type AttachmentPolicyMomentOption = {
  mode: AttachmentRetentionMode;
  label: string;
  shortLabel: string;
  detail: string;
  selected: boolean;
  recommended: boolean;
  tone: "emerald" | "sky" | "amber";
};

export type AttachmentPolicyMomentState = {
  headline: string;
  detail: string;
  options: AttachmentPolicyMomentOption[];
};

function optionForMode(
  mode: AttachmentRetentionMode,
  selectedMode: AttachmentRetentionMode,
): AttachmentPolicyMomentOption {
  if (mode === "keep_file") {
    return {
      mode,
      label: "Keep the file in my account",
      shortLabel: "Keep file",
      detail: "Best when you want the original lecture deck, reading PDF, or assignment brief available later as well as the extracted notes.",
      selected: selectedMode === mode,
      recommended: false,
      tone: "sky",
    };
  }
  if (mode === "keep_nothing") {
    return {
      mode,
      label: "Do not keep anything",
      shortLabel: "Keep nothing",
      detail: "Use only for one-off questions. Files, extracted notes, supertags, and graph reuse all disappear after the run.",
      selected: selectedMode === mode,
      recommended: false,
      tone: "amber",
    };
  }
  return {
    mode,
    label: "Keep extracted content only",
    shortLabel: "Keep extracted",
    detail: "Best default for stressed uni students: OmnyID keeps the usable study content without forcing raw-file storage.",
    selected: selectedMode === mode,
    recommended: true,
    tone: "emerald",
  };
}

export function buildAttachmentPolicyMomentState(input: {
  attachedCount: number;
  readableCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): AttachmentPolicyMomentState | null {
  if (input.attachedCount === 0) return null;

  const knowledgeLabel =
    input.knowledgeMode === "zettelkasten"
      ? "Zettelkasten"
      : input.knowledgeMode === "connected_notes"
        ? "Connected notes"
        : "Standard notes";

  return {
    headline: "Decide what OmnyID should keep from these attachments.",
    detail:
      input.readableCount > 0
        ? `${knowledgeLabel} is ready to use ${input.readableCount} readable file${input.readableCount === 1 ? "" : "s"}. Choose whether to keep the original files, keep extracted study content only, or keep nothing after the answer is generated.`
        : `${knowledgeLabel} cannot compound yet because none of the current files are readable. You can still choose the storage policy now, then replace or convert the blocked files.`,
    options: [
      optionForMode("keep_file", input.retentionMode),
      optionForMode("keep_extracted_only", input.retentionMode),
      optionForMode("keep_nothing", input.retentionMode),
    ],
  };
}
