// @locs-version: 1.0
import type { AfpMessage, ThreadSummary, ThreadSummariesResponse } from "@/lib/api";
import { afpOptionalRecord, afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent, decryptedDisplayLabel } from "@/lib/decryptedDisplayState";
import {
  absoluteUtcTimestamp,
  utcShortDateLabel,
  utcWeekdayDateLabel,
} from "@/lib/messageTimestampPresentation";
import { surfaceRelativeTimestamp } from "@/lib/surfaceTimestampPresentation";
import type { ThreadQueryHistoryEntry } from "@/lib/threadListLocalState";
import { threadMessageTitle } from "@/lib/threadMessageRowState";
import { threadSortMillis, type ThreadSortMode } from "@/lib/threadSort";
import { threadSummariesList } from "@/lib/threadSummariesResponseState";

export type ThreadListEntry = {
  threadId: string;
  messages: AfpMessage[];
  lastMessage: AfpMessage;
  isSearch: boolean;
};

export type SenderGroup = {
  sender: string;
  channel: string;
  channelIcon: string;
  msgs: AfpMessage[];
};

export type ThreadPreviewMetaState = {
  absoluteTimestampText: string;
  intentLabelText: string;
  relativeTimestampText: string;
};

export type ThreadQueryHistoryPresentation = {
  absoluteTimestampText: string;
  relativeTimestampText: string;
  weekdayDateText: string;
};

export type SuggestionGroup = {
  entityId: string | null;
  label: string;
  msgs: AfpMessage[];
  urgency: string;
};

export type DayDivider = { _kind: "divider"; label: string };
export type ThreadEntryFlat = ({ _kind: "thread" } & ThreadListEntry);
export type FlatListItem = DayDivider | ThreadEntryFlat;

export type MergeablePair = {
  pairKey: string;
  idA: string;
  idB: string;
};

export function threadListScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function threadListFirstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = threadListScalarString(record[key]).trim();
    if (value) return value;
  }
  return fallback;
}

export function threadTitle(threadId: string, messages: AfpMessage[]): string {
  return threadMessageTitle(threadId, messages);
}

export function deriveThreadSender(message: AfpMessage): string {
  const content = message.encryption ? decryptedDisplayContent(message) : afpRecord(message.content);
  const metadata = afpOptionalRecord(message.metadata);
  return (
    threadListFirstString(content, ["from", "sender", "author", "from_name"])
    || threadListFirstString(metadata ?? {}, ["sender", "from", "author"], "Unknown")
  );
}

export function deriveThreadNoticeChannel(message: AfpMessage): { label: string; icon: string } {
  if (message.type.includes("email") || message.type.includes("inbox")) {
    return { label: "email", icon: "âœ‰" };
  }
  if (message.type.includes("slack") || message.subtype?.includes("slack")) {
    return { label: "Slack", icon: "ðŸ’¬" };
  }
  return { label: "chat", icon: "ðŸ—¨" };
}

export function relativeThreadTime(isoString: string | undefined, nowMs = Date.now()): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const relative = surfaceRelativeTimestamp(isoString, nowMs);
  if (!relative) return "";
  const ageMs = nowMs - date.getTime();
  return ageMs >= 7 * 86400_000 ? threadShortDateLabel(isoString) : relative;
}

export function threadShortDateLabel(isoString: string | undefined): string {
  if (!isoString) return "";
  const label = utcShortDateLabel(isoString);
  return label === isoString ? "" : label;
}

export function threadWeekdayDateLabel(isoString: string | undefined): string {
  if (!isoString) return "";
  const label = utcWeekdayDateLabel(isoString);
  return label === isoString ? "" : label;
}

export function threadAbsoluteTimestamp(isoString: string | undefined): string {
  if (!isoString) return "";
  return absoluteUtcTimestamp(isoString);
}

export function threadSenderColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) & 0xffff;
  }
  return `hsl(${hash % 360},55%,52%)`;
}

export function threadSenderInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function threadIntentLabel(messageType: string): string {
  if (messageType === "proactive_suggestion") return "Suggestion";
  if (messageType === "summary") return "Summary";
  if (messageType.includes("draft")) return "Draft";
  if (messageType === "clarification_request") return "Question";
  return "Update";
}

export function threadPreviewMetaState(
  message: Pick<AfpMessage, "type" | "timestamp">,
  nowMs = Date.now(),
): ThreadPreviewMetaState {
  return {
    absoluteTimestampText: threadAbsoluteTimestamp(message.timestamp),
    intentLabelText: threadIntentLabel(message.type),
    relativeTimestampText: relativeThreadTime(message.timestamp, nowMs),
  };
}

export function threadBoundaryLabel(timestamp: string | undefined): string {
  const label = threadShortDateLabel(timestamp);
  return label ? `You returned Â· ${label}` : "";
}

export function threadQueryHistoryPresentation(
  entry: Pick<ThreadQueryHistoryEntry, "timestamp">,
  nowMs = Date.now(),
): ThreadQueryHistoryPresentation {
  return {
    absoluteTimestampText: threadAbsoluteTimestamp(entry.timestamp),
    relativeTimestampText: relativeThreadTime(entry.timestamp, nowMs),
    weekdayDateText: threadWeekdayDateLabel(entry.timestamp),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlightThreadMatch(text: string, query: string): string {
  const safe = escapeHtml(text);
  if (!query.trim()) return safe;
  try {
    const safeQuery = escapeHtml(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return safe.replace(new RegExp(`(${safeQuery})`, "gi"), "<mark>$1</mark>");
  } catch {
    return safe;
  }
}

export function threadListMessageText(message: AfpMessage, fallback = message.type): string {
  return decryptedDisplayLabel(message)
    ?? threadListFirstString(decryptedDisplayContent(message), ["summary", "text", "body"], fallback);
}

export function threadListMessageIntentText(message: AfpMessage): string {
  return decryptedDisplayLabel(message)
    ?? threadListFirstString(decryptedDisplayContent(message), ["intent", "query", "subject"]);
}

export function threadMarkdownLines(
  thread: Pick<ThreadListEntry, "threadId" | "messages">,
  titleText?: string | null,
): string[] {
  const lines: string[] = [`# ${titleText?.trim() || threadTitle(thread.threadId, thread.messages)}`, "", `> Thread ID: ${thread.threadId}`, ""];
  for (const message of thread.messages) {
    const text = threadListMessageText(message, "");
    const timestampText = threadAbsoluteTimestamp(message.timestamp);
    lines.push(`## ${message.type}${timestampText ? ` - ${timestampText}` : ""}`, "");
    if (text) lines.push(text, "");
  }
  return lines;
}

export function threadSupertags(messages: AfpMessage[]): string[] {
  const tags = new Set<string>();
  for (const message of messages) {
    for (const tag of message.supertags ?? []) {
      const normalized = String(tag ?? "").trim().toLowerCase();
      if (normalized) tags.add(normalized);
    }
  }
  return [...tags];
}

function supertagTopicKey(tags: string[]): string | null {
  const preferredPrefixes = ["project:", "area:", "resource:", "topic:"];
  for (const prefix of preferredPrefixes) {
    const match = tags.find((tag) => tag.startsWith(prefix) && tag.length > prefix.length);
    if (match) return match.slice(prefix.length);
  }
  const generic = tags[0];
  return generic ? generic.replace(/^#/, "") : null;
}

export function topicWords(messages: AfpMessage[]): string[] {
  const stop = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "this", "that", "it", "as", "we", "i", "you",
  ]);
  const counts: Record<string, number> = {};
  for (const message of messages) {
    const content = decryptedDisplayContent(message);
    const text = threadListFirstString(content, ["summary", "text", "body"]).toLowerCase();
    for (const word of text.split(/\W+/).filter((entry) => entry.length > 3 && !stop.has(entry))) {
      counts[word] = (counts[word] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([word]) => word);
}

export function dominantThreadTopicKey(messages: AfpMessage[]): string {
  const canonical = supertagTopicKey(threadSupertags(messages));
  if (canonical) return canonical;
  return topicWords(messages)[0] ?? "general";
}

export function summaryToPseudoMessage(summary: ThreadSummary): AfpMessage {
  return {
    id: `thread-summary:${summary.thread_id}`,
    thread_id: summary.thread_id,
    from: "system",
    to: [],
    timestamp: summary.last_message_at,
    type: "ledger",
    kind: summary.dominant_kind ?? "chat_thread",
    subtype: "thread_summary",
    supertags: summary.supertags,
    content: {
      title: summary.title,
      summary: summary.preview,
    },
    metadata: {
      source: "thread_summary_search",
      score: summary.score,
      message_count: summary.message_count,
    },
    views: [],
    attachments: [],
    references: [],
    encryption: null,
    signature: "",
  };
}

export function buildThreadEntries(messages: AfpMessage[], threadSummaries?: ThreadSummary[]): ThreadListEntry[] {
  const grouped = new Map<string, AfpMessage[]>();
  for (const message of messages) {
    const entries = grouped.get(message.thread_id) ?? [];
    entries.push(message);
    grouped.set(message.thread_id, entries);
  }
  const localThreads = [...grouped.entries()].map(([threadId, threadMessages]) => ({
    threadId,
    messages: threadMessages,
    lastMessage: threadMessages[threadMessages.length - 1],
    isSearch: threadMessages.some((message) => message.type === "research"),
  }));
  const rank = new Map((threadSummaries ?? []).map((summary, index) => [summary.thread_id, index]));
  return localThreads.sort((left, right) => {
    const leftRank = rank.get(left.threadId);
    const rightRank = rank.get(right.threadId);
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    }
    return (right.lastMessage?.timestamp ?? "").localeCompare(left.lastMessage?.timestamp ?? "");
  });
}

export function buildThreadMentionMap(threads: ThreadListEntry[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const thread of threads) {
    const hasMention = thread.messages.some((message) => {
      const content = message.encryption ? decryptedDisplayContent(message) : afpRecord(message.content);
      const text = threadListFirstString(content, ["text", "body", "summary"]);
      return /@\w+/.test(text);
    });
    result.set(thread.threadId, hasMention);
  }
  return result;
}

export function buildNoticeGroupsBySender(messages: AfpMessage[]): SenderGroup[] {
  const grouped = new Map<string, SenderGroup>();
  const noticeMessages = messages.filter((message) =>
    message.type.includes("email")
    || message.type.includes("inbox")
    || message.type.includes("slack")
    || message.subtype?.includes("slack")
    || message.type === "agent",
  ).slice(0, 50);
  for (const message of noticeMessages) {
    const sender = deriveThreadSender(message);
    const { label, icon } = deriveThreadNoticeChannel(message);
    const key = `${sender}::${label}`;
    if (!grouped.has(key)) {
      grouped.set(key, { sender, channel: label, channelIcon: icon, msgs: [] });
    }
    grouped.get(key)?.msgs.push(message);
  }
  return [...grouped.values()].sort((left, right) => right.msgs.length - left.msgs.length);
}

export function filterOrderedThreads(params: {
  threads: ThreadListEntry[];
  order: string[];
  query: string;
  remoteThreadResponse: ThreadSummariesResponse | null;
  searchByServer: boolean;
}): ThreadListEntry[] {
  const { threads, order, query, remoteThreadResponse, searchByServer } = params;
  if (searchByServer) {
    const localById = new Map(threads.map((thread) => [thread.threadId, thread]));
    return threadSummariesList(remoteThreadResponse).map((summary) => {
      const existing = localById.get(summary.thread_id);
      if (existing) return existing;
      const pseudo = summaryToPseudoMessage(summary);
      return {
        threadId: summary.thread_id,
        messages: [pseudo],
        lastMessage: pseudo,
        isSearch: false,
      };
    });
  }
  const normalizedQuery = query.toLowerCase();
  const filtered = normalizedQuery
    ? threads.filter((thread) => {
        const title = threadTitle(thread.threadId, thread.messages).toLowerCase();
        const topic = dominantThreadTopicKey(thread.messages).toLowerCase();
        const tags = threadSupertags(thread.messages);
        return title.includes(normalizedQuery)
          || topic.includes(normalizedQuery)
          || tags.some((tag) => tag.includes(normalizedQuery));
      })
    : threads;
  if (order.length === 0) return filtered;
  const filteredById = new Map(filtered.map((thread) => [thread.threadId, thread]));
  const sorted = order
    .map((threadId) => filteredById.get(threadId))
    .filter((thread): thread is ThreadListEntry => Boolean(thread));
  const remaining = filtered.filter((thread) => !order.includes(thread.threadId));
  return [...sorted, ...remaining];
}

export function availableThreadSupertagCounts(threads: ThreadListEntry[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    for (const tag of threadSupertags(thread.messages)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => {
      const countDiff = right[1] - left[1];
      return countDiff !== 0 ? countDiff : left[0].localeCompare(right[0]);
    })
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

export function sortVisibleThreads(params: {
  threads: ThreadListEntry[];
  pinnedThreads: Set<string>;
  mentionedThreads: Map<string, boolean>;
  starredThreads: Set<string>;
  unreadCount: (threadId: string, messages: AfpMessage[]) => number;
  sortMode: ThreadSortMode;
}): ThreadListEntry[] {
  const { threads, pinnedThreads, mentionedThreads, starredThreads, unreadCount, sortMode } = params;
  return [...threads].sort((left, right) => {
    const leftPin = pinnedThreads.has(left.threadId) ? 8 : 0;
    const rightPin = pinnedThreads.has(right.threadId) ? 8 : 0;
    const score = (thread: ThreadListEntry) => {
      let total = 0;
      if (mentionedThreads.get(thread.threadId)) total += 4;
      if (starredThreads.has(thread.threadId)) total += 2;
      if (unreadCount(thread.threadId, thread.messages) > 0) total += 1;
      return total;
    };
    const weightedDiff = (rightPin + score(right)) - (leftPin + score(left));
    if (weightedDiff !== 0) return weightedDiff;
    const recencyDiff = threadSortMillis(right.messages, sortMode) - threadSortMillis(left.messages, sortMode);
    if (recencyDiff !== 0) return recencyDiff;
    return right.threadId.localeCompare(left.threadId);
  });
}

export function filterArchivedThreads(
  threads: ThreadListEntry[],
  archivedThreads: Set<string>,
  showArchived: boolean,
): ThreadListEntry[] {
  return threads.filter((thread) =>
    showArchived ? archivedThreads.has(thread.threadId) : !archivedThreads.has(thread.threadId),
  );
}

export function buildMergeableThreadPairs(
  threads: ThreadListEntry[],
  dismissedPairs: Set<string>,
  titles: Record<string, string>,
): MergeablePair[] {
  const stop = new Set(["this", "that", "with", "from", "have", "will", "your", "about", "been", "they", "email", "thread"]);
  const pairs: MergeablePair[] = [];
  for (let leftIndex = 0; leftIndex < Math.min(threads.length, 12); leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < Math.min(threads.length, 12); rightIndex += 1) {
      const left = threads[leftIndex];
      const right = threads[rightIndex];
      const pairKey = [left.threadId, right.threadId].sort().join("::");
      if (dismissedPairs.has(pairKey)) continue;
      const leftTitle = (titles[left.threadId] ?? threadTitle(left.threadId, left.messages)).toLowerCase();
      const rightTitle = (titles[right.threadId] ?? threadTitle(right.threadId, right.messages)).toLowerCase();
      const leftWords = new Set(leftTitle.split(/\W+/).filter((word) => word.length > 3 && !stop.has(word)));
      const common = rightTitle
        .split(/\W+/)
        .filter((word) => word.length > 3 && !stop.has(word) && leftWords.has(word));
      if (common.length >= 2) {
        pairs.push({ pairKey, idA: left.threadId, idB: right.threadId });
      }
    }
  }
  return pairs.slice(0, 1);
}

export function prioritySortedThreads(
  threads: ThreadListEntry[],
  priorities: Record<string, string | null>,
): ThreadListEntry[] {
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return [...threads].sort((left, right) => {
    const leftRank = rank[priorities[left.threadId] ?? ""] ?? 0;
    const rightRank = rank[priorities[right.threadId] ?? ""] ?? 0;
    return rightRank - leftRank;
  });
}

export function buildFlatItemsWithDividers(
  threads: ThreadListEntry[],
  nowMs = Date.now(),
): FlatListItem[] {
  const items: FlatListItem[] = [];
  let lastDay = "";
  for (const thread of threads) {
    const date = thread.lastMessage?.timestamp ? new Date(thread.lastMessage.timestamp) : null;
    let dayLabel = "";
    if (date && !Number.isNaN(date.getTime())) {
      const diffDays = Math.floor((nowMs - date.getTime()) / 86400000);
      if (diffDays === 0) dayLabel = "Today";
      else if (diffDays === 1) dayLabel = "Yesterday";
      else dayLabel = threadWeekdayDateLabel(thread.lastMessage.timestamp);
    }
    if (dayLabel && dayLabel !== lastDay) {
      items.push({ _kind: "divider", label: dayLabel });
      lastDay = dayLabel;
    }
    items.push({ _kind: "thread", ...thread });
  }
  return items;
}

export function buildTopicGroups(threads: ThreadListEntry[]): Map<string, ThreadListEntry[]> {
  const groups = new Map<string, ThreadListEntry[]>();
  for (const thread of threads) {
    const key = dominantThreadTopicKey(thread.messages);
    const entries = groups.get(key) ?? [];
    entries.push(thread);
    groups.set(key, entries);
  }
  return groups;
}

export function buildSuggestionGroups(messages: AfpMessage[]): SuggestionGroup[] {
  const grouped = new Map<string, SuggestionGroup>();
  for (const message of messages.filter((entry) => entry.type === "proactive_suggestion")) {
    const content = decryptedDisplayContent(message);
    const entityId = threadListScalarString(content.entity_id, "general");
    const urgency = threadListScalarString(content.urgency, "medium");
    const label = entityId === "general" ? "Agent suggestions" : `Agent suggestions â€” ${entityId}`;
    if (!grouped.has(entityId)) {
      grouped.set(entityId, { entityId, label, msgs: [], urgency });
    }
    grouped.get(entityId)?.msgs.push(message);
  }
  const urgencyOrder = ["high", "medium", "low"];
  return [...grouped.values()].sort(
    (left, right) => urgencyOrder.indexOf(left.urgency) - urgencyOrder.indexOf(right.urgency),
  );
}

export function proactiveSuggestionCount(messages: AfpMessage[]): number {
  return messages.filter((message) => message.type === "proactive_suggestion").length;
}
