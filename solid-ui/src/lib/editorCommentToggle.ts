// @locs-version: 1.0
export function toggleSelectedHtmlComment(selectedText: string): string {
  const uncommentMatch = selectedText.match(/^<!--\s?([\s\S]*?)\s?-->$/);
  if (uncommentMatch) return uncommentMatch[1] ?? "";
  return `<!-- ${selectedText} -->`;
}
