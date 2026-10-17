import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import {
  quotationBudgetCommitmentDecisionInput,
  quotationBudgetCommitmentToWeddingAfp,
  quotationClosureDeadlineToWeddingTaskAfp,
  type QuotationBudgetCommitment,
} from "@/lib/quotationWeddingClosureAdapter";
import type { QuotationClosureState } from "@/lib/quotationClosureState";

const context = {
  metadata: {
    weddingPlanId: "wedding_plan:1",
    responseWorkspaceId: "response_workspace:1",
    approvalState: "approved",
  },
  vendorName: "Harbour House",
  categoryLabel: "Venue",
};

function state(status: QuotationClosureState["status"]): QuotationClosureState {
  return {
    quotationId: "quote-1",
    quotationVersionId: "quote-1-v3",
    status,
    revision: "closure-v4",
    changedTerms: [],
    changedTermsReviewed: true,
    evidenceRefs: ["booking-email-1"],
    deadlineAt: "2026-11-14T09:00:00Z",
  };
}

const commitment: QuotationBudgetCommitment = {
  commitment_id: "qbudget-1",
  quotation_id: "quote-1",
  quotation_version_id: "quote-1-v3",
  amount: { amount_minor: 1_250_000, currency: "AUD" },
  source_refs: [{
    source_id: "booking-email-1",
    source_version_id: "booking-email-1-v1",
    media_type: "message/rfc822",
  }],
};

test("only a confirmed evidence-backed booking becomes a wedding budget selection", () => {
  assert.throws(
    () => quotationBudgetCommitmentDecisionInput(state("selected"), commitment, context),
    /confirmed booking/,
  );
  const input = quotationBudgetCommitmentDecisionInput(state("booking_confirmed"), commitment, context);
  const budget = buildWeddingBudgetTrackingState({ selectedDecisionItems: [input] });
  assert.equal(budget.totalQuotedAmount, 12_500);
  assert.equal(budget.totalProjectedAmount, 0);
  assert.equal(budget.lineItems[0]?.vendorName, "Harbour House");
});

test("budget projection is stable, source-linked, and cannot execute payment", () => {
  const message = quotationBudgetCommitmentToWeddingAfp(
    state("booking_confirmed"),
    commitment,
    context,
    "2026-10-17T10:00:00Z",
  );
  assert.equal(message.id, "afp-qbudget-1");
  assert.equal(message.metadata?.payment_execution, false);
  assert.equal(message.metadata?.projection, "quotation_booking_to_wedding_budget");
  assert.equal(message.references?.some((ref) => (
    (ref as { type?: string }).type === "quotation_closure_source_version"
  )), true);
});

test("active deadlines open one stable task and terminal successors archive it", () => {
  const deposit = {
    ...state("deposit_requested"),
    deposit: { amountMinor: 250_000, currency: "AUD", isFee: false },
  };
  const task = quotationClosureDeadlineToWeddingTaskAfp(deposit, context, "2026-10-17T10:00:00Z");
  assert.equal(task?.type, "task");
  assert.equal(task?.content.budget_payment_review, true);
  assert.equal(task?.metadata?.payment_execution, false);
  const terminalState = { ...state("booking_confirmed"), revision: "closure-v5" };
  const terminal = quotationClosureDeadlineToWeddingTaskAfp(terminalState, context);
  assert.equal(terminal?.content.status, "archived");
  assert.equal(terminal?.content.task_id, task?.content.task_id);
  assert.notEqual(terminal?.id, task?.id);
  assert.equal(terminal?.metadata?.quotation_closure_deadline_lifecycle, "closed");
});
