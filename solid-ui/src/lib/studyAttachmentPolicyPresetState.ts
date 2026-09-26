// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";
import type { StudentQuickStartIntent } from "@/lib/onboardingQuickStart";

export type StudyAttachmentPolicyPreset = {
  id: "commercial_default" | "exact_file_recall" | "zettelkasten_memory" | "private_one_off";
  label: string;
  detail: string;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  tone: "emerald" | "sky" | "violet" | "amber";
  recommended: boolean;
  selected: boolean;
  valueLabel: string;
  storageLabel: string;
  starterIntent: StudentQuickStartIntent;
};

export type StudyAttachmentPolicyPresetState = {
  headline: string;
  detail: string;
  presets: StudyAttachmentPolicyPreset[];
};

function presetSelected(
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
  preset: Pick<StudyAttachmentPolicyPreset, "knowledgeMode" | "retentionMode">,
): boolean {
  return knowledgeMode === preset.knowledgeMode && retentionMode === preset.retentionMode;
}

export function buildStudyAttachmentPolicyPresetState(input: {
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): StudyAttachmentPolicyPresetState {
  const presets: StudyAttachmentPolicyPreset[] = [
    {
      id: "commercial_default",
      label: "Best default for most students",
      detail: "Connected notes + keep extracted notes only",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      tone: "emerald",
      recommended: true,
      starterIntent: "first_upload",
      selected: presetSelected(input.knowledgeMode, input.retentionMode, {
        knowledgeMode: "connected_notes",
        retentionMode: "keep_extracted_only",
      }),
      valueLabel: "The answer compounds into searchable study memory, supertags, and graph links without forcing full-file storage.",
      storageLabel: "Preserves the study value while keeping storage anxiety lower.",
    },
    {
      id: "exact_file_recall",
      label: "Keep the exact source files",
      detail: "Connected notes + keep file and extracted notes",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_file",
      tone: "sky",
      recommended: false,
      starterIntent: "first_upload",
      selected: presetSelected(input.knowledgeMode, input.retentionMode, {
        knowledgeMode: "connected_notes",
        retentionMode: "keep_file",
      }),
      valueLabel: "Best when the student expects to reopen the original lecture deck, reading PDF, or assignment brief later.",
      storageLabel: "Highest storage use because both the file and extracted content stay available.",
    },
    {
      id: "zettelkasten_memory",
      label: "Develop a long-term note chain",
      detail: "Zettelkasten + keep extracted notes only",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      tone: "violet",
      recommended: false,
      starterIntent: "zettelkasten_chain",
      selected: presetSelected(input.knowledgeMode, input.retentionMode, {
        knowledgeMode: "zettelkasten",
        retentionMode: "keep_extracted_only",
      }),
      valueLabel: "Best when the upload should become source notes, review queues, and stronger permanent-note development.",
      storageLabel: "Keeps the note value without retaining the original file by default.",
    },
    {
      id: "private_one_off",
      label: "Use once and keep nothing",
      detail: "Standard organization + do not keep anything",
      knowledgeMode: "standard",
      retentionMode: "keep_nothing",
      tone: "amber",
      recommended: false,
      starterIntent: "first_upload",
      selected: presetSelected(input.knowledgeMode, input.retentionMode, {
        knowledgeMode: "standard",
        retentionMode: "keep_nothing",
      }),
      valueLabel: "Best only for sensitive or disposable material when no later reuse is wanted.",
      storageLabel: "Lowest retention footprint, but Files, supertags, and graph reuse are all sacrificed.",
    },
  ];

  const selectedPreset = presets.find((preset) => preset.selected) ?? null;

  return {
    headline:
      selectedPreset?.id === "private_one_off"
        ? "Current policy is optimized for one-off privacy, not long-term study value."
        : selectedPreset?.id === "zettelkasten_memory"
          ? "Current policy is optimized for deliberate note development."
          : selectedPreset?.id === "exact_file_recall"
            ? "Current policy keeps both the exact files and the extracted study value."
            : "Current policy is optimized for immediate value and reusable study memory.",
    detail:
      selectedPreset?.id === "private_one_off"
        ? "Choose this only when the material should disappear after the answer. Otherwise, the commercial default is stronger for stressed students."
        : selectedPreset?.id === "zettelkasten_memory"
          ? "This is the right fit when the student wants structured long-term thinking, not just connected retrieval."
          : selectedPreset?.id === "exact_file_recall"
            ? "This is strongest when the original source files matter later, not only the extracted notes."
            : "For most uni students, this is the cleanest policy because it gives immediate value now and reusable study retrieval later.",
    presets,
  };
}
