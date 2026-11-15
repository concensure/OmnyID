// @locs-version: 1.0

export type WeddingInitialExperienceMode = "resolving" | "intake" | "workspace" | "retry";

export type WeddingInitialExperienceInput = {
  signedIn: boolean;
  hasTemplateLaunch: boolean;
  hasPersistedWorkspaceContent: boolean;
  followUpRequested: boolean;
  onboardingResolved: boolean;
  workspaceRefreshStatus: "skipped" | "loaded" | "error" | null;
  intakeVariantResolved: boolean;
};

/**
 * Chooses one first Wedding surface. In particular, an empty starter launch is
 * not treated as proof that a signed-in account needs intake until the same
 * account's saved Wedding projection has finished loading.
 */
export function weddingInitialExperienceMode(
  input: WeddingInitialExperienceInput,
): WeddingInitialExperienceMode {
  const intakeEligible = input.hasTemplateLaunch
    && !input.hasPersistedWorkspaceContent
    && !input.followUpRequested;

  if (!input.hasTemplateLaunch || !input.signedIn) {
    return intakeEligible ? "intake" : "workspace";
  }

  if (!input.onboardingResolved || input.workspaceRefreshStatus === null) {
    return "resolving";
  }

  // An empty fallback after a failed account refresh is not evidence of a new
  // account. Do not show onboarding until saved-plan absence is authoritative.
  if (input.workspaceRefreshStatus === "error" && intakeEligible) {
    return "retry";
  }

  if (intakeEligible) {
    return input.intakeVariantResolved ? "intake" : "resolving";
  }

  return "workspace";
}
