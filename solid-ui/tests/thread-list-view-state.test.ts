import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage, ThreadSummary, ThreadSummariesResponse } from "@/lib/api";
import {
  availableThreadSupertagCounts,
  buildFlatItemsWithDividers,
  buildMergeableThreadPairs,
  buildNoticeGroupsBySender,
  buildSuggestionGroups,
  buildThreadEntries,
  buildThreadMentionMap,
  buildTopicGroups,
  deriveThreadNoticeChannel,
  deriveThreadSender,
  filterArchivedThreads,
  filterOrderedThreads,
  highlightThreadMatch,
  prioritySortedThreads,
  proactiveSuggestionCount,
  relativeThreadTime,
  sortVisibleThreads,
  summaryToPseudoMessage,
  threadAbsoluteTimestamp,
  threadBoundaryLabel,
  threadIntentLabel,
  threadListMessageIntentText,
  threadListMessageText,
  threadMarkdownLines,
  threadPreviewMetaState,
  threadQueryHistoryPresentation,
  threadShortDateLabel,
  threadSenderInitials,
  threadSupertags,
  threadWeekdayDateLabel,
} from "@/lib/threadListViewState";

function message(overrides: Partial<AfpMessage> & Pick<AfpMessage, "id" | "thread_id" | "type">): AfpMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id,
    from: overrides.from ?? "user",
    to: overrides.to ?? [],
    timestamp: overrides.timestamp ?? "2026-08-14T08:00:00.000Z",
    type: overrides.type,
    kind: overrides.kind ?? "chat_thread",
    subtype: overrides.subtype ?? null,
    supertags: overrides.supertags ?? [],
    content: overrides.content ?? {},
    metadata: overrides.metadata ?? {},
    views: overrides.views ?? [],
    attachments: overrides.attachments ?? [],
    references: overrides.references ?? [],
    encryption: overrides.encryption ?? null,
    signature: overrides.signature ?? "",
  };
}

test("thread list state normalizes sender, notice channel, and presentation helpers", () => {
  const email = message({
    id: "m-email",
    thread_id: "t-email",
    type: "email_notice",
    content: { from: "Jordan Lee", text: "Status update" },
    metadata: { sender: "ignored" },
  });
  const slack = message({
    id: "m-slack",
    thread_id: "t-slack",
    type: "agent",
    subtype: "slack_notice",
    content: { sender: "Casey" },
  });

  assert.equal(deriveThreadSender(email), "Jordan Lee");
  assert.deepEqual(deriveThreadNoticeChannel(email), { label: "email", icon: "✉" });
  assert.deepEqual(deriveThreadNoticeChannel(slack), { label: "Slack", icon: "💬" });
  assert.equal(threadIntentLabel("clarification_request"), "Question");
  assert.equal(threadSenderInitials("Jordan Lee"), "JL");
  assert.equal(
    relativeThreadTime("2026-08-14T07:59:30.000Z", Date.parse("2026-08-14T08:00:00.000Z")),
    "just now",
  );
  assert.equal(
    relativeThreadTime("2026-08-01T23:30:00.000Z", Date.parse("2026-08-14T08:00:00.000Z")),
    "Aug 1",
  );
  assert.match(highlightThreadMatch("Roadmap review", "map"), /<mark>map<\/mark>/i);
  assert.equal(threadShortDateLabel("2026-08-31T23:45:00.000Z"), "Aug 31");
  assert.equal(threadWeekdayDateLabel("2026-08-31T23:45:00.000Z"), "Mon, Aug 31");
  assert.equal(threadAbsoluteTimestamp("2026-08-31T23:45:00.000Z"), "2026-08-31 23:45 UTC");
  assert.equal(threadBoundaryLabel("2026-08-31T23:45:00.000Z"), "You returned · Aug 31");
  assert.equal(threadListMessageText(email), "Status update");
  assert.equal(
    threadListMessageIntentText(message({
      id: "m-intent",
      thread_id: "t-intent",
      type: "chat",
      content: { intent: "Review roadmap" },
    })),
    "Review roadmap",
  );
  assert.deepEqual(
    threadPreviewMetaState(email, Date.parse("2026-08-14T08:00:00.000Z")),
    {
      absoluteTimestampText: "2026-08-14 08:00 UTC",
      intentLabelText: "Update",
      relativeTimestampText: "just now",
    },
  );
  assert.deepEqual(
    threadQueryHistoryPresentation(
      { timestamp: "2026-08-31T23:45:00.000Z" },
      Date.parse("2026-09-01T00:00:00.000Z"),
    ),
    {
      absoluteTimestampText: "2026-08-31 23:45 UTC",
      relativeTimestampText: "15m ago",
      weekdayDateText: "Mon, Aug 31",
    },
  );
});

test("thread list state builds ordered entries and remote fallback summaries", () => {
  const local = [
    message({ id: "m-1", thread_id: "t-1", type: "chat", timestamp: "2026-08-14T07:00:00.000Z" }),
    message({ id: "m-2", thread_id: "t-2", type: "research", timestamp: "2026-08-14T08:00:00.000Z" }),
  ];
  const summaries: ThreadSummary[] = [
    {
      thread_id: "t-2",
      title: "Ranked second thread",
      preview: "Preview",
      last_message_at: "2026-08-14T08:00:00.000Z",
      dominant_kind: "chat_thread",
      score: 0.9,
      message_count: 3,
      supertags: ["topic:ops"],
    },
  ];

  const entries = buildThreadEntries(local, summaries);
  assert.deepEqual(entries.map((entry) => entry.threadId), ["t-2", "t-1"]);
  assert.equal(entries[0].isSearch, true);

  const remoteResponse = {
    ok: true,
    thread_summaries: [
      {
        thread_id: "t-3",
        title: "Remote only",
        preview: "Server ranked",
        last_message_at: "2026-08-14T09:00:00.000Z",
        dominant_kind: "chat_thread",
        score: 0.95,
        message_count: 1,
        supertags: ["project:apollo"],
      },
    ],
  } satisfies ThreadSummariesResponse;

  const remoteFiltered = filterOrderedThreads({
    threads: entries,
    order: [],
    query: "apollo",
    remoteThreadResponse: remoteResponse,
    searchByServer: true,
  });
  assert.deepEqual(remoteFiltered.map((entry) => entry.threadId), ["t-3"]);
  assert.equal(remoteFiltered[0].messages[0].metadata?.source, "thread_summary_search");
});

test("thread list state shows encrypted placeholders instead of ciphertext body text", () => {
  const encrypted = message({
    id: "m-encrypted",
    thread_id: "t-encrypted",
    type: "chat",
    content: { text: "@alex hidden body", ciphertext: "secret-ciphertext", nonce: "secret-nonce" },
    encryption: { scheme: "omnyid-envelope-v1" },
  });
  const entry = {
    threadId: "t-encrypted",
    messages: [encrypted],
    lastMessage: encrypted,
    isSearch: false,
  };

  assert.equal(threadListMessageText(encrypted), "Encrypted message - unlock this device to view");
  assert.equal(threadListMessageIntentText(encrypted), "Encrypted message - unlock this device to view");
  assert.equal(buildThreadMentionMap([entry]).get("t-encrypted"), false);
  assert.deepEqual(threadMarkdownLines(entry), [
    "# Encrypted message - unlock this device to view",
    "",
    "> Thread ID: t-encrypted",
    "",
    "## chat - 2026-08-14 08:00 UTC",
    "",
    "Encrypted message - unlock this device to view",
    "",
  ]);
});

test("thread list state centralizes mentions tags sorting archive and merge heuristics", () => {
  const t1 = {
    threadId: "t-1",
    messages: [
      message({
        id: "m-1",
        thread_id: "t-1",
        type: "chat",
        timestamp: "2026-08-14T08:00:00.000Z",
        content: { text: "@alex roadmap review" },
        supertags: ["topic:roadmap", "project:apollo"],
      }),
    ],
    lastMessage: message({
      id: "m-1",
      thread_id: "t-1",
      type: "chat",
      timestamp: "2026-08-14T08:00:00.000Z",
      content: { text: "@alex roadmap review" },
      supertags: ["topic:roadmap", "project:apollo"],
    }),
    isSearch: false,
  };
  const t2 = {
    threadId: "t-2",
    messages: [
      message({
        id: "m-2",
        thread_id: "t-2",
        type: "chat",
        timestamp: "2026-08-13T08:00:00.000Z",
        content: { text: "apollo roadmap planning" },
        supertags: ["project:apollo"],
      }),
    ],
    lastMessage: message({
      id: "m-2",
      thread_id: "t-2",
      type: "chat",
      timestamp: "2026-08-13T08:00:00.000Z",
      content: { text: "apollo roadmap planning" },
      supertags: ["project:apollo"],
    }),
    isSearch: false,
  };

  const mentions = buildThreadMentionMap([t1, t2]);
  assert.equal(mentions.get("t-1"), true);
  assert.equal(mentions.get("t-2"), false);
  assert.deepEqual(threadSupertags(t1.messages), ["topic:roadmap", "project:apollo"]);
  assert.deepEqual(availableThreadSupertagCounts([t1, t2]), [
    { tag: "project:apollo", count: 2 },
    { tag: "topic:roadmap", count: 1 },
  ]);

  const sorted = sortVisibleThreads({
    threads: [t2, t1],
    pinnedThreads: new Set<string>(["t-2"]),
    mentionedThreads: mentions,
    starredThreads: new Set<string>(),
    unreadCount: (threadId) => (threadId === "t-1" ? 1 : 0),
    sortMode: "activity",
  });
  assert.deepEqual(sorted.map((entry) => entry.threadId), ["t-2", "t-1"]);
  assert.deepEqual(
    filterArchivedThreads(sorted, new Set<string>(["t-2"]), false).map((entry) => entry.threadId),
    ["t-1"],
  );
  assert.deepEqual(
    buildMergeableThreadPairs(
      [t1, t2],
      new Set<string>(),
      { "t-1": "Apollo roadmap review", "t-2": "Apollo roadmap planning" },
    ),
    [{ pairKey: "t-1::t-2", idA: "t-1", idB: "t-2" }],
  );
  assert.deepEqual(
    prioritySortedThreads([t1, t2], { "t-1": "high", "t-2": null }).map((entry) => entry.threadId),
    ["t-1", "t-2"],
  );
  assert.equal(buildFlatItemsWithDividers([t1, t2], Date.parse("2026-08-14T12:00:00.000Z"))[0]._kind, "divider");
  assert.deepEqual([...buildTopicGroups([t1, t2]).keys()], ["apollo"]);
});

test("thread list state centralizes notice and suggestion grouping", () => {
  const messages = [
    message({
      id: "m-email-1",
      thread_id: "notice-email",
      type: "email_notice",
      content: { from: "Jordan", subject: "One" },
    }),
    message({
      id: "m-email-2",
      thread_id: "notice-email",
      type: "email_notice",
      content: { from: "Jordan", subject: "Two" },
    }),
    message({
      id: "m-suggestion",
      thread_id: "suggestion-1",
      type: "proactive_suggestion",
      content: { entity_id: "finance", urgency: "high", action_label: "Review" },
    }),
  ];

  const groups = buildNoticeGroupsBySender(messages);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sender, "Jordan");
  assert.equal(groups[0].msgs.length, 2);

  const suggestionGroups = buildSuggestionGroups(messages);
  assert.equal(suggestionGroups[0]?.entityId, "finance");
  assert.equal(proactiveSuggestionCount(messages), 1);
});

test("thread list state does not group encrypted suggestions by hidden payload fields", () => {
  const encrypted = message({
    id: "m-encrypted-suggestion",
    thread_id: "suggestion-encrypted",
    type: "proactive_suggestion",
    content: {
      entity_id: "hidden-vendor",
      urgency: "high",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });

  const groups = buildSuggestionGroups([encrypted]);
  assert.equal(groups[0]?.entityId, "general");
  assert.equal(groups[0]?.urgency, "medium");
});

test("summaryToPseudoMessage preserves ranking metadata for remote thread results", () => {
  const pseudo = summaryToPseudoMessage({
    thread_id: "remote-1",
    title: "Remote title",
    preview: "Remote preview",
    last_message_at: "2026-08-14T10:00:00.000Z",
    dominant_kind: "chat_thread",
    score: 0.87,
    message_count: 4,
    supertags: ["area:ops"],
  });

  assert.equal(pseudo.id, "thread-summary:remote-1");
  assert.equal(pseudo.kind, "chat_thread");
  assert.deepEqual(pseudo.metadata, {
    source: "thread_summary_search",
    score: 0.87,
    message_count: 4,
  });
});

test("thread list state centralizes thread markdown export lines", () => {
  const lines = threadMarkdownLines(
    {
      threadId: "thread-1",
      messages: [
        message({
          id: "m-1",
          thread_id: "thread-1",
          type: "chat",
          timestamp: "2026-08-31T23:45:00.000Z",
          content: { title: "Roadmap review", summary: "Finalize September priorities." },
        }),
      ],
    },
    "Roadmap review",
  );

  assert.deepEqual(lines, [
    "# Roadmap review",
    "",
    "> Thread ID: thread-1",
    "",
    "## chat - 2026-08-31 23:45 UTC",
    "",
    "Finalize September priorities.",
    "",
  ]);
});
