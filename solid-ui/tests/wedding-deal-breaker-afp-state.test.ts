import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import { weddingDealBreakersFromAfpMessages, weddingDealBreakerToAfpSendInput } from "../src/lib/weddingDealBreakerAfpState.ts";

const metadata = {
  weddingPlanId: "wedding_plan:test",
  responseWorkspaceId: "response_workspace:test",
  sourceResponseId: null,
  supertags: ["template:wedding_planning", "event:wedding"],
};

test("deal breakers are private AFP knowledge objects with A2UI projection", () => {
  const message = weddingDealBreakerToAfpSendInput({ metadata, label: "Wheelchair access", sourceSurface: "enquiry" });
  assert.equal(message.kind, "wedding_deal_breaker");
  assert.equal(message.metadata?.privacy_scope, "private");
  assert.equal(message.metadata?.e2ee_required, true);
  assert.equal(message.metadata?.source_surface, "enquiry");
  assert.equal(message.store_in_relational, true);
  assert.equal(message.views?.[0]?.format, "a2ui");
  assert.ok(message.supertags?.includes("wedding_deal_breaker:wheelchair-access"));
});

test("latest action wins per workspace and removal requires an explicit ledger event", () => {
  const added = weddingDealBreakerToAfpSendInput({ metadata, label: "No outdoor-only wet weather plan" }) as AfpMessage;
  added.timestamp = "2026-10-26T01:00:00.000Z";
  const removed = weddingDealBreakerToAfpSendInput({ metadata, label: "No outdoor-only wet weather plan", action: "remove" }) as AfpMessage;
  removed.timestamp = "2026-10-26T02:00:00.000Z";
  const other = weddingDealBreakerToAfpSendInput({ metadata: { ...metadata, responseWorkspaceId: "other" }, label: "No stairs" }) as AfpMessage;
  assert.deepEqual(weddingDealBreakersFromAfpMessages({ messages: [added, removed, other], metadata }), []);
});
