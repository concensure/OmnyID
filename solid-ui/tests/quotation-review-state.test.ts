import assert from "node:assert/strict";
import test from "node:test";

import { evidencePresentation, sourceLocatorLabel } from "@/lib/quotationEvidenceState";
import { beginReview, blockingMaterialFieldIds, buildReviewCommand, reconcileReview, type QuotationReviewState } from "@/lib/quotationReviewState";

function state(): QuotationReviewState {
  return {
    versionId: "quote-v2",
    materialFingerprint: "fingerprint-v2",
    pendingCommandId: null,
    error: null,
    fields: [{
      id: "price",
      label: "Venue hire",
      valueLabel: "AUD 5,000.00",
      group: "totals",
      materiality: "high",
      confidenceBps: 7_500,
      reviewed: false,
      evidence: { state: "inferred", sourceId: "source-1", sourceVersionId: "v1", exactExcerpt: "$5,000", locator: "page:2" },
    }],
  };
}

test("material review blocks downstream action until explicit review", () => {
  assert.deepEqual(blockingMaterialFieldIds(state().fields), ["price"]);
  assert.deepEqual(blockingMaterialFieldIds(state().fields.map((field) => ({ ...field, reviewed: true, confidenceBps: 9_000 }))), []);
});

test("commands bind exact version and optimistic state reconciles server successors", () => {
  const current = state();
  const command = buildReviewCommand(current, "user-1", { action: "confirm_line", line_id: "price" }, "2026-10-17T10:00:00Z");
  const pending = beginReview(current, command);
  assert.equal(pending.pendingCommandId, command.command_id);
  const saved = reconcileReview(pending, command.command_id, { version_id: "quote-v3", material_fingerprint: "fingerprint-v3" });
  assert.equal(saved.versionId, "quote-v3");
  assert.equal(saved.pendingCommandId, null);
});

test("evidence uses text and icon and exposes only anchored source links", () => {
  assert.deepEqual(evidencePresentation({ state: "unknown" }), { label: "Not stated", icon: "—", canOpenSource: false });
  assert.equal(evidencePresentation(state().fields[0].evidence).canOpenSource, true);
  assert.equal(sourceLocatorLabel(state().fields[0].evidence), "Page 2");
});
