// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

export type ThreadSortMode = "activity" | "recently_edited";

const EDIT_TIMESTAMP_KEYS = [
  "updated_at",
  "edited_at",
  "modified_at",
  "last_modified",
  "revision_timestamp",
] as const;

function parseIsoMillis(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

export function messageEffectiveEditMillis(message: AfpMessage): number {
  const content = afpOptionalRecord(decryptedDisplayContent(message));
  const metadata = afpOptionalRecord(message.metadata);
  let latest = parseIsoMillis(message.timestamp) ?? 0;
  for (const key of EDIT_TIMESTAMP_KEYS) {
    latest = Math.max(
      latest,
      parseIsoMillis(content?.[key]) ?? 0,
      parseIsoMillis(metadata?.[key]) ?? 0,
    );
  }
  return latest;
}

export function threadSortMillis(messages: AfpMessage[], mode: ThreadSortMode): number {
  if (messages.length === 0) return 0;
  if (mode === "activity") {
    return messages.reduce((latest, message) => Math.max(latest, parseIsoMillis(message.timestamp) ?? 0), 0);
  }
  return messages.reduce((latest, message) => Math.max(latest, messageEffectiveEditMillis(message)), 0);
}
