// @locs-version: 1.0
export type CostDashboardFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildCostDashboardFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): CostDashboardFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This cost dashboard action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same dashboard.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar|failed to fetch|load failed/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The cost dashboard hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same dashboard. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The cost dashboard action did not complete successfully.",
    nextStep: "Retry from the same dashboard. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
