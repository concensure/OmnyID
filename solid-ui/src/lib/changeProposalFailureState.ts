// @locs-version: 1.0
export type ChangeProposalFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildChangeProposalFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ChangeProposalFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This change could not be applied because the current session is no longer trusted for that action.",
      nextStep: "Sign in again, then retry from the same review card.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The change request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same review card. If it keeps failing, verify workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The proposed change did not complete successfully.",
    nextStep: "Retry from the same review card. If it keeps failing, verify session health and workspace status.",
    tone: "warning",
  };
}
