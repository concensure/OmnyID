// @locs-version: 1.0
import {
  objectRetrievalStateBadges,
  topObjectFreshnessState,
  type ObjectMessagesLike,
  type ObjectRetrievalLaunchLike,
  type RetrievalStateLike,
} from "afp-ts/retrieval";

export type DecisionOsTopObjectFreshnessState = {
  badge: string;
  summary: string;
  tone: "success" | "info" | "warning";
};

export type DecisionOsObjectSupportState = {
  badge: string;
  summary: string;
  tone: "info" | "warning";
};

export function decisionOsTopObjectFreshnessState(
  state?: RetrievalStateLike | null,
): DecisionOsTopObjectFreshnessState | null {
  const freshness = topObjectFreshnessState(state);
  return freshness
    ? {
        badge: freshness.badge,
        summary: freshness.summary,
        tone: freshness.tone,
      }
    : null;
}

export function decisionOsTopObjectFreshnessSummary(
  state?: RetrievalStateLike | null,
): string | null {
  return decisionOsTopObjectFreshnessState(state)?.summary ?? null;
}

export function decisionOsLeadingObjectCue(
  state?: RetrievalStateLike | null,
): string | null {
  const summary = state?.summary?.trim();
  if (!summary) return null;
  const match = summary.match(/Leading object cue:\s+(.+?)\./i);
  return match?.[1]?.trim() || null;
}

export function decisionOsObjectSupportState(
  state?: RetrievalStateLike | null,
): DecisionOsObjectSupportState | null {
  const badges = state?.badges ?? [];
  if (badges.includes("fresh-object supported")) {
    return {
      badge: "Fresh object support",
      summary: "Fresher object evidence is supporting this retrieval.",
      tone: "info",
    };
  }
  if (badges.includes("older-object supported")) {
    return {
      badge: "Older object support",
      summary: "Older object evidence is still driving this retrieval.",
      tone: "warning",
    };
  }
  return null;
}

export function decisionOsObjectRetrievalBadges(args: {
  result: ObjectMessagesLike;
  launchContext?: ObjectRetrievalLaunchLike | null;
  focusedObjectId?: string | null;
}): string[] {
  return objectRetrievalStateBadges(args).filter(
    (badge) =>
      badge !== "fresh-top-object"
      && badge !== "active-top-object"
      && badge !== "stale-top-object"
      && badge !== "fresh object support"
      && badge !== "older object support",
  );
}
