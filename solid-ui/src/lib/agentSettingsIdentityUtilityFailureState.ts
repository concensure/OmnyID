// @locs-version: 1.0
export type AgentSettingsIdentityUtilityFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildAgentSettingsIdentityUtilityFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): AgentSettingsIdentityUtilityFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This identity utility action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same agent settings panel.",
      tone: "danger",
    };
  }

  if (/clipboard|notallowederror|denied|permission/.test(normalized)) {
    return {
      title: `${actionLabel} was blocked by the browser`,
      summary: "The browser did not allow OmnyID to copy the expected key prefix to your clipboard.",
      nextStep: "Allow clipboard access for this workspace, then try the same copy action again.",
      tone: "warning",
    };
  }

  if (/popup|pop-up|window open|window blocked|print preview/.test(normalized)) {
    return {
      title: `${actionLabel} was blocked by the browser`,
      summary: "The browser did not allow OmnyID to open the printable identity card preview window.",
      nextStep: "Allow pop-ups for this workspace, then retry the identity card export.",
      tone: "warning",
    };
  }

  if (/createobjecturl|object url|securityerror|download blocked/.test(normalized)) {
    return {
      title: `${actionLabel} was blocked by the browser`,
      summary: "The browser did not allow OmnyID to generate or start the requested export download.",
      nextStep: "Retry from a normal browser tab, or use a different browser if download protections keep blocking the export.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The identity utility action hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same agent settings panel. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The identity utility action did not complete successfully.",
    nextStep: "Retry from the same agent settings panel. If it keeps failing, check browser permissions and workspace status.",
    tone: "warning",
  };
}
