// @locs-version: 1.0
export const FIRST_RUN_EXPERIENCE_DONE_KEY = "omnyid.fre.done";

export function loadFirstRunExperienceDone(): boolean {
  try {
    const stored = localStorage.getItem(FIRST_RUN_EXPERIENCE_DONE_KEY);
    if (stored === "true") return true;
    if (stored === "false" || stored === null) return false;
    localStorage.setItem(FIRST_RUN_EXPERIENCE_DONE_KEY, "false");
    return false;
  } catch {
    return false;
  }
}

export function saveFirstRunExperienceDone(): void {
  try {
    localStorage.setItem(FIRST_RUN_EXPERIENCE_DONE_KEY, "true");
  } catch {
    // ignore storage failures
  }
}
