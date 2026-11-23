// @locs-version: 1.0
export type GenerativeCardFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildGenerativeCardFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): GenerativeCardFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This run was blocked because the current session is no longer trusted for that action.",
      nextStep: "Sign in again, then retry from the same generative card.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The run hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same generative card. If it keeps failing, verify workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The requested run did not complete successfully.",
    nextStep: "Retry from the same generative card. If it keeps failing, verify session health and workspace status.",
    tone: "warning",
  };
}
