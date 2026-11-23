// @locs-version: 1.0
export type DashboardFeedTopicBaseResult<T> = {
  tag: string;
  messages: T[];
};

export type DashboardFeedTopicSelectionResult<T> = {
  tag: string;
  kind: string | null;
  messages: T[];
};

export type DashboardFeedTopicKindCount = {
  kind: string;
  count: number;
};

export type DashboardFeedTopicTagCount = {
  tag: string;
  count: number;
};

export type DashboardFeedTopicKindSourceMessage = {
  id: string;
  kind?: string | null;
  type?: string | null;
};

export function selectDashboardFeedAvailableTopicTags(
  activeTypeCount: number,
  remoteTags: DashboardFeedTopicTagCount[] | null | undefined,
  fallbackTags: DashboardFeedTopicTagCount[],
): DashboardFeedTopicTagCount[] {
  if (activeTypeCount > 0) return fallbackTags;
  if (remoteTags && remoteTags.length > 0) return remoteTags;
  return fallbackTags;
}

export function collectDashboardFeedFallbackTopicTags(
  messages: Array<{ id: string; supertags?: string[] }>,
  dismissedIds: ReadonlySet<string>,
  snoozedEntries: ReadonlyMap<string, number>,
  now: number,
  limit = 8,
): DashboardFeedTopicTagCount[] {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (dismissedIds.has(message.id)) continue;
    const wakeAt = snoozedEntries.get(message.id);
    if (wakeAt !== undefined && wakeAt > now) continue;
    for (const tag of message.supertags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([tag, count]) => ({ tag, count }));
}

export function collectDashboardFeedAvailableTopicKinds(
  messages: DashboardFeedTopicKindSourceMessage[],
  dismissedIds: ReadonlySet<string>,
  snoozedEntries: ReadonlyMap<string, number>,
  now: number,
  activeTypes: ReadonlySet<string>,
): DashboardFeedTopicKindCount[] {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (dismissedIds.has(message.id)) continue;
    const wakeAt = snoozedEntries.get(message.id);
    if (wakeAt !== undefined && wakeAt > now) continue;
    const type = message.type?.trim();
    if (activeTypes.size > 0 && (!type || !activeTypes.has(type))) continue;
    const kind = message.kind?.trim();
    if (!kind) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => ({ kind, count }));
}

export function shouldShowDashboardFeedTopicLensControls(
  availableTagCount: number,
  activeTag: string | null,
  hasMetadataError: boolean,
): boolean {
  return availableTagCount > 0 || Boolean(activeTag) || hasMetadataError;
}

export function includeActiveDashboardFeedTopicTag(
  availableTags: DashboardFeedTopicTagCount[],
  activeTag: string | null,
  fallbackTags: DashboardFeedTopicTagCount[] = availableTags,
): DashboardFeedTopicTagCount[] {
  if (!activeTag) return availableTags;
  if (availableTags.some((entry) => entry.tag === activeTag)) return availableTags;
  const fallbackCount = fallbackTags.find((entry) => entry.tag === activeTag)?.count ?? 0;
  return [{ tag: activeTag, count: fallbackCount }, ...availableTags];
}

export function includeActiveDashboardFeedTopicKind(
  availableKinds: DashboardFeedTopicKindCount[],
  activeKind: string | null,
): DashboardFeedTopicKindCount[] {
  if (!activeKind) return availableKinds;
  if (availableKinds.some((entry) => entry.kind === activeKind)) return availableKinds;
  return [{ kind: activeKind, count: 0 }, ...availableKinds];
}

export function isDashboardFeedTopicLensLoading(
  activeTag: string | null,
  topicBaseLoading: boolean,
  topicSelectionLoading: boolean,
): boolean {
  if (!activeTag) return false;
  return topicBaseLoading || topicSelectionLoading;
}

export function resolveDashboardFeedTopicLensError(
  activeTag: string | null,
  loading: boolean,
  topicSelectionError: unknown,
  topicBaseError: unknown,
): string | null {
  if (!activeTag || loading) return null;
  if (topicSelectionError) {
    return topicSelectionError instanceof Error ? topicSelectionError.message : String(topicSelectionError);
  }
  if (topicBaseError) {
    return topicBaseError instanceof Error ? topicBaseError.message : String(topicBaseError);
  }
  return null;
}

export function resolveDashboardFeedTopicBaseMessages<T>(
  activeTag: string | null,
  latest: DashboardFeedTopicBaseResult<T> | null | undefined,
): T[] {
  if (!activeTag || !latest || latest.tag !== activeTag) return [];
  return latest.messages;
}

export function resolveDashboardFeedTopicSelectionMessages<T>(
  activeTag: string | null,
  activeKind: string | null,
  latest: DashboardFeedTopicSelectionResult<T> | null | undefined,
): T[] {
  if (!activeTag || !latest || latest.tag !== activeTag) return [];
  if ((latest.kind ?? null) !== (activeKind ?? null)) return [];
  return latest.messages;
}

export function normalizeDashboardFeedActiveTopicKind(
  activeTag: string | null,
  activeKind: string | null,
  availableKinds: DashboardFeedTopicKindCount[],
): string | null {
  if (!activeTag || !activeKind) return null;
  if (availableKinds.length === 0) return activeKind;
  return availableKinds.some((entry) => entry.kind === activeKind) ? activeKind : null;
}
