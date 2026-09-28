// @locs-version: 1.0
export type WeddingFirstRunIntakeGateInput = {
  hasTemplateLaunch: boolean;
  hasPersistedWorkspaceContent: boolean;
  followUpRequested: boolean;
};

export function shouldShowWeddingFirstRunIntake(input: WeddingFirstRunIntakeGateInput): boolean {
  return input.hasTemplateLaunch
    && !input.hasPersistedWorkspaceContent
    && !input.followUpRequested;
}
