// @locs-version: 1.0
import type { UiCommandResponse } from "@/lib/api";

export type MasterAgentConversationLink = {
  title: string;
  url: string;
  kind: string;
};

export type MasterAgentConversationState = {
  userText: string;
  assistantMarkdown: string;
  bullets: string[];
  links: MasterAgentConversationLink[];
};

function safeConversationLink(url: string): boolean {
  const value = url.trim();
  return value.startsWith("https://") || value.startsWith("http://") || value.startsWith("/");
}

export function buildMasterAgentConversationState(
  query: string,
  response: Pick<UiCommandResponse, "summary" | "bullets" | "links">,
): MasterAgentConversationState {
  const assistantMarkdown = response.summary.trim() || "The Master Agent completed the request.";
  const seenBullets = new Set<string>();
  const bullets = (response.bullets ?? []).flatMap((item) => {
    const normalized = item.trim();
    if (!normalized || seenBullets.has(normalized) || normalized === assistantMarkdown) return [];
    seenBullets.add(normalized);
    return [normalized];
  }).slice(0, 8);
  const seenLinks = new Set<string>();
  const links = response.links.flatMap((link) => {
    const url = link.url.trim();
    if (!safeConversationLink(url) || seenLinks.has(url)) return [];
    seenLinks.add(url);
    return [{ title: link.title.trim() || url, url, kind: link.kind }];
  }).slice(0, 8);

  return {
    userText: query.trim(),
    assistantMarkdown,
    bullets,
    links,
  };
}
