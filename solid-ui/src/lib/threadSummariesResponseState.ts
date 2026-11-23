// @locs-version: 1.0
import type { ThreadSummary, ThreadSummariesResponse } from "./api";
import type { ParsedThreadSearch } from "./threadSearch";

export function isThreadSummariesSearchActive(parsed: ParsedThreadSearch): boolean {
  return (
    parsed.query.length >= 2
    || parsed.tags.length > 0
    || Boolean(parsed.kind)
    || parsed.threadIds.length > 0
    || parsed.fromAgents.length > 0
    || Boolean(parsed.timeRange?.from)
    || Boolean(parsed.timeRange?.to)
  );
}

export function buildThreadSummariesSearchRequest(
  parsed: ParsedThreadSearch,
  limit: number,
): {
  query?: string;
  tags: string[];
  kind?: string;
  threadIds: string[];
  fromAgents: string[];
  timeFrom?: string;
  timeTo?: string;
  match: "all" | "any";
  limit: number;
} {
  return {
    query: parsed.query || undefined,
    tags: parsed.tags,
    kind: parsed.kind,
    threadIds: parsed.threadIds,
    fromAgents: parsed.fromAgents,
    timeFrom: parsed.timeRange?.from,
    timeTo: parsed.timeRange?.to,
    match: parsed.tags.length > 1 ? "all" : "any",
    limit,
  };
}

export function threadSummariesList(response?: ThreadSummariesResponse | null): ThreadSummary[] {
  return response?.thread_summaries ?? [];
}

export function threadSummariesRetrievalState(
  response?: ThreadSummariesResponse | null,
): ThreadSummariesResponse["retrieval_state"] | null {
  return response?.retrieval_state ?? null;
}
