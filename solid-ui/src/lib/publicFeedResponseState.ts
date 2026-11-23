// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type PublicArticle = {
  id: string;
  thread_id: string;
  from_agent: string;
  type: string;
  content: { title?: string; body?: string; text?: string } | string;
  timestamp: string;
  engagement?: { views: number; shares: number; replies: number };
};

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeArticleContent(value: unknown): PublicArticle["content"] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!isRecord(value)) return "";
  const title = scalarString(value.title);
  const body = scalarString(value.body);
  const text = scalarString(value.text);
  return {
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
    ...(text ? { text } : {}),
  };
}

function normalizeEngagement(value: unknown): PublicArticle["engagement"] {
  if (!isRecord(value)) return undefined;
  return {
    views: finiteCount(value.views),
    shares: finiteCount(value.shares),
    replies: finiteCount(value.replies),
  };
}

export function normalizePublicArticle(value: unknown): PublicArticle | null {
  if (!isRecord(value)) return null;
  const id = scalarString(value.id);
  const fromAgent = scalarString(value.from_agent);
  if (!id || !fromAgent) return null;
  return {
    id,
    thread_id: scalarString(value.thread_id),
    from_agent: fromAgent,
    type: scalarString(value.type, "article"),
    content: normalizeArticleContent(value.content),
    timestamp: scalarString(value.timestamp),
    engagement: normalizeEngagement(value.engagement),
  };
}

export function normalizePublicFeedResponse(value: unknown): PublicArticle[] {
  const record = isRecord(value) ? value : {};
  return Array.isArray(record.items)
    ? record.items.map(normalizePublicArticle).filter((item): item is PublicArticle => Boolean(item))
    : [];
}
