// @locs-version: 1.0

const TECHNICAL_COPY = /\b(?:afp|api|grpc|http|postgres|database|sql|smtp|provider|stack|exception|token|schema|payload|artifact|projection|webhook|status\s*code)\b|\b[45]\d\d\b|[_/\\]{2,}|[a-z]+_[a-z_]+/i;

export function weddingVendorSearchNoticeCopy(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /^Directory-only vendor search returned\b/i.test(text)) return null;
  if (/offline|network|connect|timeout/i.test(text)) {
    return "We couldn't reach the vendor directory. Check your connection and try again.";
  }
  if (TECHNICAL_COPY.test(text) || /fail|error|unable|couldn't|could not/i.test(text)) {
    return "We couldn't refresh vendor matches just now. Try again in a moment.";
  }
  if (/found|ready|complete|match|result/i.test(text) && !/fail|error|unable|couldn't|could not/i.test(text)) {
    return "Your latest vendor matches are ready.";
  }
  if (/blocked|missing|required|preference|category/i.test(text)) {
    return "Add a vendor type or a few preferences to improve your matches.";
  }
  return "We couldn't refresh vendor matches just now. Try again in a moment.";
}

export function weddingVendorSearchBlockedCopy(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return "Add a vendor type or a few preferences for better matches. You can still search by name.";
}

export function weddingPlanningNeedLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (/priorit|preference|fit/i.test(text)) return "what matters most to you";
  if (/location|suburb|city|region/i.test(text)) return "where you're getting married";
  if (/date|season|month/i.test(text)) return "your wedding date or season";
  if (/guest|turnout|attendee/i.test(text)) return "your expected guest count";
  if (/budget|price|spend/i.test(text)) return "your comfortable budget";
  return TECHNICAL_COPY.test(text) || !text ? "a little more wedding detail" : text.toLowerCase();
}

export function containsTechnicalWeddingUiCopy(value: string): boolean {
  return TECHNICAL_COPY.test(value);
}

export function safeWeddingUiText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return !text || TECHNICAL_COPY.test(text) ? fallback : text;
}
