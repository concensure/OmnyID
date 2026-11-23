// @locs-version: 1.0
export type ParsedThreadSearch = {
  query: string;
  tags: string[];
  metadataTerms: string[];
  kind?: string;
  threadIds: string[];
  fromAgents: string[];
  timeRange?: {
    from?: string;
    to?: string;
  };
};

export function buildThreadSearchInput(parsed: ParsedThreadSearch): string {
  const tokens: string[] = [];
  if (parsed.query.trim()) tokens.push(parsed.query.trim());
  if (parsed.kind?.trim()) tokens.push(`kind:${parsed.kind.trim()}`);
  for (const threadId of parsed.threadIds) {
    const normalized = threadId.trim();
    if (normalized) tokens.push(`thread:${normalized}`);
  }
  for (const fromAgent of parsed.fromAgents) {
    const normalized = fromAgent.trim();
    if (normalized) tokens.push(`from:${normalized}`);
  }
  if (parsed.timeRange?.from && parsed.timeRange?.to && parsed.timeRange.from === parsed.timeRange.to) {
    tokens.push(`on:${parsed.timeRange.from}`);
  } else {
    if (parsed.timeRange?.from) tokens.push(`after:${parsed.timeRange.from}`);
    if (parsed.timeRange?.to) tokens.push(`before:${parsed.timeRange.to}`);
  }
  for (const tag of parsed.tags) {
    const normalized = tag.trim();
    if (normalized) tokens.push(`#${normalized}`);
  }
  for (const metadataTerm of parsed.metadataTerms) {
    const normalized = metadataTerm.trim();
    if (normalized) tokens.push(normalized);
  }
  return tokens.join(" ").trim();
}

export function parseThreadSearchInput(input: string): ParsedThreadSearch {
  const tags = new Set<string>();
  const metadataTerms = new Set<string>();
  const threadIds = new Set<string>();
  const fromAgents = new Set<string>();
  const queryTokens: string[] = [];
  let kind: string | undefined;
  let timeFrom: string | undefined;
  let timeTo: string | undefined;

  for (const token of input.trim().split(/\s+/)) {
    if (!token) continue;
    const trimmed = token.replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "");
    if (!trimmed) continue;
    if (trimmed.startsWith("#") && trimmed.length > 1) {
      const normalized = trimmed
        .slice(1)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "")
        .toLowerCase();
      if (normalized) tags.add(normalized);
      continue;
    }
    if (!kind && /^kind:/i.test(trimmed)) {
      const normalized = trimmed
        .slice(5)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "")
        .toLowerCase();
      if (normalized) kind = normalized;
      continue;
    }
    if (/^(memory_space|author_type|author_mask):/i.test(trimmed)) {
      const key = trimmed.slice(0, trimmed.indexOf(":")).trim().toLowerCase();
      const value = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "")
        .toLowerCase();
      if (value) metadataTerms.add(`${key}:${value}`);
      continue;
    }
    if (/^(thread|thread_id):/i.test(trimmed)) {
      const normalized = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "");
      if (normalized) threadIds.add(normalized);
      continue;
    }
    if (/^(from|agent|sender):/i.test(trimmed)) {
      const normalized = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "")
        .toLowerCase();
      if (normalized) fromAgents.add(normalized);
      continue;
    }
    if (/^after:/i.test(trimmed)) {
      const normalized = trimmed
        .slice(6)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "");
      if (isIsoDate(normalized)) timeFrom = normalized;
      continue;
    }
    if (/^before:/i.test(trimmed)) {
      const normalized = trimmed
        .slice(7)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "");
      if (isIsoDate(normalized)) timeTo = normalized;
      continue;
    }
    if (/^on:/i.test(trimmed)) {
      const normalized = trimmed
        .slice(3)
        .trim()
        .replace(/^[,.;:!?()[\]{}"']+|[,.;:!?()[\]{}"']+$/g, "");
      if (isIsoDate(normalized)) {
        timeFrom = normalized;
        timeTo = normalized;
      }
      continue;
    }
    queryTokens.push(trimmed);
  }

  return {
    query: queryTokens.join(" ").trim(),
    tags: [...tags],
    metadataTerms: [...metadataTerms],
    kind,
    threadIds: [...threadIds],
    fromAgents: [...fromAgents],
    timeRange:
      timeFrom || timeTo
        ? {
            from: timeFrom,
            to: timeTo,
          }
        : undefined,
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
