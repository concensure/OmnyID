// @locs-version: 1.0
import {
  buildWeddingArtifactExportPayload,
  type WeddingWorkspaceBundleExportPayload,
} from "@/lib/weddingArtifactExportPayloadState";
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingBundleExportFormat = "markdown" | "html" | "word_doc";

export function weddingProjectionMetadataId(input: SendAfpMessageInput): string | null {
  const metadata = input.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const id = metadata.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function downloadText(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function runWeddingArtifactBrowserExport(input: {
  title: string;
  bodyText: string;
  entry: WeddingExportManifestEntry;
}): string {
  const payload = buildWeddingArtifactExportPayload(input);
  if (payload.disabledReason) return payload.disabledReason;
  if (payload.action === "print") {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return "Could not open the browser print window.";
    printWindow.document.write(payload.content);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return "Opened browser print dialog for PDF export.";
  }
  downloadText(payload.content, payload.mimeType, payload.filename);
  return `Downloaded ${payload.filename}.`;
}

export function selectWeddingBundleExportPayload(input: {
  state: WeddingResponseWorkspaceViewState;
  format: WeddingBundleExportFormat;
  includeSensitive: boolean;
}): WeddingWorkspaceBundleExportPayload {
  if (input.format === "html") {
    return input.includeSensitive ? input.state.sensitiveHtmlBundleExportPayload : input.state.htmlBundleExportPayload;
  }
  if (input.format === "word_doc") {
    return input.includeSensitive ? input.state.sensitiveWordBundleExportPayload : input.state.wordBundleExportPayload;
  }
  return input.includeSensitive ? input.state.sensitiveBundleExportPayload : input.state.bundleExportPayload;
}

export function runWeddingBundleBrowserExport(payload: WeddingWorkspaceBundleExportPayload): string {
  if (payload.disabledReason) return payload.disabledReason;
  downloadText(payload.content, payload.mimeType, payload.filename);
  const excludedLabel = payload.excludedArtifactIds.length > 0
    ? ` Excluded ${payload.excludedArtifactIds.length} sensitive file${payload.excludedArtifactIds.length === 1 ? "" : "s"}.`
    : "";
  return `Downloaded ${payload.filename}.${excludedLabel}`;
}
