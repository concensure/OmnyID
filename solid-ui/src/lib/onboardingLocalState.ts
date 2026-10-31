// @locs-version: 1.0
export const JUST_REGISTERED_KEY = "omnyid.just_registered";
export const ONBOARDING_DONE_KEY = "omnyid.onboarding.done";

function scopedKey(baseKey: string, userId?: string | null): string {
  const scope = userId?.trim();
  return scope ? `${baseKey}:${scope}` : baseKey;
}

export function loadOnboardingDone(userId?: string | null): boolean {
  const key = scopedKey(ONBOARDING_DONE_KEY, userId);
  try {
    const stored = localStorage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false" || stored === null) return false;
    localStorage.setItem(key, "false");
    return false;
  } catch {
    return false;
  }
}

export function saveOnboardingDone(userId?: string | null): void {
  try {
    localStorage.setItem(scopedKey(ONBOARDING_DONE_KEY, userId), "true");
  } catch {
    // ignore storage failures
  }
}

export function completeWelcomeOnboarding(userId?: string | null): void {
  try {
    localStorage.removeItem(scopedKey(JUST_REGISTERED_KEY, userId));
  } catch {
    // ignore storage failures
  }
  saveOnboardingDone(userId);
}
