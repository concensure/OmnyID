// @locs-version: 1.0
import type {
  AttachmentIngestCapabilities,
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
} from "./api";
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";

export type StudyUploadReadinessState = {
  headline: string;
  detail: string;
  tone: "sky" | "amber" | "emerald";
  recommendedSourceLabel: string;
  recommendedSourceDetail: string;
  instantFormatsLabel: string;
  instantFormatsDetail: string;
  serverFormatsLabel: string;
  serverFormatsDetail: string;
  gapsLabel: string;
  gapsDetail: string;
  retentionLabel: string;
};

function shouldShow(seed: OnboardingQuickStartSeed | null | undefined, attachedCount: number): boolean {
  if (attachedCount > 0) return false;
  if (!seed) return false;
  if (seed.entryPoint === "onboarding") return true;
  return seed.flowKind === "initial_upload";
}

function retentionLabel(
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
): string {
  if (retentionMode === "keep_file") {
    return knowledgeMode === "zettelkasten"
      ? "Keeping files is fine when exact source recall matters, but extracted-note retention is still enough for most first-session note-chain work."
      : "Keeping files is fine when exact source recall matters, but extracted-note retention is still the safer first-session default for most students.";
  }
  if (retentionMode === "keep_nothing") {
    return "Session-only retention is the weakest choice for a first student run because OmnyID cannot reuse the upload in Files, supertags, or the graph afterward.";
  }
  return knowledgeMode === "zettelkasten"
    ? "Keep extracted notes is the safest default here because the first run can retain source notes, review stages, and links without storing the original file."
    : "Keep extracted notes is the safest default here because the first run can retain connected study memory without keeping the original file by default.";
}

function cleanRecommendedUpload(seed: OnboardingQuickStartSeed): string {
  return seed.recommendedUpload
    .trim()
    .replace(/^(Best with|Optional:)\s*/i, "")
    .replace(/\.$/, "");
}

export function buildStudyUploadReadinessState(input: {
  quickStartSeed: OnboardingQuickStartSeed | null | undefined;
  attachedCount: number;
  capabilities?: AttachmentIngestCapabilities | null;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): StudyUploadReadinessState | null {
  if (!shouldShow(input.quickStartSeed, input.attachedCount)) return null;
  const seed = input.quickStartSeed;
  if (!seed) return null;

  const ocrSupported = input.capabilities?.image_ocr_supported ?? true;
  const pdfServerSupported = input.capabilities?.pdf_server_processing_supported ?? false;
  const legacyOfficeSupported = input.capabilities?.legacy_office_supported ?? false;
  const supportedServerFormats = [
    "common audio and video for transcription",
    pdfServerSupported ? "scanned PDFs" : null,
    ocrSupported ? "screenshots and photographed notes" : null,
    legacyOfficeSupported ? "legacy Office files such as DOC, XLS, and PPT" : null,
  ].filter((value): value is string => Boolean(value));
  const gaps = [
    !legacyOfficeSupported ? "legacy DOC, XLS, and PPT files" : null,
    !ocrSupported ? "HEIC, HEIF, screenshots, and photographed notes without OCR" : null,
    !pdfServerSupported ? "scanned PDFs that do not contain selectable text" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    headline: "What you can upload right now for the fastest first study win.",
    detail:
      input.knowledgeMode === "zettelkasten"
        ? "The goal is not just file storage. Start with one readable source so OmnyID can turn it into the first retained note-chain step immediately."
        : "The goal is not just file storage. Start with one readable class source so OmnyID can turn it into connected notes and first-session study value immediately.",
    tone: gaps.length > 0 ? "sky" : "emerald",
    recommendedSourceLabel: "Best source for this run",
    recommendedSourceDetail: cleanRecommendedUpload(seed),
    instantFormatsLabel: "Works best immediately",
    instantFormatsDetail:
      "PDF with selectable text, DOCX, TXT, Markdown, CSV, TSV, JSON, XML, HTML, SRT, VTT, XLSX, and PPTX work best for the first run because OmnyID can extract study content without waiting.",
    serverFormatsLabel: "Usually works after upload processing",
    serverFormatsDetail:
      supportedServerFormats.length > 0
        ? `${supportedServerFormats.join(", ")} can still add value, but part of the first pass may depend on upload processing before the material contributes fully.`
        : "Audio, video, scanned PDFs, and image-heavy material may still need extra processing before they contribute fully.",
    gapsLabel: "Still risky or likely to need conversion",
    gapsDetail:
      gaps.length > 0
        ? `${gaps.join(", ")} are the main formats most likely to block a smooth first study run in the current environment.`
        : "No major first-session format blockers are exposed by the current ingest capability settings.",
    retentionLabel: retentionLabel(input.knowledgeMode, input.retentionMode),
  };
}
