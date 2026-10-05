import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import { weddingVendorQuoteDecisionDispatches } from "@/lib/weddingVendorQuoteDecisionDispatchState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";

const flow = {
  quoteMessageId: "quote-1",
  threadId: "thread-1",
  metadata: { wedding_plan_id: "plan-1", response_workspace_id: "workspace-1" },
  quote: { kind: "quote", vendorName: "Harbour House", amount: 12000, amountLabel: "$12,000", currency: "AUD", budgetDeltaAmount: null, budgetDeltaLabel: null, inclusions: [], validUntil: null, attachmentUrl: null, attachmentTextStatus: "none" },
} as unknown as WeddingVendorQuoteReplyFlowState;

test("an unresolved quote dispatches once and a persisted stable key prevents a replay duplicate", () => {
  const first = weddingVendorQuoteDecisionDispatches({ flows: [flow], messages: [] });
  assert.equal(first.length, 1);
  const existing = [{ type: "decision_request", metadata: { idempotency_key: first[0]!.idempotencyKey } }] as AfpMessage[];
  assert.equal(weddingVendorQuoteDecisionDispatches({ flows: [flow], messages: existing }).length, 0);
  assert.equal(weddingVendorQuoteDecisionDispatches({ flows: [flow], messages: [], attemptedKeys: new Set([first[0]!.idempotencyKey]) }).length, 0);
});

test("separate quote identities produce separate decision requests", () => {
  const other = { ...flow, quoteMessageId: "quote-2" } as WeddingVendorQuoteReplyFlowState;
  const dispatches = weddingVendorQuoteDecisionDispatches({ flows: [flow, other], messages: [] });
  assert.equal(dispatches.length, 2);
  assert.notEqual(dispatches[0]!.idempotencyKey, dispatches[1]!.idempotencyKey);
});
