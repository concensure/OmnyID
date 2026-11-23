// @locs-version: 1.0
import type { AfpMessage, ThreadSummary } from "@/lib/api";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

function fallbackSummaryText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function collectDashboardFeedOpenThreadSummaries(
  scopedMessages: AfpMessage[],
  summaries: ThreadSummary[],
  limit = 8,
): ThreadSummary[] {
  const visibleThreadIds = new Set(
    scopedMessages
      .map((message) => message.thread_id?.trim())
      .filter((threadId): threadId is string => Boolean(threadId))
  );
  const summaryMap = new Map(
    summaries
      .filter((summary) => summary.thread_id.trim().length > 0)
      .map((summary) => [summary.thread_id.trim(), summary])
  );
  const fallbackMessageMap = new Map<string, AfpMessage[]>();

  for (const message of scopedMessages) {
    const threadId = message.thread_id?.trim();
    if (!threadId) continue;
    const arr = fallbackMessageMap.get(threadId) ?? [];
    arr.push(message);
    fallbackMessageMap.set(threadId, arr);
  }

  const seenOrderedThreadIds = new Set<string>();
  const ordered: ThreadSummary[] = [];
  for (const summary of summaries) {
    const threadId = summary.thread_id.trim();
    if (!visibleThreadIds.has(threadId) || seenOrderedThreadIds.has(threadId)) continue;
    seenOrderedThreadIds.add(threadId);
    ordered.push({ ...summary, thread_id: threadId });
  }
  for (const [threadId, threadMessages] of fallbackMessageMap.entries()) {
    if (summaryMap.has(threadId)) continue;
    const first = threadMessages[0];
    const last = threadMessages[threadMessages.length - 1];
    const content = afpOptionalRecord(first?.content);
    const raw = fallbackSummaryText(content?.title)
      ?? fallbackSummaryText(content?.summary)
      ?? fallbackSummaryText(content?.description)
      ?? fallbackSummaryText(first?.type)
      ?? threadId;
    ordered.push({
      thread_id: threadId,
      title: raw,
      preview: raw,
      message_count: threadMessages.length,
      last_message_at: last?.timestamp ?? "",
      dominant_kind: first?.kind ?? null,
      supertags: first?.supertags ?? [],
      score: 0,
    });
  }

  return ordered.slice(0, Math.max(0, limit));
}
