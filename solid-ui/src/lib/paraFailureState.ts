// @locs-version: 1.0
export type ParaFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildParaFailureReceipt(
  actionLabel: string,
  errorMessage: string,
): ParaFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: `${actionLabel} needs a fresh sign-in`,
      summary: "This PARA action was blocked because the current session is no longer trusted for it.",
      nextStep: "Sign in again, then retry from the same PARA view.",
      tone: "danger",
    };
  }

  if (/quota|archive-only|archive only|max single upload|upload limit|storage policy/.test(normalized)) {
    return {
      title: `${actionLabel} is blocked by storage policy`,
      summary: errorMessage,
      nextStep: "Free space, switch storage mode, or upgrade storage before retrying from PARA.",
      tone: "warning",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar|failed to fetch|load failed|upload failed/.test(normalized)) {
    return {
      title: `${actionLabel} could not finish right now`,
      summary: "The PARA request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same PARA view. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: `${actionLabel} failed`,
    summary: "The PARA action did not complete successfully.",
    nextStep: "Retry from the same PARA view. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
