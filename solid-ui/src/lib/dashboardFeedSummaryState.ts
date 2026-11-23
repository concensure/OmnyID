// @locs-version: 1.0
export function buildDashboardFeedActiveTypeScopeLabel(
  activeTypes: string[],
  labelForType: (type: string) => string,
): string | null {
  if (activeTypes.length === 0) return null;
  if (activeTypes.length === 1) return `type ${labelForType(activeTypes[0])}`;
  return `${activeTypes.length} types`;
}

export function buildDashboardFeedAllCaughtUpSummaryParts(input: {
  activeTopicKindLabel?: string | null;
  activeSupertag?: string | null;
  activeTypeScopeLabel?: string | null;
  dismissedCount: number;
  snoozedCount: number;
}): string[] {
  const parts: string[] = [];
  if (input.dismissedCount > 0) {
    parts.push(`${input.dismissedCount} card${input.dismissedCount === 1 ? "" : "s"} dismissed`);
  }
  if (input.snoozedCount > 0) {
    parts.push(`${input.snoozedCount} snoozed`);
  }
  if (input.activeTypeScopeLabel) {
    parts.push(input.activeTypeScopeLabel);
  }
  if (input.activeSupertag) {
    parts.push(`topic #${input.activeSupertag}`);
  }
  if (input.activeTopicKindLabel) {
    parts.push(`kind ${input.activeTopicKindLabel}`);
  }
  return parts;
}
