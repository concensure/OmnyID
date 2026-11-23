// @locs-version: 1.0
export function retrievalScopeBadgesFromQuery(query?: string | null): string[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return [];

  const badges: string[] = [];
  const memoryMatch = normalized.match(/\b(?:memory_space|memory|space):([^\s]+)/);
  if (memoryMatch?.[1]) {
    badges.push(`${memoryMatch[1].replace(/[_-]+/g, " ")} context`);
  }

  const authorTypeMatch = normalized.match(/\bauthor_type:([^\s]+)/);
  if (authorTypeMatch?.[1] === "human") {
    badges.push("human authored");
  } else if (authorTypeMatch?.[1] === "agent") {
    badges.push("agent authored");
  }

  const authorMaskMatch = normalized.match(/\b(?:author_mask|mask):([^\s]+)/);
  if (authorMaskMatch?.[1] === "private") {
    badges.push("private authored");
  } else if (authorMaskMatch?.[1] === "public") {
    badges.push("public authored");
  }

  return [...new Set(badges)];
}

export function retrievalScopeSummaryFromQuery(query?: string | null): string | null {
  const badges = retrievalScopeBadgesFromQuery(query);
  if (badges.length === 0) return null;
  if (badges.length === 1) return `Scoped to ${badges[0]}.`;
  if (badges.length === 2) return `Scoped to ${badges[0]} and ${badges[1]}.`;
  return `Scoped to ${badges.slice(0, -1).join(", ")}, and ${badges.at(-1)}.`;
}
