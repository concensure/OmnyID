import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorQuoteDecisionOsProjection } from "@/lib/weddingVendorQuoteDecisionOsProjectionState";

const quote = { kind: "quote" as const, vendorName: "Harbour House", amount: 12500, amountLabel: "$12,500", currency: "AUD", budgetDeltaAmount: 500, budgetDeltaLabel: "$500 over", inclusions: ["Dinner", "Drinks"], validUntil: "2026-11-01", attachmentUrl: "https://example.com/quote.pdf", attachmentTextStatus: "extracted" as const };
const base = { quoteMessageId: "afp:quote-1", quoteThreadId: "thread:harbour", quote, metadata: { wedding_plan_id: "plan:1", response_workspace_id: "workspace:1", source_response_id: "afp:intake" } };

test("unresolved quotes produce one stable DecisionOS decision request with references, not an attachment copy", () => {
  const projection = buildWeddingVendorQuoteDecisionOsProjection(base);
  const content = projection.sendInput?.content as Record<string, unknown>;
  assert.equal(projection.status, "active");
  assert.equal(projection.decisionId, buildWeddingVendorQuoteDecisionOsProjection(base).decisionId);
  assert.equal(projection.sendInput?.type, "decision_request");
  assert.equal((content.open_intent as Record<string, unknown>).thread_id, "thread:harbour");
  assert.deepEqual(content.allowed_actions, ["ACCEPT_VENDOR", "NEGOTIATE_QUOTE", "EXPLORE_ALTERNATIVE", "DEFER_DECISION"]);
  assert.equal(JSON.stringify(projection.sendInput).includes("attachmentUrl"), false);
});

test("minimal quotes remain actionable, while resolved quotes do not remain active", () => {
  const minimal = buildWeddingVendorQuoteDecisionOsProjection({ ...base, quote: { ...quote, amount: null, amountLabel: "Amount not extracted", validUntil: null } });
  assert.equal(minimal.status, "active");
  assert.deepEqual(((minimal.sendInput?.content as Record<string, unknown>).quote_summary as Record<string, unknown>).unknown_fields, ["amount", "validity deadline"]);
  assert.equal(buildWeddingVendorQuoteDecisionOsProjection({ ...base, lifecycle: "resolved" }).status, "not_projected");
  assert.notEqual(buildWeddingVendorQuoteDecisionOsProjection({ ...base, quoteMessageId: "afp:quote-2" }).decisionId, minimal.decisionId);
});
