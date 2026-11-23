// @locs-version: 1.0
import { decryptedDisplayContent, decryptedDisplayLabel } from "@/lib/decryptedDisplayState";

type ThreadRowMessage = {
  type: string;
  content?: Record<string, unknown> | null;
  encryption?: Record<string, unknown> | null;
};

const TITLE_KEYS = ["title", "subject", "headline", "query"] as const;
const PREVIEW_KEYS = ["summary", "text", "body", "description", "markdown", "result", "intent"] as const;

function firstString(
  content: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | null {
  if (!content) return null;
  for (const key of keys) {
    const value = content[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateAtBoundary(value: string, max: number): string {
  if (value.length <= max) return value;
  const slice = value.slice(0, max);
  const boundary = slice.replace(/[,;:]?\s+\S*$/, "").trim();
  return `${boundary || slice}...`;
}

export function normalizeThreadMessageCopy(raw: string): string {
  const withoutFullSummaryLabel = raw
    .replace(/\[\s*full summary:\s*/gi, " ")
    .replace(/\bfull summary:\s*/gi, " ")
    .replace(/\bview details\b/gi, " ")
    .replace(/\]/g, " ");
  return collapseWhitespace(withoutFullSummaryLabel);
}

export function threadMessageTitle(
  threadId: string,
  messages: ThreadRowMessage[],
): string {
  const latest = messages[messages.length - 1];
  const first = messages[0];
  const encryptedFallback = latest ? decryptedDisplayLabel(latest) : null;
  if (encryptedFallback && !messages.some((message) => !message.encryption)) {
    return encryptedFallback;
  }
  const latestContent = latest ? decryptedDisplayContent(latest) : {};
  const firstContent = first ? decryptedDisplayContent(first) : {};
  const explicitTitle =
    firstString(latestContent, TITLE_KEYS) ??
    firstString(firstContent, TITLE_KEYS) ??
    firstString(latestContent, PREVIEW_KEYS) ??
    firstString(firstContent, PREVIEW_KEYS);

  if (!explicitTitle) return threadId.slice(0, 40);
  return truncateAtBoundary(normalizeThreadMessageCopy(explicitTitle), 72);
}

export function threadMessagePreview(message: ThreadRowMessage): string {
  const encryptedFallback = decryptedDisplayLabel(message);
  if (encryptedFallback) return encryptedFallback;
  const content = decryptedDisplayContent(message);
  const title = firstString(content, TITLE_KEYS);
  const fallback =
    firstString(content, PREVIEW_KEYS) ??
    title ??
    message.type;
  let preview = normalizeThreadMessageCopy(fallback);
  if (title) {
    const normalizedTitle = normalizeThreadMessageCopy(title);
    if (preview.toLowerCase().startsWith(normalizedTitle.toLowerCase())) {
      preview = collapseWhitespace(preview.slice(normalizedTitle.length));
    }
  }
  return truncateAtBoundary(preview || normalizeThreadMessageCopy(title ?? message.type), 180);
}

export function threadMessagePreviewBullets(preview: string): string[] {
  return preview
    .split(/[.!?]\s+/)
    .map((part) => collapseWhitespace(part))
    .filter((part) => part.length > 12)
    .slice(0, 3);
}
