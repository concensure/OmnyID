// @locs-version: 1.0
import type { InboxSummary } from "@/lib/firstRunExperienceResponseState";
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import type { LocalGmailSyncPreference } from "@/lib/emailLocalState";

export type EmailGmailSyncUiState = {
  visible: boolean;
  title: string;
  detail: string;
  modeLabel: string;
  summaryLabel: string | null;
  actionLabel: string;
  tone: "neutral" | "success" | "warning";
};

export function buildEmailGmailSyncUiState(input: {
  connected: GmailConnectionStatus | null;
  preference: LocalGmailSyncPreference;
  summary?: InboxSummary | null;
  loading?: boolean;
  error?: string | null;
}): EmailGmailSyncUiState {
  if (!input.connected?.connected) {
    return {
      visible: false,
      title: "Gmail not connected",
      detail: "Connect Gmail before checking what OmnyID can show here.",
      modeLabel: "New mail only",
      summaryLabel: null,
      actionLabel: "Check Gmail",
      tone: "neutral",
    };
  }

  const modeLabel = input.preference === "full_inbox" ? "Full inbox" : "New mail only";
  const summary = input.summary ?? null;
  const loading = input.loading === true;
  const error = input.error?.trim() || null;
  const summaryLabel = summary
    ? `${summary.total_unread} unread · ${summary.needs_reply} need reply · ${summary.newsletters} newsletters`
    : null;

  if (loading) {
    return {
      visible: true,
      title: "Checking Gmail",
      detail: "OmnyID is asking Gmail for the latest inbox summary.",
      modeLabel,
      summaryLabel,
      actionLabel: "Checking...",
      tone: "neutral",
    };
  }

  if (error) {
    return {
      visible: true,
      title: "Gmail check did not finish",
      detail: error,
      modeLabel,
      summaryLabel,
      actionLabel: "Try again",
      tone: "warning",
    };
  }

  if (summary) {
    return {
      visible: true,
      title: "Gmail is reachable",
      detail: input.preference === "full_inbox"
        ? "This confirms Gmail access. Older mail appears in Email after the inbox history sync saves it as OmnyID email records."
        : "This confirms Gmail access. New incoming mail appears here after OmnyID syncs and saves it as email records.",
      modeLabel,
      summaryLabel,
      actionLabel: "Refresh Gmail check",
      tone: "success",
    };
  }

  return {
    visible: true,
    title: "Gmail connected",
    detail: input.preference === "full_inbox"
      ? "OmnyID can use this Gmail account. Older mail appears here after history sync saves it as email records."
      : "New Gmail messages appear here after OmnyID syncs and saves them as email records.",
    modeLabel,
    summaryLabel: null,
    actionLabel: "Check Gmail now",
    tone: "neutral",
  };
}
