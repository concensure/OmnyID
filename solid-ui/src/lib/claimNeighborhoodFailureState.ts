// @locs-version: 1.0
export type ClaimNeighborhoodFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildClaimNeighborhoodFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ClaimNeighborhoodFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This claim neighborhood lookup was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry the same neighborhood lookup.",
      tone: "danger",
    };
  }

  if (/not indexed|indexing|not ready yet/.test(normalized)) {
    return {
      title: `${actionLabel} is still being prepared`,
      summary: "Typed support and refute context is not indexed for this message yet.",
      nextStep: "Retry in a moment. If it still does not appear, refresh the source thread and try again.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The claim neighborhood lookup hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry the same lookup. If it keeps failing, verify workspace connectivity and try again later.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The claim neighborhood lookup did not complete successfully.",
    nextStep: "Retry the same lookup. If it keeps failing, refresh the source thread and verify session health.",
    tone: "warning",
  };
}
