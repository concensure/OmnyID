// @locs-version: 1.0
import type {
  AttachmentIngestCapabilities,
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
} from "./api";
import { summarizeKnowledgeAttachmentSupport } from "./knowledgeAttachmentSupportSummary";

export type StudyAttachmentPlanItem = {
  fileName: string;
  supportMode: "inline_text" | "server_processing" | "not_supported_yet";
  supportLabel: string;
  supportDescription: string;
  readinessLabel: string;
  ingestionLabel: string;
  retentionLabel: string;
  organizationLabel: string;
  nextStepLabel: string;
  tone: "emerald" | "sky" | "amber";
  readable: boolean;
};

export type StudyAttachmentPlanState = {
  headline: string;
  supportingText: string;
  readableCount: number;
  deferredCount: number;
  skippedCount: number;
  items: StudyAttachmentPlanItem[];
};

function retentionLabel(mode: AttachmentRetentionMode): string {
  if (mode === "keep_file") {
    return "Original file and extracted content stay available in Files after this run.";
  }
  if (mode === "keep_nothing") {
    return "Used for this answer only; neither the file nor extracted content stays afterward.";
  }
  return "Original file is removed after ingest, but extracted content, supertags, and links remain searchable.";
}

function organizationLabel(mode: KnowledgeOrganizationMode): string {
  if (mode === "zettelkasten") {
    return "Organized as Zettelkasten source material, with supertags and note-chain review semantics.";
  }
  if (mode === "standard") {
    return "Organized for basic workspace retrieval without the stronger connected-notes overlay.";
  }
  return "Organized as connected notes so OmnyID can link concepts across files, tags, and later study runs.";
}

function readabilityLabel(supportMode: StudyAttachmentPlanItem["supportMode"]): string {
  if (supportMode === "inline_text") return "Ready now";
  if (supportMode === "server_processing") return "Readable after upload";
  return "Skipped for study synthesis";
}

function ingestionLabel(supportMode: StudyAttachmentPlanItem["supportMode"]): string {
  if (supportMode === "inline_text") return "OmnyID can read this file immediately in the current browser flow.";
  if (supportMode === "server_processing") return "OmnyID will upload this file first, then rely on server parsing, OCR, or transcription.";
  return "OmnyID can keep this file only as an attachment today; it cannot turn it into connected study knowledge yet.";
}

function nextStepLabel(
  supportMode: StudyAttachmentPlanItem["supportMode"],
  retentionMode: AttachmentRetentionMode,
): string {
  if (supportMode === "not_supported_yet") {
    return "Best next step: convert it to PDF, DOCX, TXT, Markdown, CSV, or a common audio format.";
  }
  if (supportMode === "server_processing") {
    return retentionMode === "keep_nothing"
      ? "Best next step: run the grounded question now, because this file will only exist for the current answer."
      : "Best next step: run the question, then review the retained result in Files or the Knowledge Graph.";
  }
  return retentionMode === "keep_nothing"
    ? "Best next step: ask the grounded question now, because this readable source will not be retained afterward."
    : "Best next step: ask the grounded question now, then continue from the retained study pack.";
}

export function buildStudyAttachmentPlanState(input: {
  files: readonly File[];
  capabilities?: AttachmentIngestCapabilities | null;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): StudyAttachmentPlanState {
  const support = summarizeKnowledgeAttachmentSupport(input.files, input.capabilities);
  const deferredCount = support.decisions.filter((entry) => entry.support.mode === "server_processing").length;
  const skippedCount = support.decisions.filter((entry) => entry.support.mode === "not_supported_yet").length;
  const readableCount = support.decisions.filter((entry) => entry.support.mode !== "not_supported_yet").length;

  const items = support.decisions.map((entry) => {
    const tone =
      entry.support.mode === "inline_text"
        ? "emerald"
        : entry.support.mode === "server_processing"
          ? "sky"
          : "amber";
    return {
      fileName: entry.file.name,
      supportMode: entry.support.mode,
      supportLabel: entry.support.label,
      supportDescription: entry.support.description,
      readinessLabel: readabilityLabel(entry.support.mode),
      ingestionLabel: ingestionLabel(entry.support.mode),
      retentionLabel: retentionLabel(input.retentionMode),
      organizationLabel: organizationLabel(input.knowledgeMode),
      nextStepLabel: nextStepLabel(entry.support.mode, input.retentionMode),
      tone,
      readable: entry.support.mode !== "not_supported_yet",
    } satisfies StudyAttachmentPlanItem;
  });

  const headline =
    skippedCount === input.files.length
      ? "This upload batch needs format fixes before OmnyID can turn it into connected study knowledge."
      : deferredCount > 0
        ? "This batch is partly ready now and partly depends on server-side reading after upload."
        : "This batch is ready for immediate grounded study synthesis.";
  const supportingText =
    skippedCount === 0
      ? "Review each file once, then run the question. OmnyID will preserve the chosen retention outcome consistently across the whole batch."
      : readableCount > 0
        ? "Readable files can still power this run. Unsupported files will be skipped until they are converted into a supported format."
        : "Convert at least one file into a supported study format so the first run can produce retained connected notes or Zettelkasten material.";

  return {
    headline,
    supportingText,
    readableCount,
    deferredCount,
    skippedCount,
    items,
  };
}
