// @locs-version: 1.0
export type AttachmentsRendererFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAttachmentsRendererFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AttachmentsRendererFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This attachment action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry the same attachment action.",
      tone: "danger",
    };
  }

  if (/no inline audio source|no download source available|server-side access/.test(normalized)) {
    return {
      title: `${actionLabel} is not available here`,
      summary: "This attachment does not expose a browser-safe preview source in the current context.",
      nextStep: "Open the source message from a workspace with full attachment access or use a downloadable version instead.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|fetch failed|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The attachment request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry the same attachment action. If it keeps failing, verify workspace connectivity and try again shortly.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The attachment request did not complete successfully.",
    nextStep: "Retry the same attachment action. If it keeps failing, verify session health and attachment availability.",
    tone: "warning",
  };
}
