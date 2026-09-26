// @locs-version: 1.0
import type { AfpAttachment } from "@/lib/api";

function attachmentStorage(attachment: Pick<AfpAttachment, "storage">): Record<string, unknown> {
  return (attachment.storage ?? {}) as Record<string, unknown>;
}

export function attachmentPreviewDownloadUrl(
  attachment: Pick<AfpAttachment, "storage">,
): string | null {
  const storage = attachmentStorage(attachment);
  const directUrl = storage.url ?? storage.download_url;
  return typeof directUrl === "string" && directUrl.trim() ? directUrl.trim() : null;
}

export function attachmentPreviewInlineBytes(
  attachment: Pick<AfpAttachment, "storage">,
): Uint8Array | null {
  const storage = attachmentStorage(attachment);
  const storageType = storage.type;
  const storageBackend = storage.backend;
  if (
    storageType !== "inline"
    && storageBackend !== "inline"
  ) {
    return null;
  }
  if (typeof storage.data !== "string" || !storage.data.trim()) return null;
  const binary = atob(storage.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function attachmentPreviewInlineBuffer(
  attachment: Pick<AfpAttachment, "storage">,
): ArrayBuffer | null {
  const inlineBytes = attachmentPreviewInlineBytes(attachment);
  if (!inlineBytes) return null;
  const copy = new Uint8Array(inlineBytes.byteLength);
  copy.set(inlineBytes);
  return copy.buffer;
}

type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export async function readAttachmentPreviewBytes(
  attachment: Pick<AfpAttachment, "storage">,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<ArrayBuffer> {
  const inlineBuffer = attachmentPreviewInlineBuffer(attachment);
  if (inlineBuffer) return inlineBuffer;

  const directUrl = attachmentPreviewDownloadUrl(attachment);
  if (!directUrl) {
    throw new Error("No download source available - attachment may require server-side access.");
  }

  const response = await fetchImpl(directUrl, {
    headers: { Accept: "*/*" },
  });
  if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`);
  return response.arrayBuffer();
}
