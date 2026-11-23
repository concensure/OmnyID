// @locs-version: 1.0
import type { AfpAttachment, AfpMessage } from "@/lib/api";

export function extractSpaceMessageText(content: Record<string, unknown>): string | null {
  if (typeof content.text === "string") return content.text;
  if (typeof content.body === "string") return content.body;
  if (typeof content.summary === "string") return content.summary;
  if (typeof content.title === "string") return content.title;
  return null;
}

export function extractSpaceMessageAttachments(content: Record<string, unknown>): AfpAttachment[] {
  const raw = content.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is AfpAttachment =>
    typeof entry === "object"
    && entry !== null
    && typeof (entry as { id?: unknown }).id === "string"
    && typeof (entry as { name?: unknown }).name === "string"
    && typeof (entry as { mime_type?: unknown }).mime_type === "string"
    && typeof (entry as { size_bytes?: unknown }).size_bytes === "number"
    && typeof (entry as { storage?: unknown }).storage === "object"
    && (entry as { storage?: unknown }).storage !== null
    && typeof (entry as { encryption?: unknown }).encryption === "object"
    && (entry as { encryption?: unknown }).encryption !== null
  );
}

export function buildSpaceAttachmentMessage(
  content: Record<string, unknown>,
  type: string,
  key: string,
): AfpMessage {
  return {
    id: `space-inline-${key}`,
    thread_id: `space-inline-${key}`,
    from: "space",
    timestamp: new Date().toISOString(),
    type,
    content,
    views: [],
    attachments: extractSpaceMessageAttachments(content),
  };
}
