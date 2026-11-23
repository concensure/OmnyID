export function masterSearchSuggestionsVisible(input: {
  requested: boolean;
  query: string;
  dismissedForQuery: string | null;
}): boolean {
  if (!input.requested) return false;
  if (input.dismissedForQuery === null) return true;
  return input.query.trim() !== input.dismissedForQuery.trim();
}
