import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSampleDashboardBootstrap,
  mergeDashboardBootstrapWithSample,
} from "../src/lib/sampleDashboard.ts";

test("sample dashboard merge backfills connected sample graph when live coverage is sparse", () => {
  const sample = buildSampleDashboardBootstrap({
    id: "user-1",
    email: "user@example.com",
    display_name: "User",
    auth_provider: "password",
  });
  const live = {
    ...sample,
    messages: sample.messages.filter((message) => message.type === "note").slice(0, 1),
    thread_summaries: [],
    proactive_suggestions: [],
  };

  const merged = mergeDashboardBootstrapWithSample(live, sample);
  const kinds = new Set(merged.messages.map((message) => String(message.kind ?? message.type)));

  assert.ok(kinds.has("email"));
  assert.ok(kinds.has("calendar_event"));
  assert.ok(kinds.has("database_record"));
  assert.ok(kinds.has("knowledge_card"));
  assert.ok(kinds.has("backlink_update"));
  assert.ok(kinds.has("insight"));
  assert.ok((merged.thread_summaries?.length ?? 0) >= 2);
  assert.ok((merged.proactive_suggestions?.length ?? 0) >= 1);
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
