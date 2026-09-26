// @locs-version: 1.0
const RESERVED_OBJECT_PREFIXES = [
  "kind:",
  "target:",
  "ref:",
  "reference:",
  "reftype:",
  "reference_type:",
  "ref_type:",
  "link:",
  "linktype:",
  "relation:",
] as const;

function isMetadataToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return false;
  }
  const match = trimmed.match(/^([A-Za-z][\w.-]*):(.+)$/);
  if (!match) return false;
  const [, key, value] = match;
  if (!key || !value) return false;
  const lowered = `${key}:`.toLowerCase();
  return !RESERVED_OBJECT_PREFIXES.includes(lowered as (typeof RESERVED_OBJECT_PREFIXES)[number]);
}

export function isStructuredObjectSearchQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  for (const token of trimmed.split(/\s+/)) {
    const normalized = token.trim().toLowerCase();
    if (normalized.startsWith("#")) return true;
    if (RESERVED_OBJECT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
    if (isMetadataToken(token)) return true;
  }
  return false;
}
