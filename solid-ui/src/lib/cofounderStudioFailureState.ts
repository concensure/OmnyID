// @locs-version: 1.0
export type CofounderStudioFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildCofounderStudioFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): CofounderStudioFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This launchpad action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same startup launchpad session.",
      tone: "danger",
    };
  }

  if (/not configured|missing model|missing provider|api key required|hosted ai requires a pro workspace|no model configured/.test(normalized)) {
    return {
      title: `${actionLabel} needs AI setup first`,
      summary: "The launchpad could not continue because the workspace AI provider or model configuration is incomplete.",
      nextStep: "Finish AI setup in settings, then retry the same startup launch flow.",
      tone: "warning",
    };
  }

  if (/lost connection to run stream|eventsource|stream closed|sse|stream disconnected/.test(normalized)) {
    return {
      title: `${actionLabel} lost its live connection`,
      summary: "The launchpad lost the live workflow stream before it could keep updating progress in place.",
      nextStep: "Retry the stream from this screen. If it keeps disconnecting, check workspace connectivity and workflow service health.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The launchpad action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same startup launchpad session. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The launchpad action did not complete successfully.",
    nextStep: "Retry from the same startup launchpad session. If it keeps failing, check session health and workflow service status.",
    tone: "warning",
  };
}
