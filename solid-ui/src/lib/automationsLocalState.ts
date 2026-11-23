// @locs-version: 1.0
export const AUTOMATIONS_DRY_RUN_KEY = "omnyid.dry-run";

export function loadAutomationsDryRun(): boolean {
  try {
    const stored = localStorage.getItem(AUTOMATIONS_DRY_RUN_KEY);
    if (stored === "true") return true;
    if (stored === "false" || stored === null) return false;
    localStorage.setItem(AUTOMATIONS_DRY_RUN_KEY, "false");
    return false;
  } catch {
    return false;
  }
}

export function saveAutomationsDryRun(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOMATIONS_DRY_RUN_KEY, enabled ? "true" : "false");
  } catch {
    // ignore storage failures
  }
}
