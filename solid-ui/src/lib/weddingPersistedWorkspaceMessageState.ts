// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type { WeddingArtifactSourceLink } from "@/lib/weddingArtifactState";

export function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function boundedClean(value: unknown, limit: number): string | null {
  const trimmed = clean(value);
  return trimmed ? trimmed.slice(0, Math.max(0, limit)) : null;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function uniqueStrings(value: unknown, limit = 32): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of strings(value)) {
    const tag = item.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= limit) break;
  }
  return result;
}

export function usableSourceUrls(value: unknown): string[] {
  return strings(value).filter((url) => isRemoteHttpUrl(url));
}

function isRemoteHttpUrl(value: unknown): boolean {
  const url = clean(value);
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "0.0.0.0"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}

export function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

export function privateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

export function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value
      .map((item) => typeof item === "number" ? item : typeof item === "string" ? Number(item) : NaN)
      .filter((item) => Number.isFinite(item) && item >= 0)
    : [];
}

export function bool(value: unknown): boolean {
  return value === true || value === "true";
}

export function optionalBool(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sourceFileName(value: unknown, fallback: unknown): string | null {
  const raw = boundedClean(value, 180) ?? boundedClean(fallback, 180);
  const parts = raw?.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.at(-1) ?? null;
}

function sanitizedStorageReceipt(value: unknown): Record<string, unknown> | null {
  const storage = record(value);
  if (!storage) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(storage).slice(0, 16)) {
    const safeKey = boundedClean(key, 80);
    if (!safeKey) continue;
    if (typeof item === "string") sanitized[safeKey] = boundedClean(item, 500);
    else if (typeof item === "number" && Number.isFinite(item)) sanitized[safeKey] = item;
    else if (typeof item === "boolean" || item === null) sanitized[safeKey] = item;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function contentValue(message: AfpMessage, key: string): unknown {
  return decryptedDisplayContent(message)[key] ?? message.metadata?.[key];
}

export function originalUploadMetadata(message: AfpMessage, title: string): Record<string, unknown> {
  const originalUpload = record(contentValue(message, "original_upload"));
  const sizeBytes = contentValue(message, "original_upload_size_bytes") ?? originalUpload?.original_upload_size_bytes;
  return {
    originalUploadStatus: boundedClean(contentValue(message, "original_upload_status") ?? originalUpload?.original_upload_status, 80),
    originalUploadMessageId: boundedClean(contentValue(message, "original_upload_message_id") ?? originalUpload?.original_upload_message_id, 200),
    originalUploadAttachmentId: boundedClean(contentValue(message, "original_upload_attachment_id") ?? originalUpload?.original_upload_attachment_id, 200),
    originalUploadSha256: boundedClean(contentValue(message, "original_upload_sha256") ?? originalUpload?.original_upload_sha256, 256),
    originalUploadFileName: sourceFileName(contentValue(message, "original_upload_file_name") ?? originalUpload?.original_upload_file_name, title),
    originalUploadMimeType: boundedClean(contentValue(message, "original_upload_mime_type") ?? originalUpload?.original_upload_mime_type, 160),
    originalUploadSizeBytes: typeof sizeBytes === "number" && Number.isFinite(sizeBytes) ? Math.max(0, sizeBytes) : null,
    originalUploadStorage: sanitizedStorageReceipt(contentValue(message, "original_upload_storage") ?? originalUpload?.original_upload_storage),
    originalUploadFailureLabel: boundedClean(contentValue(message, "original_upload_failure_label") ?? originalUpload?.original_upload_failure_label, 240),
  };
}

export function sanitizedSelectedDecisionScope(value: unknown): Record<string, unknown> | null {
  const scope = record(value);
  if (!scope) return null;
  const artifactTitle = clean(scope.artifact_title ?? scope.artifactTitle);
  const sourceLabels = uniqueStrings(scope.source_labels ?? scope.sourceLabels, 12);
  const metadataLabels = uniqueStrings(scope.metadata_labels ?? scope.metadataLabels, 12);
  const importedPrivateScope = [
    artifactTitle,
    ...sourceLabels,
    ...metadataLabels,
  ].filter((label): label is string => Boolean(label)).some(importedPrivateLabel);
  const sourceUrls = uniqueStrings(scope.source_urls ?? scope.sourceUrls, 12)
    .filter(isRemoteHttpUrl)
    .filter((url) => !importedPrivateScope || !privateImportSourceUrl(url));

  return {
    ...scope,
    artifact_title: importedPrivateScope ? "Imported private planning file" : artifactTitle,
    artifactTitle: undefined,
    source_labels: importedPrivateScope && sourceLabels.length > 0 ? ["Imported private planning file"] : sourceLabels,
    sourceLabels: undefined,
    source_urls: sourceUrls,
    sourceUrls: undefined,
    metadata_labels: importedPrivateScope
      ? metadataLabels.filter((label) => !importedPrivateLabel(label))
      : metadataLabels,
    metadataLabels: undefined,
    imported_private_evidence: importedPrivateScope || scope.imported_private_evidence === true,
  };
}

export function sourceLinks(value: unknown): WeddingArtifactSourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WeddingArtifactSourceLink[] => {
    if (!item || typeof item !== "object") return [];
    const sourceLink = item as Record<string, unknown>;
    const label = clean(sourceLink.label);
    const url = clean(sourceLink.url);
    return label && url && isRemoteHttpUrl(url) ? [{ label, url }] : [];
  });
}

export function workspaceIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "response_workspace_id")) ?? clean(message.metadata?.responseWorkspaceId);
}

export function planIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "wedding_plan_id")) ?? clean(message.metadata?.weddingPlanId);
}

export function sourceResponseIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "source_response_id")) ?? clean(message.metadata?.sourceResponseId);
}
