// @locs-version: 1.0
export type AddCapabilityFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAddCapabilityFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AddCapabilityFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "The capability could not be created because the current session is no longer trusted for this workspace change.",
      nextStep: "Sign in again, then retry creating the capability from this dialog.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar|failed to fetch|load failed/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The capability create request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from this dialog. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The capability was not created successfully.",
    nextStep: "Retry from this dialog. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
