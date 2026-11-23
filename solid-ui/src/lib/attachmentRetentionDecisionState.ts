// @locs-version: 1.0
import type { AttachmentRetentionMode } from "@/lib/api";

export type AttachmentRetentionDecisionCard = {
  mode: AttachmentRetentionMode;
  label: string;
  tone: "emerald" | "sky" | "amber";
  recommended: boolean;
  selected: boolean;
  valueAfterRun: string;
  searchability: string;
  storageImpact: string;
};

export type AttachmentRetentionDecisionState = {
  headline: string;
  detail: string;
  cards: AttachmentRetentionDecisionCard[];
};

function cardForMode(
  mode: AttachmentRetentionMode,
  selectedMode: AttachmentRetentionMode,
): AttachmentRetentionDecisionCard {
  if (mode === "keep_extracted_only") {
    return {
      mode,
      label: "Keep extracted content only",
      tone: "emerald",
      recommended: true,
      selected: selectedMode === mode,
      valueAfterRun: "Best balance for most students: the answer compounds because OmnyID keeps extracted notes, supertags, and graph links.",
      searchability: "Searchable later in Files and reusable in linked retrieval without needing the original file.",
      storageImpact: "Lower storage footprint than keeping the original file.",
    };
  }
  if (mode === "keep_file") {
    return {
      mode,
      label: "Keep file and extracted content",
      tone: "sky",
      recommended: false,
      selected: selectedMode === mode,
      valueAfterRun: "Strong value when the student expects to reopen the exact source file, not just the extracted study content.",
      searchability: "Best for exact-file recall because both the original file and extracted notes remain available.",
      storageImpact: "Highest storage use because the original attachment remains in the account library.",
    };
  }
  return {
    mode,
    label: "Do not keep anything",
    tone: "amber",
    recommended: false,
    selected: selectedMode === mode,
    valueAfterRun: "Useful only for one-off answers. The run does not compound into retained study memory afterward.",
    searchability: "Nothing remains searchable in Files, supertags, or the knowledge graph after the run finishes.",
    storageImpact: "Lowest retention footprint because neither file nor extracted content is kept.",
  };
}

export function buildAttachmentRetentionDecisionState(
  selectedMode: AttachmentRetentionMode,
): AttachmentRetentionDecisionState {
  return {
    headline:
      selectedMode === "keep_nothing"
        ? "Current choice trades away long-term study value."
        : selectedMode === "keep_file"
          ? "Current choice preserves the exact file as well as the extracted study content."
          : "Current choice preserves study value without keeping the original file.",
    detail:
      selectedMode === "keep_nothing"
        ? "This is the weakest choice for zero-maintenance connected notes because OmnyID cannot reuse the upload after the answer is delivered."
        : selectedMode === "keep_file"
          ? "Choose this when reopening the original file matters. Otherwise, keeping extracted content only is usually the cleaner default."
          : "For most uni students, this is the commercial-standard default: enough retention for Files, supertags, and graph reuse without unnecessary file storage.",
    cards: [
      cardForMode("keep_extracted_only", selectedMode),
      cardForMode("keep_file", selectedMode),
      cardForMode("keep_nothing", selectedMode),
    ],
  };
}
