function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function parseWeddingFeelTagInput(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const compact = value.trim();
  if (compact.split(/\s+/).length > 10 || /\b(?:want|need|avoid|change|add|remove|wedding|centrepiece|centerpiece)\b/i.test(compact)) return [];
  const segments = compact
    .split(/\r?\n|,|;|\s+and\s+/i)
    .map((item) => item.trim().replace(/^and\s+/i, "").replace(/[.!?]+$/, ""))
    .map((item) => /^vibrantl$/i.test(item) ? "vibrant" : item)
    .filter((item) => item.length >= 2 && item.length <= 40);
  return [...new Map(segments.map((item) => [item.toLowerCase(), titleCase(item)])).values()].slice(0, 8);
}
