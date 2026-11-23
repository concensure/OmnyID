import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSampleDashboardBootstrap,
  mergeDashboardBootstrapWithSample,
} from "../src/lib/sampleDashboard.ts";

test("sample dashboard merge adds only one clearly labelled demo message when live coverage is sparse", () => {
  const sample = buildSampleDashboardBootstrap({
    id: "user-1",
    email: "user@example.com",
    display_name: "User",
    auth_provider: "password",
  });
  const live = {
    ...sample,
    messages: [{
      ...sample.messages[0]!,
      id: "live-note-1",
      thread_id: "live-thread-1",
      content: { title: "My real note" },
      metadata: { source: "user" },
    }],
    thread_summaries: [],
    proactive_suggestions: [],
  };

  const merged = mergeDashboardBootstrapWithSample(live, sample);
  const demoMessages = merged.messages.filter((message) => message.metadata?.source === "sample_bootstrap");

  assert.equal(demoMessages.length, 1);
  assert.match(String(demoMessages[0]?.content?.title ?? ""), /^Demo:/);
  assert.deepEqual(demoMessages[0]?.supertags, ["Demo"]);
  assert.equal(merged.messages.filter((message) => message.metadata?.source === "user").length, 1);
});

test("sample dashboard merge leaves complete live coverage untouched", () => {
  const sample = buildSampleDashboardBootstrap({
    id: "user-2",
    email: "user2@example.com",
    display_name: "User Two",
    auth_provider: "password",
  });

  const merged = mergeDashboardBootstrapWithSample(sample, sample);

  assert.equal(merged.messages.length, sample.messages.length);
  assert.equal(
    merged.messages.filter((message) => message.metadata?.source === "sample_bootstrap").length,
    sample.messages.length,
  );
});

test("sample dashboard merge collapses legacy server demo seeds to one visible message", () => {
  const sample = buildSampleDashboardBootstrap({
    id: "user-3",
    email: "user3@example.com",
    display_name: "User Three",
    auth_provider: "password",
  });
  const legacyDemo = sample.messages.map((message, index) => ({
    ...message,
    id: `server-demo-${index}`,
    thread_id: `server-demo-thread-${index}`,
    metadata: { source: "server" },
    content: { title: `Demo ${index}`, kind: index === 0 ? "demo_seed" : "demo_seed_note" },
  }));
  legacyDemo.push({
    ...legacyDemo[0]!,
    id: "server-demo-extra",
    thread_id: "server-demo-thread-extra",
    content: { title: "Demo extra", kind: "demo_seed_note" },
  });

  const merged = mergeDashboardBootstrapWithSample({
    ...sample,
    messages: legacyDemo,
    thread_summaries: legacyDemo.map((message) => ({
      thread_id: message.thread_id,
      title: String(message.content.title),
      preview: "Demo",
      message_count: 1,
      last_message_at: message.timestamp,
      activity_freshness: "active",
      dominant_kind: "note",
      supertags: ["Demo"],
      metadata_terms: [],
      score: 1,
    })),
  }, sample);

  assert.equal(merged.messages.filter((message) => String(message.content.kind).startsWith("demo_seed")).length, 1);
  const retained = merged.messages.find((message) => String(message.content.kind).startsWith("demo_seed"));
  assert.match(String(retained?.content.title), /^Demo:/);
  assert.equal(retained?.supertags?.includes("Demo"), true);
  assert.equal(retained?.content.is_demo, true);
  assert.equal(merged.thread_summaries?.length, 1);
  assert.equal(merged.thread_summaries?.[0]?.title.startsWith("Demo:"), true);
});
