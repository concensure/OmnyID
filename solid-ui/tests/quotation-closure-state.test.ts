import assert from "node:assert/strict";
import test from "node:test";

import { closureTransitionAfpInput } from "@/lib/quotationClosureAfpState";
import { a2uiForQuotationClosure, budgetCommitmentReady, closureActions, depositBudgetLabels, type QuotationClosureState } from "@/lib/quotationClosureState";

function state(status: QuotationClosureState["status"]): QuotationClosureState {
  return {
    quotationId: "quote-1",
    quotationVersionId: "quote-1-v2",
    status,
    revision: "closure-v3",
    changedTerms: [],
    changedTermsReviewed: true,
    evidenceRefs: ["source-1"],
  };
}

test("selection cannot skip directly to booking confirmation", () => {
  assert.deepEqual(closureActions(state("selected")).map((action) => action.targetStatus), ["contract_received"]);
  assert.equal(budgetCommitmentReady(state("selected")), false);
  assert.equal(budgetCommitmentReady(state("booking_confirmed")), true);
});

test("changed terms block closure actions until reviewed", () => {
  const current = { ...state("contract_received"), changedTerms: ["Venue hire increased"], changedTermsReviewed: false };
  assert.deepEqual(closureActions(current).map((action) => action.id), ["review-contract:closure-v3"]);
});

test("deposit is shown as cash flow and only a fee adds cost", () => {
  const current = { ...state("deposit_requested"), deposit: { amountMinor: 200_000, currency: "AUD", isFee: false } };
  assert.deepEqual(depositBudgetLabels(current), { cashFlow: "Deposit schedule: AUD 2000.00", addedCost: null });
  assert.equal(depositBudgetLabels({ ...current, deposit: { ...current.deposit!, isFee: true } }).addedCost, "Additional fee: AUD 2000.00");
});

test("closure AFP transition is private and explicitly cannot execute payment", () => {
  const input = closureTransitionAfpInput("thread-1", state("contract_reviewed"), "booking_confirmed", "user-1", ["confirmation-1"], "2026-10-17T10:00:00Z");
  assert.equal(input.content.payment_execution, false);
  assert.equal(input.metadata.e2ee_required, true);
  assert.equal(input.content.expected_state, "contract_reviewed");
  const a2ui = a2uiForQuotationClosure(state("contract_reviewed"));
  assert.equal(JSON.stringify(a2ui).includes('"external_payment":false'), true);
  assert.equal(JSON.stringify(a2ui).includes('"type":"action_chips"'), true);
});
