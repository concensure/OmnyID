// @locs-version: 1.0
export type FirstRunExperienceFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildFirstRunExperienceFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): FirstRunExperienceFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This first-run inbox action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same inbox setup flow.",
      tone: "danger",
    };
  }

  if (/authori[sz]ation was not confirmed in time|timed out|timeout/.test(normalized)) {
    return {
      title: `${actionLabel} timed out`,
      summary: "The inbox setup flow waited for Gmail authorisation, but it was not confirmed before the timeout window ended.",
      nextStep: "Retry Gmail setup and finish the Google authorisation prompt before returning here.",
      tone: "warning",
    };
  }

  if (/connection reset|connection refused|network error|temporar|could not send/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The inbox setup action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same inbox setup flow. If it keeps failing, check workspace connectivity and Gmail integration status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The inbox setup action did not complete successfully.",
    nextStep: "Retry from the same inbox setup flow. If it keeps failing, check session health and Gmail integration status.",
    tone: "warning",
  };
}

export function buildFirstRunGmailOAuthFailureReceipt(
  diagnosticMessage: string,
): FirstRunExperienceFailureReceipt {
  return {
    title: "Gmail connection needs configuration",
    summary: diagnosticMessage.trim() || "Gmail OAuth could not start from this homeserver.",
    nextStep: "Fix the Google OAuth client setup, then retry Connect Gmail from this setup flow.",
    tone: "danger",
  };
}
