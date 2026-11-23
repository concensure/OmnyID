// @locs-version: 1.0
export function objectKindLabel(kind: string): string {
  switch (kind) {
    case "chat_thread":
      return "threads";
    case "database_view":
      return "views";
    default:
      return kind.replace(/_/g, " ");
  }
}

export type KindCount = {
  kind: string;
  count: number;
};

export function collectKindCounts(
  kinds: Array<string | null | undefined>,
): KindCount[] {
  const counts = new Map<string, number>();
  for (const raw of kinds) {
    const kind = raw?.trim();
    if (!kind) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => ({ kind, count }));
}
