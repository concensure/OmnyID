// @locs-version: 1.0
const FRIENDLY_ERROR_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/failed to fetch|networkerror|network request failed|load failed|econn|timed? ?out/i,
    "Connection lost. Your changes haven't been saved yet. Check your connection and try again."],
  [/unauthenticated|unauthori[sz]ed|\bhttp:? ?401\b|session (?:has )?expired|invalid (?:or expired )?token/i,
    "Your session has expired. Sign in again, then retry."],
  [/\bafp\b|invalid (?:signature|argument)|invalid_argument|\bgrpc\b|\b(?:status(?: code)?|http):? ?[45]\d\d\b|internal server/i,
    "Something went wrong on our side. Your changes haven't been saved yet. Try again in a moment."],
];

// Backend and protocol wording must never reach the user (mobile UI principles §1).
export function friendlyErrorText(value: unknown, fallback = "Something went wrong. Try again in a moment."): string {
  const text = visibleErrorText(value, fallback);
  return FRIENDLY_ERROR_RULES.find(([pattern]) => pattern.test(text))?.[1] ?? text;
}

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
