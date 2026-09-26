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

function trimToken(token: string): string {
  return token.trim().replace(/^[,.;:()[\]{}"']+|[,.;:()[\]{}"']+$/g, "");
}

export type ObjectMetadataTerm = {
  key: string;
  value: string;
};

export type ParsedObjectSearchQuery = {
  freeText: string;
  kind?: string;
  tags: string[];
  referenceTargets: string[];
  referenceType?: string;
  linkType?: string;
  metadataTerms: ObjectMetadataTerm[];
};

function pushUnique(values: string[], next: string) {
  if (!next || values.includes(next)) return;
  values.push(next);
}

export function parseObjectSearchQuery(query: string): ParsedObjectSearchQuery {
  const tags: string[] = [];
  const referenceTargets: string[] = [];
  const metadataTerms: ObjectMetadataTerm[] = [];
  let kind: string | undefined;
  let referenceType: string | undefined;
  let linkType: string | undefined;
  const freeTokens: string[] = [];

  for (const rawToken of query.trim().split(/\s+/)) {
    if (!rawToken) continue;
    const token = trimToken(rawToken);
    const lowered = token.toLowerCase();
    if (token.startsWith("#")) {
      pushUnique(tags, token.slice(1).toLowerCase());
      continue;
    }
    if (lowered.startsWith("kind:")) {
      kind = trimToken(token.slice(5)).toLowerCase() || kind;
      continue;
    }
    if (
      lowered.startsWith("target:")
      || lowered.startsWith("ref:")
      || lowered.startsWith("reference:")
    ) {
      const value = token.includes(":") ? trimToken(token.split(":").slice(1).join(":")) : "";
      if (value) pushUnique(referenceTargets, value);
      continue;
    }
    if (
      lowered.startsWith("reftype:")
      || lowered.startsWith("reference_type:")
      || lowered.startsWith("ref_type:")
    ) {
      referenceType = trimToken(token.split(":").slice(1).join(":")).toLowerCase() || referenceType;
      continue;
    }
    if (
      lowered.startsWith("link:")
      || lowered.startsWith("linktype:")
      || lowered.startsWith("relation:")
    ) {
      linkType = trimToken(token.split(":").slice(1).join(":")).toLowerCase() || linkType;
      continue;
    }
    const metadataMatch = token.match(/^([A-Za-z][\w.-]*):(.+)$/);
    if (metadataMatch) {
      const key = metadataMatch[1].toLowerCase();
      const value = trimToken(metadataMatch[2]);
      if (value && !RESERVED_OBJECT_PREFIXES.includes(`${key}:` as (typeof RESERVED_OBJECT_PREFIXES)[number])) {
        if (!metadataTerms.some((term) => term.key === key && term.value === value)) {
          metadataTerms.push({ key, value });
        }
        continue;
      }
    }
    freeTokens.push(rawToken);
  }

  return {
    freeText: freeTokens.join(" ").trim(),
    kind,
    tags,
    referenceTargets,
    referenceType,
    linkType,
    metadataTerms,
  };
}

export function buildObjectSearchQuery(query: ParsedObjectSearchQuery): string {
  const tokens: string[] = [];
  if (query.freeText.trim()) tokens.push(query.freeText.trim());
  if (query.kind?.trim()) tokens.push(`kind:${query.kind.trim()}`);
  for (const tag of query.tags) {
    if (tag.trim()) tokens.push(`#${tag.trim()}`);
  }
  for (const target of query.referenceTargets) {
    if (target.trim()) tokens.push(`target:${target.trim()}`);
  }
  if (query.referenceType?.trim()) tokens.push(`reftype:${query.referenceType.trim()}`);
  if (query.linkType?.trim()) tokens.push(`relation:${query.linkType.trim()}`);
  for (const term of query.metadataTerms) {
    if (term.key.trim() && term.value.trim()) {
      tokens.push(`${term.key.trim()}:${term.value.trim()}`);
    }
  }
  return tokens.join(" ").trim();
}
