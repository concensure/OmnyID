// @locs-version: 1.0
export function collectPinnedFeedIdsInVisibleOrder(
  visibleIds: readonly string[],
  pinnedIds: ReadonlySet<string>,
): string[] {
  return visibleIds.filter((id) => pinnedIds.has(id));
}

export function normalizePinnedFeedNavIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}
