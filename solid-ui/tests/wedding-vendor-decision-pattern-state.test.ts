import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_VENDOR_PATTERN_VERSION,
  WEDDING_VENDOR_QUOTE_ACTIONS,
  WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
  WEDDING_VENDOR_SELECTION_PATTERN_ID,
  verifyWeddingDecisionPattern,
  weddingDecisionPattern,
  weddingDecisionPatternAllowsProjection,
  weddingQuoteSafetyEnvelope,
} from "@/lib/weddingVendorDecisionPatternState";

test("wedding Decision Pattern registry is controlled and versioned", () => {
  const selection = weddingDecisionPattern(WEDDING_VENDOR_SELECTION_PATTERN_ID, WEDDING_VENDOR_PATTERN_VERSION);
  const quote = weddingDecisionPattern(WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID, WEDDING_VENDOR_PATTERN_VERSION);
  assert.equal(selection?.projectionRecipe, "wedding.vendor_selection.card@1");
  assert.equal(quote?.executionContracts[0], "wedding.vendor_quote_reply@1");
  assert.equal(weddingDecisionPattern(WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID, 2), null);
  assert.equal(JSON.stringify(quote).includes("<"), false);
});

test("quote verification permits labelled optional gaps but blocks missing contracts", () => {
  const base = {
    patternId: WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
    patternVersion: WEDDING_VENDOR_PATTERN_VERSION,
    situationType: "vendor_quote_received",
    presentInputs: ["decision_id", "quote_message_id", "quote_thread_id", "vendor_identity"],
    presentEvidence: ["source_quote", "vendor_thread"],
    allowedActions: WEDDING_VENDOR_QUOTE_ACTIONS,
    executionContracts: ["wedding.vendor_quote_reply@1"],
  };
  const usable = verifyWeddingDecisionPattern({ ...base, optionalGaps: ["amount", "valid_until"] });
  assert.equal(usable.outcome, "VALID_WITH_OPTIONAL_GAPS");
  assert.equal(weddingDecisionPatternAllowsProjection(usable), true);

  const blocked = verifyWeddingDecisionPattern({ ...base, executionContracts: [] });
  assert.equal(blocked.outcome, "BLOCKED_MISSING_DATA");
  assert.deepEqual(blocked.missingExecutionContracts, ["wedding.vendor_quote_reply@1"]);
  assert.equal(weddingDecisionPatternAllowsProjection(blocked), false);
});

test("safety envelope does not invent urgency when the vendor stated no deadline", () => {
  const envelope = weddingQuoteSafetyEnvelope({ now: new Date("2026-10-06T00:00:00Z") });
  assert.equal(envelope.deadlineSource, null);
  assert.equal(envelope.externalDeadline, null);
  assert.equal(envelope.comfortableResurfaceAt, null);
});

test("safety envelope preserves an expired vendor deadline for overdue escalation", () => {
  const envelope = weddingQuoteSafetyEnvelope({
    now: new Date("2026-10-06T00:00:00Z"),
    validUntil: "2026-10-05T00:00:00Z",
  });
  assert.equal(envelope.deadlineSource, "vendor_quote_validity");
  assert.equal(envelope.externalDeadline, "2026-10-05T00:00:00.000Z");
  assert.equal(Date.parse(envelope.criticalAt!) < Date.parse(envelope.externalDeadline!), true);
});

test("safety envelope keeps quote validity and a date hold as separate facts", () => {
  const envelope = weddingQuoteSafetyEnvelope({
    validUntil: "2026-10-20T00:00:00Z",
    dateHoldExpiresAt: "2026-10-10T00:00:00Z",
  });
  assert.equal(envelope.deadlineSource, "vendor_date_hold");
  assert.equal(envelope.externalDeadline, "2026-10-10T00:00:00.000Z");
  assert.equal(envelope.quoteValidityDeadline, "2026-10-20T00:00:00.000Z");
  assert.equal(envelope.dateHoldDeadline, "2026-10-10T00:00:00.000Z");
});

test("legacy quote histories with no pattern metadata can be verified against v1", () => {
  const verification = verifyWeddingDecisionPattern({
    patternId: WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
    patternVersion: 1,
    situationType: "vendor_quote_received",
    presentInputs: ["decision_id", "quote_message_id", "quote_thread_id", "vendor_identity"],
    presentEvidence: ["source_quote", "vendor_thread"],
    allowedActions: WEDDING_VENDOR_QUOTE_ACTIONS,
    executionContracts: ["wedding.vendor_quote_reply@1"],
    optionalGaps: ["legacy_pattern_metadata"],
  });
  assert.equal(verification.outcome, "VALID_WITH_OPTIONAL_GAPS");
});
