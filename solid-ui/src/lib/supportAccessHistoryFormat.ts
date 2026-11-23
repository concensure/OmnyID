// @locs-version: 1.0
import { dateTimeLabel, durationLabel, relativeTimeLabel } from "@/lib/agentSettingsRuntimeFormat";

export type SupportAccessHistoryEntry = {
  id?: string;
  status: string;
  access_scope: string;
  granted_at: string;
  expires_at: string;
  revoked_at?: string | null;
  reason?: string | null;
};

export type SupportAccessHistoryCard = {
  title: string;
  lines: string[];
};

export function supportAccessHistoryLines(entry: SupportAccessHistoryEntry): string[] {
  return [
    `granted ${dateTimeLabel(entry.granted_at)} | expires ${dateTimeLabel(entry.expires_at)}`,
    `consent window ${durationLabel(entry.granted_at, entry.revoked_at ?? entry.expires_at) ?? "unknown"}${entry.revoked_at ? ` | revoked ${dateTimeLabel(entry.revoked_at)}` : ""}`,
    `granted ${relativeTimeLabel(entry.granted_at)}${entry.revoked_at ? ` | revoked ${relativeTimeLabel(entry.revoked_at)}` : ` | expired ${relativeTimeLabel(entry.expires_at)}`}`,
    ...(entry.reason ? [entry.reason] : []),
  ];
}

export function supportAccessHistoryCard(entry: SupportAccessHistoryEntry): SupportAccessHistoryCard {
  return {
    title: `${entry.status} | ${entry.access_scope}`,
    lines: supportAccessHistoryLines(entry),
  };
}

export function supportAccessHistoryCards(
  entries: SupportAccessHistoryEntry[] | null | undefined,
  limit = 3,
): SupportAccessHistoryCard[] {
  return (entries ?? []).slice(0, limit).map((entry) => supportAccessHistoryCard(entry));
}
