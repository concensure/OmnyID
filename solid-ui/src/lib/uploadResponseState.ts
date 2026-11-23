// @locs-version: 1.0
import type { AfpAttachment } from "@/lib/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseUploadErrorDetail(payload: unknown): string {
  if (!isRecord(payload)) return "";
  return nonEmptyString(payload.error) ?? nonEmptyString(payload.message) ?? "";
}

export function parseUploadMessageIdPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return nonEmptyString(payload.message_id);
}

export function parseUploadAttachmentPayload(payload: unknown): AfpAttachment | null {
  if (!isRecord(payload) || !isRecord(payload.attachment)) return null;
  const attachment = payload.attachment;
  const id = nonEmptyString(attachment.id);
  const name = nonEmptyString(attachment.name);
  const mimeType = nonEmptyString(attachment.mime_type);
  const sizeBytes = attachment.size_bytes;
  if (
    !id
    || !name
    || !mimeType
    || typeof sizeBytes !== "number"
    || !Number.isFinite(sizeBytes)
    || sizeBytes < 0
    || !isRecord(attachment.storage)
    || !isRecord(attachment.encryption)
  ) {
    return null;
  }

  return {
    id,
    name,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    storage: attachment.storage,
    encryption: attachment.encryption,
    sha256: nonEmptyString(attachment.sha256) ?? undefined,
  };
}
