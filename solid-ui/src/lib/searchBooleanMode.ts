// @locs-version: 1.0
export type SearchBooleanMode = "all" | "any" | "exclude";

const BOOLEAN_OPERATOR_PATTERN = /\b(AND|OR|NOT)\b|(^|\s)-\S/;
const NATURAL_LANGUAGE_COMMAND_PATTERN = /^(?:please\s+)?(?:plan|organise|organize|create|make|write|draft|help|show|tell|find|research|compare|schedule|book|remind|summari[sz]e|explain|can|could|would|should|what|when|where|why)\b/i;
const NATURAL_LANGUAGE_SENTENCE_PATTERN = /[?!.]$|\b(?:i|me|my|we|our|you|your|anything|something|next\s+week|tomorrow|today|please)\b/i;

function tokenizePlainQuery(query: string): string[] {
  const matches = query.match(/"[^"]+"|\S+/g) ?? [];
  return matches.map((token) => token.trim()).filter(Boolean);
}

export function applySearchBooleanMode(
  query: string,
  mode: SearchBooleanMode,
): string {
  const trimmed = query.trim();
  if (!trimmed) return "";
  if (BOOLEAN_OPERATOR_PATTERN.test(trimmed)) return trimmed;

  const tokens = tokenizePlainQuery(trimmed);
  if (tokens.length < 2) return trimmed;

  if (mode === "exclude") {
    return tokens.map((token) => (token.startsWith("-") ? token : `-${token}`)).join(" ");
  }

  const separator = mode === "any" ? " OR " : " AND ";
  return tokens.join(separator);
}

// Boolean expansion is useful for retrieval terms but it corrupts an agent
// instruction (for example, "plan a family trip") before the model sees it.
// Preserve prose commands exactly; explicit Boolean searches retain their
// existing behavior through applySearchBooleanMode above.
export function searchSubmissionText(query: string, mode: SearchBooleanMode): string {
  const trimmed = query.trim();
  return NATURAL_LANGUAGE_COMMAND_PATTERN.test(trimmed) || NATURAL_LANGUAGE_SENTENCE_PATTERN.test(trimmed)
    ? trimmed
    : applySearchBooleanMode(trimmed, mode);
}
