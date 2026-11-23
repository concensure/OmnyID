// @locs-version: 1.0
export type RuntimeRunnerFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildRuntimeRunnerFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): RuntimeRunnerFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This runner action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the runner view.",
      tone: "danger",
    };
  }

  if (/private runtimes disabled|runtime.*disabled|feature.*disabled|503|service unavailable/.test(normalized)) {
    return {
      title: `${actionLabel} is not available in this workspace`,
      summary: "Private runtime operations are currently disabled for this homeserver or deployment shape.",
      nextStep: "Enable private runtimes on the server, or use a workspace where the runner feature is available.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The runner action hit a temporary connectivity or runtime availability failure before it could complete.",
      nextStep: "Retry from the runner view. If it keeps failing, check runtime health and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The runner operation did not complete successfully.",
    nextStep: "Retry from the runner view. If it keeps failing, check session health and runtime availability.",
    tone: "warning",
  };
}
