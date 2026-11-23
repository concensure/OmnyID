// @locs-version: 1.0
import type {
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
} from "./api";

export type KnowledgeModeOption = {
  value: KnowledgeOrganizationMode;
  label: string;
  title: string;
  description: string;
  impact: string;
};

export type AttachmentRetentionOption = {
  value: AttachmentRetentionMode;
  label: string;
  title: string;
  description: string;
  impact: string;
};

export const KNOWLEDGE_MODE_OPTIONS: readonly KnowledgeModeOption[] = [
  {
    value: "connected_notes",
    label: "Connected notes",
    title: "Automatic cross-linking",
    description: "Links the uploaded material into broader study memory automatically.",
    impact: "Best default for stressed uni students who want lecture notes, readings, and ideas connected without manual filing.",
  },
  {
    value: "zettelkasten",
    label: "Zettelkasten",
    title: "Deliberate note development",
    description: "Treats uploads as source material for source notes, review queues, and permanent note chains.",
    impact: "Best when the student wants to develop arguments, essays, or long-term ideas rather than only summarize files.",
  },
  {
    value: "standard",
    label: "Organize normally",
    title: "Simple storage and retrieval",
    description: "Keeps the material in OmnyID without the stronger connected-notes overlay.",
    impact: "Best when the student only wants a one-off answer or lighter organization.",
  },
] as const;

export const ATTACHMENT_RETENTION_OPTIONS: readonly AttachmentRetentionOption[] = [
  {
    value: "keep_extracted_only",
    label: "Keep extracted notes only",
    title: "Save the knowledge, not the original file",
    description: "Stores extracted study content, links, and tags while dropping the original attachment.",
    impact: "Best default for privacy-conscious students who still want connected notes and later retrieval.",
  },
  {
    value: "keep_file",
    label: "Keep file and extracted notes",
    title: "Save everything for later reuse",
    description: "Stores the original file in account storage together with extracted notes and links.",
    impact: "Best when the student expects to reopen the exact file later from the Files library.",
  },
  {
    value: "keep_nothing",
    label: "Do not keep anything",
    title: "Use once, then delete",
    description: "Uses the upload for this answer only, then removes both the original file and extracted content.",
    impact: "Best for sensitive or temporary material when the student wants no retained copy afterward.",
  },
] as const;

export function knowledgeModeOption(
  mode: KnowledgeOrganizationMode,
): KnowledgeModeOption {
  return KNOWLEDGE_MODE_OPTIONS.find((option) => option.value === mode)
    ?? KNOWLEDGE_MODE_OPTIONS[0];
}

export function attachmentRetentionOption(
  mode: AttachmentRetentionMode,
): AttachmentRetentionOption {
  return ATTACHMENT_RETENTION_OPTIONS.find((option) => option.value === mode)
    ?? ATTACHMENT_RETENTION_OPTIONS[0];
}

export function knowledgeModeSummary(mode: KnowledgeOrganizationMode): string {
  return knowledgeModeOption(mode).impact;
}

export function attachmentRetentionSummary(mode: AttachmentRetentionMode): string {
  return attachmentRetentionOption(mode).impact;
}

export function attachmentRetentionOutcome(mode: AttachmentRetentionMode): string {
  switch (mode) {
    case "keep_file":
      return "Outcome: the original file stays in the Files library, together with extracted notes and supertag links.";
    case "keep_nothing":
      return "Outcome: OmnyID answers this request, then removes both the file and extracted content after the run.";
    case "keep_extracted_only":
    default:
      return "Outcome: OmnyID keeps the extracted notes, supertags, and knowledge links, but removes the original file.";
  }
}

export function combinedKnowledgePolicySummary(
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
): string {
  const knowledge = knowledgeModeOption(knowledgeMode);
  const retention = attachmentRetentionOption(retentionMode);
  return `${knowledge.label} + ${retention.label}`;
}
