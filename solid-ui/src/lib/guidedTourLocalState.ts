// @locs-version: 1.0
export const GUIDED_TOUR_KEY_BASE = "omnyid.tour.done";

export function guidedTourStorageKey(userId?: string): string {
  return userId ? `${GUIDED_TOUR_KEY_BASE}.${userId}` : GUIDED_TOUR_KEY_BASE;
}

export function loadShouldShowGuidedTour(userId?: string): boolean {
  try {
    const key = guidedTourStorageKey(userId);
    const stored = localStorage.getItem(key);
    if (stored === "true") return false;
    if (stored === "false" || stored === null) return true;
    localStorage.setItem(key, "false");
    return true;
  } catch {
    return true;
  }
}

export function saveGuidedTourSeen(userId?: string): void {
  try {
    localStorage.setItem(guidedTourStorageKey(userId), "true");
  } catch {
    // ignore storage failures
  }
}
