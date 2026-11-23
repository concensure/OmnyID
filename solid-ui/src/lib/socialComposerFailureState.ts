// @locs-version: 1.0
export type SocialComposerFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildSocialComposerFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): SocialComposerFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This social publishing action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same social composer.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The social publishing request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same social composer. If it keeps failing, check workspace connectivity and publishing service status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The social publishing request did not complete successfully.",
    nextStep: "Retry from the same social composer. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
