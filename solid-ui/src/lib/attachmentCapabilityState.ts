// @locs-version: 1.0
import type {
  AttachmentIngestCapabilities,
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
} from "./api";
import { summarizeKnowledgeAttachmentSupport } from "./knowledgeAttachmentSupportSummary";

export type AttachmentCapabilityCard = {
  tone: "emerald" | "sky" | "amber";
  label: string;
  count: number;
  detail: string;
};

export type AttachmentCapabilityState = {
  headline: string;
  badge: string;
  detail: string;
  cards: AttachmentCapabilityCard[];
  supportedFormatsLabel: string;
  supportedFormatsDetail: string;
  unsupportedFormatsLabel: string;
  unsupportedFormatsDetail: string;
  valueAfterRun: string;
};

function buildHeadline(readableCount: number, serverCount: number, unsupportedCount: number): string {
  if (readableCount === 0 && unsupportedCount > 0) {
    return "This batch needs a format fix before OmnyID can build connected study knowledge.";
  }
  if (serverCount > 0 && unsupportedCount > 0) {
    return "This batch is mixed: some sources work now, some need server processing, and some still need conversion.";
  }
  if (serverCount > 0) {
    return "This batch can power a study run, but part of it depends on upload processing first.";
  }
  if (unsupportedCount > 0) {
    return "Enough of this batch is readable now to create value, but some files still need conversion.";
  }
  return "This batch is ready for an immediate grounded study run.";
}

function buildBadge(readableCount: number, totalCount: number): string {
  if (totalCount <= 0) return "No files attached";
  if (readableCount === totalCount) return "All attached files can contribute to this run";
  if (readableCount === 0) return "No attached files can contribute yet";
  return `${readableCount} of ${totalCount} attached files can contribute to this run`;
}

function buildDetail(input: {
  readableCount: number;
  serverCount: number;
  unsupportedCount: number;
  retentionMode: AttachmentRetentionMode;
  knowledgeMode: KnowledgeOrganizationMode;
}): string {
  const storageDetail =
    input.retentionMode === "keep_nothing"
      ? "Because retention is temporary, any useful answer has to be acted on in this run."
      : input.retentionMode === "keep_file"
        ? "Because files are retained, students can come back to the original source, extracted content, and follow-up links later."
        : "Because extracted content is retained, OmnyID can preserve the study value without keeping the original file.";
  const organizationDetail =
    input.knowledgeMode === "zettelkasten"
      ? "Supertags and note-chain placement should turn readable material into linked permanent notes instead of isolated uploads."
      : input.knowledgeMode === "connected_notes"
        ? "Supertags and concept links should fold readable material into the broader connected-notes graph."
        : "Readable material will stay usable, but with a lighter organization layer than connected notes or Zettelkasten mode.";

  if (input.readableCount === 0) {
    return `The first-run value path is blocked until at least one source is converted into a readable format. ${storageDetail}`;
  }
  if (input.serverCount > 0 || input.unsupportedCount > 0) {
    return `OmnyID can still create grounded value from the readable part of this batch, but students need clear expectations about delays and skipped files. ${organizationDetail} ${storageDetail}`;
  }
  return `Students should be able to attach these files, ask a question immediately, and get a grounded answer that flows into reusable study material. ${organizationDetail} ${storageDetail}`;
}

function buildValueAfterRun(
  retentionMode: AttachmentRetentionMode,
  knowledgeMode: KnowledgeOrganizationMode,
): string {
  if (retentionMode === "keep_nothing") {
    return "After this run, nothing is retained, so there is no later Files search, graph follow-through, or supertag reuse.";
  }
  if (knowledgeMode === "zettelkasten") {
    return "After this run, retained content should appear in Files, carry supertags, and be available for note-chain review and later synthesis.";
  }
  if (knowledgeMode === "connected_notes") {
    return "After this run, retained content should appear in Files, carry supertags, and strengthen later graph retrieval across notes, files, and study sessions.";
  }
  return "After this run, retained content should stay searchable in Files and reusable in later grounded answers.";
}

export function buildAttachmentCapabilityState(input: {
  files: readonly File[];
  capabilities?: AttachmentIngestCapabilities | null;
  retentionMode: AttachmentRetentionMode;
  knowledgeMode: KnowledgeOrganizationMode;
}): AttachmentCapabilityState {
  const summary = summarizeKnowledgeAttachmentSupport(input.files, input.capabilities);
  const readableCount = summary.supportedFiles.length;
  const totalCount = input.files.length;
  const unsupportedNames = summary.unsupportedFiles.slice(0, 3).map((file) => file.name);

  return {
    headline: buildHeadline(readableCount, summary.serverCount, summary.unsupportedCount),
    badge: buildBadge(readableCount, totalCount),
    detail: buildDetail({
      readableCount,
      serverCount: summary.serverCount,
      unsupportedCount: summary.unsupportedCount,
      retentionMode: input.retentionMode,
      knowledgeMode: input.knowledgeMode,
    }),
    cards: [
      {
        tone: "emerald",
        label: "Ready now",
        count: summary.inlineCount,
        detail: "These files can be read in the browser flow immediately and can ground the first student answer.",
      },
      {
        tone: "sky",
        label: "Server read",
        count: summary.serverCount,
        detail: "These files depend on server transcription, OCR, or conversion after upload before they contribute fully.",
      },
      {
        tone: "amber",
        label: "Convert first",
        count: summary.unsupportedCount,
        detail:
          summary.unsupportedCount > 0
            ? `These files will be skipped until converted. Current examples: ${unsupportedNames.join(", ")}${summary.unsupportedFiles.length > 3 ? ` and ${summary.unsupportedFiles.length - 3} more` : ""}.`
            : "No blocked formats in this batch.",
      },
    ],
    supportedFormatsLabel: "Formats that currently work best",
    supportedFormatsDetail:
      "PDF, DOCX, TXT, Markdown, CSV, TSV, JSON, XML, HTML, SRT, VTT, XLSX, PPTX, and common audio or video formats that can be transcribed after upload.",
    unsupportedFormatsLabel: "Common gaps students still need to convert",
    unsupportedFormatsDetail:
      "Legacy Office files such as DOC, XLS, and PPT may still need server conversion support. HEIC and HEIF images also remain unreliable unless OCR handling is configured.",
    valueAfterRun: buildValueAfterRun(input.retentionMode, input.knowledgeMode),
  };
}
