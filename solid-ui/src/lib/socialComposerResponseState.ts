// @locs-version: 1.0
export type SocialComposerPlatform = "linkedin" | "x" | "bluesky";

export type SocialComposerSuggestion = {
  id: string;
  kind: "tone" | "hashtag" | "timing" | "rewrite";
  label: string;
  body: string;
  action?: string;
};

export type SocialComposerPost = {
  id: string;
  platform: SocialComposerPlatform;
  content: string;
  publishedAt: string;
  likes: number;
  reposts: number;
  replies: number;
};

const PLATFORMS = new Set<SocialComposerPlatform>(["linkedin", "x", "bluesky"]);
const SUGGESTION_KINDS = new Set<SocialComposerSuggestion["kind"]>(["tone", "hashtag", "timing", "rewrite"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function parsePlatform(value: unknown): SocialComposerPlatform | null {
  return typeof value === "string" && PLATFORMS.has(value as SocialComposerPlatform)
    ? value as SocialComposerPlatform
    : null;
}

function parseSuggestionKind(value: unknown): SocialComposerSuggestion["kind"] | null {
  return typeof value === "string" && SUGGESTION_KINDS.has(value as SocialComposerSuggestion["kind"])
    ? value as SocialComposerSuggestion["kind"]
    : null;
}

export function parseSocialComposerPostsResponse(payload: unknown): SocialComposerPost[] {
  if (!isRecord(payload) || !Array.isArray(payload.posts)) return [];

  return payload.posts.flatMap((entry): SocialComposerPost[] => {
    if (!isRecord(entry)) return [];
    const id = nonEmptyString(entry.id);
    const platform = parsePlatform(entry.platform);
    const content = typeof entry.content === "string" ? entry.content : null;
    const publishedAt = nonEmptyString(entry.publishedAt);
    if (!id || !platform || content === null || !publishedAt) return [];
    return [{
      id,
      platform,
      content,
      publishedAt,
      likes: countValue(entry.likes),
      reposts: countValue(entry.reposts),
      replies: countValue(entry.replies),
    }];
  });
}

export function parseSocialComposerSuggestionsResponse(payload: unknown): SocialComposerSuggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.suggestions)) return [];

  return payload.suggestions.flatMap((entry): SocialComposerSuggestion[] => {
    if (!isRecord(entry)) return [];
    const id = nonEmptyString(entry.id);
    const kind = parseSuggestionKind(entry.kind);
    const label = nonEmptyString(entry.label);
    const body = nonEmptyString(entry.body);
    if (!id || !kind || !label || !body) return [];
    return [{
      id,
      kind,
      label,
      body,
      action: nonEmptyString(entry.action) ?? undefined,
    }];
  });
}

export function parseSocialComposerPublishResponse(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return nonEmptyString(payload.post_id);
}
