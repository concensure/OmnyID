// @locs-version: 1.0
export type ContactsFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildContactsFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ContactsFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "The contact was saved locally, but the agent sync was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry the sync from this workspace if you still want the agent to learn about the contact.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not reach the agent right now`,
      summary: "The contact was saved locally, but the best-effort sync hit a temporary connectivity or service failure.",
      nextStep: "Retry later from this workspace. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} stayed local only`,
    summary: "The contact was saved in this workspace, but the agent sync did not complete successfully.",
    nextStep: "Retry later from this workspace if you want the agent to use this contact.",
    tone: "warning",
  };
}
