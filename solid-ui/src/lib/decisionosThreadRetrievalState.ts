// @locs-version: 1.0
type RetrievalStateLike =
  | {
      summary: string;
      badges: string[];
    }
  | null
  | undefined;

export function decisionOsLeadingThreadCue(
  state: RetrievalStateLike,
): string | null {
  const summary = state?.summary?.trim();
  if (!summary) return null;
  const match = summary.match(/Leading neighborhood cue:\s+(.+?)\./i);
  return match?.[1]?.trim() || null;
}

export function decisionOsThreadSupportState(
  state: RetrievalStateLike,
): {
  badge: string;
  summary: string;
  tone: "info" | "warning";
} | null {
  const badges = state?.badges ?? [];
  if (badges.includes("fresh-thread supported")) {
    return {
      badge: "Fresh thread support",
      summary: "Fresher thread evidence is supporting this retrieval.",
      tone: "info",
    };
  }
  if (badges.includes("older-thread supported")) {
    return {
      badge: "Older thread support",
      summary: "Older thread evidence is still driving this retrieval.",
      tone: "warning",
    };
  }
  return null;
}

export function decisionOsThreadRetrievalBadges(
  badges: string[] | null | undefined,
): string[] {
  return (badges ?? []).filter(
    (badge) =>
      badge !== "fresh-top-thread"
      && badge !== "active-top-thread"
      && badge !== "stale-top-thread"
      && badge !== "fresh thread support"
      && badge !== "older thread support",
  );
}
