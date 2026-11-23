// @locs-version: 1.0
export type ThreadMiniMapFailureReceipt = {
  title: string;
  summary: string;
  nextStep: string;
  tone: "danger" | "warning";
};

function normalizeFailureMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function buildThreadMiniMapFailureReceipt(
  errorMessage: string,
): ThreadMiniMapFailureReceipt {
  const normalized = normalizeFailureMessage(errorMessage);

  if (/unauthorized|401|forbidden|403|recent sign-in required/.test(normalized)) {
    return {
      title: "Backlinks graph needs a fresh sign-in",
      summary: "The knowledge mini-map was blocked because the current session is no longer trusted for this request.",
      nextStep: "Sign in again, then retry from the same thread.",
      tone: "danger",
    };
  }

  if (/timeout|timed out|connection reset|connection refused|network error|temporar/.test(normalized)) {
    return {
      title: "Backlinks graph could not load right now",
      summary: "The knowledge mini-map hit a temporary connectivity or service failure before it could finish loading.",
      nextStep: "Retry from the same thread. If it keeps failing, check workspace connectivity and server status.",
      tone: "warning",
    };
  }

  return {
    title: "Could not load backlinks graph",
    summary: "The knowledge mini-map is unavailable right now.",
    nextStep: "Retry from the same thread. If it keeps failing, check session health and workspace status.",
    tone: "warning",
  };
}
