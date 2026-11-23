// @locs-version: 1.0
const THUMBNAIL_WIDTH = "400";

function isInternalAttachmentPath(pathname: string): boolean {
  return pathname.startsWith("/attachments/") || pathname.startsWith("/api/files/");
}

export function tileThumbnailUrl(rawUrl: string | null | undefined): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;
  if (/^(data:|blob:)/i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed, "http://omnyid.local");
    if (!isInternalAttachmentPath(parsed.pathname)) return trimmed;
    if (!parsed.searchParams.has("w")) {
      parsed.searchParams.set("w", THUMBNAIL_WIDTH);
    }
    if (/^https?:\/\//i.test(trimmed)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}
