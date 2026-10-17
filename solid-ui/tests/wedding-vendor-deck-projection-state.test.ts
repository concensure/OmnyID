import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingVendorDeckProjectionState } from "../src/lib/weddingVendorDeckProjectionState.ts";

test("vendor deck projects an exactly-three comparison ahead of blocked fallback", () => {
  const preview = { artifactId: "a1", title: "Venue comparison", vendorComparisonCards: [{}, {}, {}], vendorComparisonHandoff: null };
  const items = buildWeddingVendorDeckProjectionState({ artifactPreviews: [preview as never], blockedReason: "Add location" });
  assert.equal(items[0]?.kind, "vendor_comparison");
  assert.equal(items[0]?.vendorComparison?.cards.length, 3);
});

test("vendor deck emits one actionable blocked card when no comparison exists", () => {
  const items = buildWeddingVendorDeckProjectionState({ artifactPreviews: [], blockedReason: "Add a category or location" });
  assert.deepEqual(items.map((item) => item.kind), ["vendor_blocked"]);
});

test("persisted outreach keeps the comparison visible beside its draft and receipt", () => {
  const preview = { artifactId: "a1", title: "Venue comparison", vendorComparisonCards: [{}, {}, {}], vendorComparisonHandoff: null };
  const flow = {
    choiceId: "choice-1", vendorName: "Harbour House", recipientEmail: "hello@example.com",
    stage: "draft_ready" as const, subject: "Availability", bodyMarkdown: "Hello", groundedOnLabels: ["Wedding date"],
    sentAtIso: null, receiptRef: null, threadId: "thread-1", blockedReason: null,
  };
  const draft = buildWeddingVendorDeckProjectionState({ artifactPreviews: [preview as never], outreachFlows: [flow] });
  assert.deepEqual(draft.map((item) => item.kind), ["vendor_comparison", "vendor_draft"]);
  assert.equal(draft[1]?.vendorOutreachFlow?.bodyMarkdown, "Hello");

  const receipt = buildWeddingVendorDeckProjectionState({
    artifactPreviews: [preview as never],
    outreachFlows: [{ ...flow, stage: "sent", sentAtIso: "2026-10-06T00:00:00Z", receiptRef: "provider-1" }],
  });
  assert.deepEqual(receipt.map((item) => item.kind), ["vendor_comparison", "vendor_receipt"]);
  assert.match(receipt[1]?.whyNowLabel ?? "", /provider-1/i);
});
