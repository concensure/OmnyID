// @locs-version: 2.0
export type WeddingAdminDataConsentInput = {
  enabled?: boolean | null;
  workspaceId?: string | null;
  planId?: string | null;
  submittedResponseCount?: number | null;
  lastSubmittedAt?: string | null;
};

export type WeddingAdminDataConsentState = {
  enabled: boolean;
  toggleLabel: string;
  iconLabel: string;
  hoverMessage: string;
  statusLabel: string;
  includedLabels: string[];
  excludedLabels: string[];
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function buildWeddingAdminDataConsentState(
  input: WeddingAdminDataConsentInput = {},
): WeddingAdminDataConsentState {
  const enabled = input.enabled === true;
  void clean(input.workspaceId);
  void clean(input.planId);
  void count(input.submittedResponseCount);
  void clean(input.lastSubmittedAt);
  return {
    enabled,
    toggleLabel: "Share content-free progress statistics with OmnyID",
    iconLabel: "How optional product statistics work",
    hoverMessage: "Optional and off by default. Authorised administrators can count selected completed actions, but cannot see the wedding details behind those counts. Public website analytics is a separate choice.",
    statusLabel: enabled
      ? "Product statistics are on for this wedding. You can turn them off here at any time."
      : "Product statistics are off. Declining does not change the planner.",
    includedLabels: ["onboarding completed", "vendor saved", "decision resolved"],
    excludedLabels: ["names and contact details", "message or draft text", "budget and guest count", "quiz answers and files", "which vendor you chose"],
  };
}
