// @locs-version: 1.0
import type { AgentSearchResult } from "@/lib/api";
import { utcTitleDateLabel } from "@/lib/messageTimestampPresentation";
import type { PublicArticle } from "@/lib/publicFeedResponseState";
import { isRecord } from "@/lib/eventDetail";

function publicFeedScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function publicFeedArticleTitle(item: PublicArticle): string {
  if (isRecord(item.content)) {
    return publicFeedScalarString(item.content.title)
      || publicFeedScalarString(item.content.body).slice(0, 80)
      || item.id;
  }
  return publicFeedScalarString(item.content).slice(0, 80) || item.id;
}

export function publicFeedArticleBody(item: PublicArticle): string {
  if (isRecord(item.content)) {
    return publicFeedScalarString(item.content.body) || publicFeedScalarString(item.content.text);
  }
  return publicFeedScalarString(item.content);
}

export function publicFeedDateLabel(timestamp: string): string {
  return utcTitleDateLabel(timestamp);
}

export function publicFeedEngagementRows(item: PublicArticle): string[] {
  if (!item.engagement) return [];
  return [
    `Views ${item.engagement.views}`,
    `Replies ${item.engagement.replies}`,
  ];
}

export function publicFeedShareLabel(item: PublicArticle, shareInProgress: boolean): string {
  if (shareInProgress) return "Sharing...";
  return `Share${item.engagement?.shares ? ` (${item.engagement.shares})` : ""}`;
}

export function publicFeedFollowLabel(params: {
  agentId: string;
  followingSet: Set<string>;
  followingInProgressAgentId: string | null;
}): string {
  const { agentId, followingSet, followingInProgressAgentId } = params;
  if (followingSet.has(agentId)) return "Following";
  if (followingInProgressAgentId === agentId) return "Following...";
  return "Follow";
}

export function publicFeedSearchHeadline(query: string): string {
  return `Agents matching "${query}"`;
}

export function publicFeedSearchResults(results: AgentSearchResult[] | null | undefined): AgentSearchResult[] {
  return Array.isArray(results) ? results : [];
}
