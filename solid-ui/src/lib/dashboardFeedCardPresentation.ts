// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";

export function dashboardFeedTypeHue(type: string): number {
  let hash = 0;
  for (let index = 0; index < type.length; index += 1) {
    hash = (hash * 31 + type.charCodeAt(index)) & 0xffff;
  }
  return hash % 360;
}

export function dashboardFeedMessageTypeLabel(type: string): string {
  switch (type) {
    case "relation_link":
      return "relations";
    case "knowledge_link":
      return "knowledge links";
    case "provenance_record":
      return "provenance";
    default:
      return type;
  }
}

export function dashboardFeedCardAgeOpacity(timestamp: string | undefined, nowMs = Date.now()): string {
  if (!timestamp) return "";
  const ageSeconds = Math.floor((nowMs - new Date(timestamp).getTime()) / 1000);
  if (ageSeconds > 72 * 3600) return "opacity-60";
  if (ageSeconds > 24 * 3600) return "opacity-80";
  return "";
}

export function dashboardFeedCardGridHeight(message: AfpMessage, expanded: boolean): number {
  if (!expanded) return 2;
  if (message.type === "generative_card") return 6;
  if (message.type.includes("search") || message.type === "research") return 5;
  if (message.type.includes("attachment") || message.type.includes("file")) return 5;
  return 4;
}

export function dashboardFeedScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function normalizeDashboardFeedSupertagKey(tag: string): string {
  return tag.replace(/^#/, "").trim().toLowerCase();
}
