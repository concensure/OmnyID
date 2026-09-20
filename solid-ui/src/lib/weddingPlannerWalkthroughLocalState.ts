// @locs-version: 1.0
const WEDDING_PLANNER_WALKTHROUGH_KEY = "omnyid.wedding.walkthrough.seen";

function scopedWeddingPlannerWalkthroughKey(userId?: string | null): string {
  return userId ? `${WEDDING_PLANNER_WALKTHROUGH_KEY}:${userId}` : WEDDING_PLANNER_WALKTHROUGH_KEY;
}

export function loadShouldShowWeddingPlannerWalkthrough(userId?: string | null, storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(scopedWeddingPlannerWalkthroughKey(userId)) !== "1";
  } catch {
    return true;
  }
}

export function saveWeddingPlannerWalkthroughSeen(userId?: string | null, storage: Storage = localStorage): void {
  try {
    storage.setItem(scopedWeddingPlannerWalkthroughKey(userId), "1");
  } catch {
    // Ignore unavailable storage; the guide button remains available.
  }
}
