import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "@/lib/api";
import {
  dashboardFeedCardAgeOpacity,
  dashboardFeedCardGridHeight,
  dashboardFeedMessageTypeLabel,
  dashboardFeedScalarString,
  dashboardFeedTypeHue,
  normalizeDashboardFeedSupertagKey,
} from "@/lib/dashboardFeedCardPresentation";

function message(type: string): AfpMessage {
  return {
    id: `msg-${type}`,
    thread_id: `thread-${type}`,
    from: "user",
    to: [],
    timestamp: "2026-08-31T12:00:00.000Z",
    type,
    kind: "chat_thread",
    subtype: null,
    supertags: [],
    content: {},
    metadata: {},
    views: [],
    attachments: [],
    references: [],
    encryption: null,
    signature: "",
  };
}

test("dashboard feed card presentation exposes stable type labels and hues", () => {
  assert.equal(dashboardFeedMessageTypeLabel("relation_link"), "relations");
  assert.equal(dashboardFeedMessageTypeLabel("knowledge_link"), "knowledge links");
  assert.equal(dashboardFeedMessageTypeLabel("note"), "note");
  assert.equal(dashboardFeedTypeHue("research"), dashboardFeedTypeHue("research"));
});

test("dashboard feed card presentation normalizes age opacity and grid height", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  assert.equal(dashboardFeedCardAgeOpacity("2026-08-31T10:00:00.000Z", now), "");
  assert.equal(dashboardFeedCardAgeOpacity("2026-08-30T10:00:00.000Z", now), "opacity-80");
  assert.equal(dashboardFeedCardAgeOpacity("2026-08-27T09:00:00.000Z", now), "opacity-60");

  assert.equal(dashboardFeedCardGridHeight(message("note"), false), 2);
  assert.equal(dashboardFeedCardGridHeight(message("generative_card"), true), 6);
  assert.equal(dashboardFeedCardGridHeight(message("research"), true), 5);
  assert.equal(dashboardFeedCardGridHeight(message("attachment_file"), true), 5);
  assert.equal(dashboardFeedCardGridHeight(message("note"), true), 4);
});

test("dashboard feed card presentation normalizes scalar strings and supertags", () => {
  assert.equal(dashboardFeedScalarString("value"), "value");
  assert.equal(dashboardFeedScalarString(42), "42");
  assert.equal(dashboardFeedScalarString(null, "fallback"), "fallback");
  assert.equal(normalizeDashboardFeedSupertagKey("# Project:Alpha "), "project:alpha");
});
