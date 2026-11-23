// @locs-version: 1.0
export type MapRendererFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildMapRendererFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): MapRendererFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This map action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same map panel.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar|check your connection/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The map request hit a temporary connectivity or tile/service failure before it could complete.",
      nextStep: "Retry from the same map panel. If it keeps failing, verify connectivity and map service availability.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The map action did not complete successfully.",
    nextStep: "Retry from the same map panel. If it keeps failing, verify session health and workspace status.",
    tone: "warning",
  };
}
