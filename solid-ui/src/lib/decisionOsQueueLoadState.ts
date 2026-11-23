// @locs-version: 1.0
export type DecisionOsQueueLoadTrend = "up" | "down" | "steady";

export function nextQueueMinutesBaseline(
  currentBaseline: number,
  currentMinutes: number,
): number {
  if (currentBaseline >= 0) return currentBaseline;
  if (currentMinutes < 0) return currentBaseline;
  return currentMinutes;
}

export function decisionOsQueueLoadTrend(
  baselineMinutes: number,
  currentMinutes: number,
): DecisionOsQueueLoadTrend {
  if (baselineMinutes < 0) return "steady";
  if (currentMinutes > baselineMinutes) return "up";
  if (currentMinutes < baselineMinutes) return "down";
  return "steady";
}
