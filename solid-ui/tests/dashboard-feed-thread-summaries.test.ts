import test from "node:test";
import assert from "node:assert/strict";

import { collectDashboardFeedOpenThreadSummaries } from "../src/lib/dashboardFeedThreadSummaries.ts";

test("collectDashboardFeedOpenThreadSummaries uses the full scoped feed, not only the current page window", () => {
  const scopedMessages = [
    {
      id: "m-1",
      thread_id: "thread-1",
      type: "note",
      timestamp: "2026-07-04T09:00:00Z",
      content: { title: "Thread one" },
      kind: "note",
      supertags: [],
    },
    {
      id: "m-2",
      thread_id: "thread-2",
      type: "task",
      timestamp: "2026-07-04T10:00:00Z",
      content: { title: "Thread two" },
      kind: "task",
      supertags: [],
    },
  ] as any[];

  const summaries = [
    {
      thread_id: "thread-1",
      title: "Thread one",
      preview: "Thread one",
      message_count: 1,
      last_message_at: "2026-07-04T09:00:00Z",
      dominant_kind: "note",
      supertags: [],
      score: 1,
    },
    {
      thread_id: "thread-2",
      title: "Thread two",
      preview: "Thread two",
      message_count: 1,
      last_message_at: "2026-07-04T10:00:00Z",
      dominant_kind: "task",
      supertags: [],
      score: 1,
    },
  ];

  assert.deepEqual(
    collectDashboardFeedOpenThreadSummaries(scopedMessages as any, summaries).map((summary) => summary.thread_id),
    ["thread-1", "thread-2"],
  );
});

test("collectDashboardFeedOpenThreadSummaries falls back to scoped messages when no summary exists", () => {
  const scopedMessages = [
    {
      id: "m-3",
      thread_id: "thread-3",
      type: "email",
      timestamp: "2026-07-04T11:00:00Z",
      content: { title: "Fallback thread" },
      kind: "email",
      supertags: ["ops"],
    },
  ] as any[];

  const summaries: any[] = [];
  const [summary] = collectDashboardFeedOpenThreadSummaries(scopedMessages as any, summaries);

  assert.equal(summary.thread_id, "thread-3");
  assert.equal(summary.title, "Fallback thread");
  assert.equal(summary.message_count, 1);
});

test("collectDashboardFeedOpenThreadSummaries falls back when message content is malformed", () => {
  const scopedMessages = [
    {
      id: "m-malformed",
      thread_id: "thread-malformed",
      type: "email",
      timestamp: "2026-07-04T11:30:00Z",
      content: "bad",
      kind: "email",
      supertags: [],
    },
  ] as any[];

  const [summary] = collectDashboardFeedOpenThreadSummaries(scopedMessages as any, []);

  assert.equal(summary.thread_id, "thread-malformed");
  assert.equal(summary.title, "email");
  assert.equal(summary.preview, "email");
});

test("collectDashboardFeedOpenThreadSummaries ignores blank thread ids", () => {
  const scopedMessages = [
    {
      id: "m-blank",
      thread_id: "   ",
      type: "note",
      timestamp: "2026-07-04T12:00:00Z",
      content: { title: "Broken thread" },
      kind: "note",
      supertags: [],
    },
    {
      id: "m-live",
      thread_id: "thread-live",
      type: "note",
      timestamp: "2026-07-04T12:05:00Z",
      content: { title: "Live thread" },
      kind: "note",
      supertags: [],
    },
  ] as any[];

  const summaries = [
    {
      thread_id: "",
      title: "Blank summary",
      preview: "Blank summary",
      message_count: 1,
      last_message_at: "2026-07-04T12:00:00Z",
      dominant_kind: "note",
      supertags: [],
      score: 1,
    },
    {
      thread_id: "thread-live",
      title: "Live thread",
      preview: "Live thread",
      message_count: 1,
      last_message_at: "2026-07-04T12:05:00Z",
      dominant_kind: "note",
      supertags: [],
      score: 1,
    },
  ];

  assert.deepEqual(
    collectDashboardFeedOpenThreadSummaries(scopedMessages as any, summaries).map((summary) => summary.thread_id),
    ["thread-live"],
  );
});

test("collectDashboardFeedOpenThreadSummaries trims whitespace from returned summary thread ids", () => {
  const scopedMessages = [
    {
      id: "m-4",
      thread_id: "thread-trimmed",
      type: "note",
      timestamp: "2026-07-04T12:10:00Z",
      content: { title: "Trimmed thread" },
      kind: "note",
      supertags: [],
    },
  ] as any[];

  const summaries = [
    {
      thread_id: "  thread-trimmed  ",
      title: "Trimmed thread",
      preview: "Trimmed thread",
      message_count: 1,
      last_message_at: "2026-07-04T12:10:00Z",
      dominant_kind: "note",
      supertags: [],
      score: 1,
    },
  ];

  const [summary] = collectDashboardFeedOpenThreadSummaries(scopedMessages as any, summaries);
  assert.equal(summary.thread_id, "thread-trimmed");
});

test("collectDashboardFeedOpenThreadSummaries dedupes repeated summary thread ids", () => {
  const scopedMessages = [
    {
      id: "m-5",
      thread_id: "thread-dedupe",
      type: "note",
      timestamp: "2026-07-04T12:20:00Z",
      content: { title: "Deduped thread" },
      kind: "note",
      supertags: [],
    },
  ] as any[];

  const summaries = [
    {
      thread_id: "thread-dedupe",
      title: "Deduped thread",
      preview: "Deduped thread",
      message_count: 1,
      last_message_at: "2026-07-04T12:20:00Z",
      dominant_kind: "note",
      supertags: [],
      score: 1,
    },
    {
      thread_id: " thread-dedupe ",
      title: "Deduped thread duplicate",
      preview: "Deduped thread duplicate",
      message_count: 2,
      last_message_at: "2026-07-04T12:21:00Z",
      dominant_kind: "note",
      supertags: [],
      score: 0.5,
    },
  ];

  const results = collectDashboardFeedOpenThreadSummaries(scopedMessages as any, summaries);
  assert.equal(results.length, 1);
  assert.equal(results[0].thread_id, "thread-dedupe");
  assert.equal(results[0].title, "Deduped thread");
});
