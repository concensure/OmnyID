// @locs-version: 1.0
export function retrievalBadgeTone(badge: string): "success" | "warning" | "info" | "neutral" {
  const normalized = badge.trim().toLowerCase();
  if (normalized === "kind concentrated" || normalized === "focused object") {
    return "success";
  }
  if (
    normalized === "mixed results"
    || normalized === "older object support"
    || normalized === "older thread support"
  ) {
    return "warning";
  }
  if (
    normalized === "narrowing-first"
    || normalized === "continuity-local"
    || normalized === "active-state weighted"
    || normalized === "fresh object support"
    || normalized === "fresh thread support"
    || normalized.startsWith("thread ")
    || normalized.startsWith("from ")
  ) {
    return "info";
  }
  return "neutral";
}
