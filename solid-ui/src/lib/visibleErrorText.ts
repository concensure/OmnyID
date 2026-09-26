// @locs-version: 1.0
export function visibleErrorText(value: unknown, fallback = "Request failed."): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  const looksLikeHtml =
    /<!doctype\s+html/i.test(trimmed)
    || /<html[\s>]/i.test(trimmed)
    || /<\/(?:body|html)>/i.test(trimmed);

  if (looksLikeHtml) {
    const title = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
    if (title) return title;
    return fallback;
  }

  return trimmed
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || fallback;
}
