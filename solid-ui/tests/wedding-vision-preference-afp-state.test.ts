import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  weddingVisionPreferenceRecordsFromAfpMessages,
  weddingVisionPreferenceToAfpSendInput,
} from "../src/lib/weddingVisionPreferenceAfpState.ts";

const metadata = {
  weddingPlanId: "wedding_plan:test",
  responseWorkspaceId: "response_workspace:test",
  sourceResponseId: null,
  supertags: ["template:wedding_planning", "event:wedding"],
};

test("weddingVisionPreferenceToAfpSendInput creates a private queryable vision preference message", () => {
  const input = weddingVisionPreferenceToAfpSendInput({
    metadata,
    label: "Candlelit",
    createdAt: "2026-09-29T00:00:00.000Z",
  });

  assert.equal(input.kind, "wedding_vision_preference");
  assert.equal(input.subtype, "wedding_vision_preference");
  assert.equal(input.thread_id, "wedding_vision:response_workspace:test");
  assert.equal(input.metadata?.wedding_vision_label, "Candlelit");
  assert.equal(input.metadata?.privacy_scope, "private");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_feel_tag:candlelit"));
  assert.ok(input.references?.some((reference) => {
    const record = reference as { type?: string; label?: string };
    return record.type === "wedding_vision_tag" && record.label === "Candlelit";
  }));
});

test("weddingVisionPreferenceToAfpSendInput can record a removed vision preference", () => {
  const input = weddingVisionPreferenceToAfpSendInput({
    metadata,
    label: "Formal",
    action: "remove_feel_tag",
    createdAt: "2026-09-29T00:02:00.000Z",
  });

  assert.equal(input.metadata?.wedding_vision_action, "remove_feel_tag");
  assert.match(String((input.content as { markdown?: string }).markdown), /Removed feeling tag: Formal/);
  assert.equal((input.views?.[0] as { content?: { action?: string } }).content?.action, "remove_feel_tag");
});

test("weddingVisionPreferenceRecordsFromAfpMessages treats latest remove as not confirmed", () => {
  const affirmed = weddingVisionPreferenceToAfpSendInput({
    metadata,
    label: "Warm",
    createdAt: "2026-09-29T00:00:00.000Z",
  }) as AfpMessage;
  const removed = weddingVisionPreferenceToAfpSendInput({
    metadata,
    label: "Warm",
    action: "remove_feel_tag",
    createdAt: "2026-09-29T00:05:00.000Z",
  }) as AfpMessage;

  const records = weddingVisionPreferenceRecordsFromAfpMessages({
    messages: [affirmed, removed],
    metadata,
  });

  assert.deepEqual(records, []);
});

test("weddingVisionPreferenceRecordsFromAfpMessages reads only matching workspace records", () => {
  const matching = weddingVisionPreferenceToAfpSendInput({
    metadata,
    label: "Relaxed",
    createdAt: "2026-09-29T00:00:00.000Z",
  }) as AfpMessage;
  const otherWorkspace = weddingVisionPreferenceToAfpSendInput({
    metadata: { ...metadata, responseWorkspaceId: "response_workspace:other" },
    label: "Formal",
    createdAt: "2026-09-29T00:01:00.000Z",
  }) as AfpMessage;

  const records = weddingVisionPreferenceRecordsFromAfpMessages({
    messages: [matching, otherWorkspace],
    metadata,
  });

  assert.deepEqual(records.map((record) => record.label), ["Relaxed"]);
});
