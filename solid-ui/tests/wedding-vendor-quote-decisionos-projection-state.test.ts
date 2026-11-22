import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingVendorQuoteDecisionOsProjection,
  buildWeddingVenueQuoteDecisionContent,
} from "@/lib/weddingVendorQuoteDecisionOsProjectionState";

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
  const resolved = buildWeddingVendorQuoteDecisionOsProjection({ ...base, lifecycle: "resolved" });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.sendInput?.type, "decision_result");
  assert.notEqual(buildWeddingVendorQuoteDecisionOsProjection({ ...base, quoteMessageId: "afp:quote-2" }).decisionId, minimal.decisionId);
});

test("venue decisions separate quote validity, date holds and booking state", () => {
  const activeQuote = { ...quote, eventDate: "2027-11-20", dateHoldExpiresAt: "2026-10-10T00:00:00Z", bookingStatus: "open" as const };
  const projection = buildWeddingVendorQuoteDecisionOsProjection({ ...base, quote: activeQuote, createdAt: "2026-10-06T00:00:00Z" });
  const content = projection.sendInput?.content as Record<string, unknown>;
  const decision = content.venue_decision as Record<string, unknown>;
  const envelope = content.safety_envelope as Record<string, unknown>;
  assert.equal(decision.state, "hold_expiring");
  assert.equal(decision.question, "Hold Harbour House for 2027-11-20?");
  assert.equal(envelope.deadlineSource, "vendor_date_hold");
  assert.equal(envelope.quoteValidityDeadline, "2026-11-01T00:00:00.000Z");
  assert.equal((projection.sendInput?.metadata as Record<string, unknown>).vendor_date_hold_expires_at, "2026-10-10T00:00:00Z");
  assert.equal((projection.sendInput?.metadata as Record<string, unknown>).watcher_caught_kind, "expiring_hold");
  assert.equal((projection.sendInput?.metadata as Record<string, unknown>).watcher_caught_at, "2026-10-06T00:00:00Z");

  const noDeadline = buildWeddingVenueQuoteDecisionContent({ quote: { ...quote, validUntil: null, dateHoldExpiresAt: null, attachmentUrl: null }, now: new Date("2026-10-06T00:00:00Z") });
  assert.equal(noDeadline.state, "over_budget");
  assert.match(noDeadline.heading, /above the saved allowance/i);
});

test("venue decisions expose all seven evidence states without changing card layout", () => {
  const now = new Date("2026-10-06T00:00:00Z");
  const state = (changes: Partial<typeof quote> & { bookingStatus?: "open" | "chosen" | "booked"; dateHoldExpiresAt?: string | null }) => buildWeddingVenueQuoteDecisionContent({ quote: { ...quote, attachmentUrl: null, validUntil: null, budgetDeltaAmount: null, ...changes }, now }).state;
  assert.equal(state({ attachmentUrl: "https://example.com/locked.pdf", attachmentTextStatus: "linked_unverified" }), "unreadable_quote");
  assert.equal(state({ budgetDeltaAmount: 500 }), "over_budget");
  assert.equal(state({ dateHoldExpiresAt: "2026-10-10T00:00:00Z" }), "hold_expiring");
  assert.equal(state({ dateHoldExpiresAt: "2026-10-01T00:00:00Z" }), "hold_lapsed");
  assert.equal(state({ bookingStatus: "chosen" }), "chosen");
  assert.equal(state({ bookingStatus: "booked" }), "booked");
  assert.equal(state({}), "no_deadline");
});
