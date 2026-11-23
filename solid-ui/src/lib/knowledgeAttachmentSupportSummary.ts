// @locs-version: 1.0
import type { AttachmentIngestCapabilities } from "./api";
import {
  classifyKnowledgeAttachmentSupport,
  type KnowledgeAttachmentSupport,
} from "./knowledgeAttachmentExtract";

export type KnowledgeAttachmentSupportDecision = {
  file: File;
  support: KnowledgeAttachmentSupport;
};

export type KnowledgeAttachmentSupportSummary = {
  decisions: KnowledgeAttachmentSupportDecision[];
  supportedFiles: File[];
  unsupportedFiles: File[];
  inlineCount: number;
  serverCount: number;
  unsupportedCount: number;
  unsupportedLabels: string[];
  unsupportedDescriptions: string[];
};

export function summarizeKnowledgeAttachmentSupport(
  files: readonly File[],
  capabilities?: AttachmentIngestCapabilities | null,
): KnowledgeAttachmentSupportSummary {
  const decisions = files.map((file) => ({
    file,
    support: classifyKnowledgeAttachmentSupport(file, capabilities),
  }));
  const supportedFiles = decisions
    .filter((entry) => entry.support.mode !== "not_supported_yet")
    .map((entry) => entry.file);
  const unsupportedFiles = decisions
    .filter((entry) => entry.support.mode === "not_supported_yet")
    .map((entry) => entry.file);

  return {
    decisions,
    supportedFiles,
    unsupportedFiles,
    inlineCount: decisions.filter((entry) => entry.support.mode === "inline_text").length,
    serverCount: decisions.filter((entry) => entry.support.mode === "server_processing").length,
    unsupportedCount: decisions.filter((entry) => entry.support.mode === "not_supported_yet").length,
    unsupportedLabels: [...new Set(
      decisions
        .filter((entry) => entry.support.mode === "not_supported_yet")
        .map((entry) => entry.support.label.trim())
        .filter(Boolean),
    )],
    unsupportedDescriptions: [...new Set(
      decisions
        .filter((entry) => entry.support.mode === "not_supported_yet")
        .map((entry) => entry.support.description.trim())
        .filter(Boolean),
    )],
  };
}
