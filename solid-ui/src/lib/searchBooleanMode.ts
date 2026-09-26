// @locs-version: 1.0
export type SearchBooleanMode = "all" | "any" | "exclude";

const BOOLEAN_OPERATOR_PATTERN = /\b(AND|OR|NOT)\b|(^|\s)-\S/;

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
