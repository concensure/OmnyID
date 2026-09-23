// @locs-version: 1.0
const WEDDING_RETURN_INTENT_KEY = "omnyid.wedding.return-intent";

/** Call right before navigating a user away from the wedding workspace to connect a provider. */
export function saveWeddingReturnIntent(): void {
  try {
    localStorage.setItem(WEDDING_RETURN_INTENT_KEY, "1");
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

/** Reads and clears the flag in one step, so the return banner only ever shows once per detour. */
export function loadAndClearWeddingReturnIntent(): boolean {
  try {
    const present = localStorage.getItem(WEDDING_RETURN_INTENT_KEY) === "1";
    if (present) localStorage.removeItem(WEDDING_RETURN_INTENT_KEY);
    return present;
  } catch {
    return false;
  }
}
