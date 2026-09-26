// @locs-version: 1.0
export const JUST_REGISTERED_KEY = "omnyid.just_registered";
export const ONBOARDING_DONE_KEY = "omnyid.onboarding.done";

export function loadOnboardingDone(): boolean {
  try {
    const stored = localStorage.getItem(ONBOARDING_DONE_KEY);
    if (stored === "true") return true;
    if (stored === "false" || stored === null) return false;
    localStorage.setItem(ONBOARDING_DONE_KEY, "false");
    return false;
  } catch {
    return false;
  }
}

export function saveOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "true");
  } catch {
    // ignore storage failures
  }
}

export function completeWelcomeOnboarding(): void {
  try {
    localStorage.removeItem(JUST_REGISTERED_KEY);
  } catch {
    // ignore storage failures
  }
  saveOnboardingDone();
}
