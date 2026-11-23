// @locs-version: 1.0
export type DashboardFeedScopeTransientState = {
  bulkDismissPending: boolean,
  showDismissed: boolean,
  snoozedToastId: string | null,
  undoDismissId: string | null,
};

export function clearDashboardFeedScopeTransientState(
  state: DashboardFeedScopeTransientState,
): DashboardFeedScopeTransientState {
  return {
    bulkDismissPending: false,
    showDismissed: false,
    snoozedToastId: null,
    undoDismissId: null,
  };
}

export function pruneDashboardFeedActiveTypes(
  activeTypes: ReadonlySet<string>,
  availableTypes: readonly string[],
): Set<string> {
  if (activeTypes.size === 0) return new Set<string>();
  if (availableTypes.length === 0) return new Set(activeTypes);
  const available = new Set(availableTypes);
  const next = new Set<string>();
  for (const type of activeTypes) {
    if (available.has(type)) next.add(type);
  }
  return next;
}
