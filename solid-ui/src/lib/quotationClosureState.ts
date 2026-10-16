export type QuotationClosureStatus =
  | "selected"
  | "contract_received"
  | "contract_reviewed"
  | "deposit_requested"
  | "deposit_recorded_paid"
  | "booking_confirmed"
  | "cancelled"
  | "refunded"
  | "superseded";

export type QuotationClosureState = {
  quotationId: string;
  quotationVersionId: string;
  status: QuotationClosureStatus;
  revision: string;
  changedTerms: string[];
  changedTermsReviewed: boolean;
  evidenceRefs: string[];
  deadlineAt?: string | null;
  deposit?: {
    amountMinor: number;
    currency: string;
    isFee: boolean;
    dueAt?: string | null;
    paidAt?: string | null;
  } | null;
};

export type ClosureAction = {
  id: string;
  label: string;
  pattern: "record" | "approve_act";
  targetStatus: QuotationClosureStatus;
  requiresEvidence: boolean;
  enabled: boolean;
  reason?: string;
};

export function closureActions(state: QuotationClosureState): ClosureAction[] {
  if (state.changedTerms.length && !state.changedTermsReviewed) {
    return [{
      id: `review-contract:${state.revision}`,
      label: "Review changed contract terms",
      pattern: "record",
      targetStatus: "contract_reviewed",
      requiresEvidence: true,
      enabled: true,
    }];
  }
  switch (state.status) {
    case "selected":
      return [{ id: `record-contract:${state.revision}`, label: "Record contract received", pattern: "record", targetStatus: "contract_received", requiresEvidence: true, enabled: true }];
    case "contract_received":
      return [{ id: `review-contract:${state.revision}`, label: "Review contract", pattern: "record", targetStatus: "contract_reviewed", requiresEvidence: true, enabled: true }];
    case "contract_reviewed":
      return [
        { id: `record-deposit:${state.revision}`, label: "Record deposit request", pattern: "record", targetStatus: "deposit_requested", requiresEvidence: true, enabled: true },
        { id: `confirm-booking:${state.revision}`, label: "Confirm booking", pattern: "approve_act", targetStatus: "booking_confirmed", requiresEvidence: true, enabled: true },
      ];
    case "deposit_requested":
      return [{ id: `record-paid:${state.revision}`, label: "Record deposit paid", pattern: "record", targetStatus: "deposit_recorded_paid", requiresEvidence: true, enabled: true }];
    case "deposit_recorded_paid":
      return [{ id: `confirm-booking:${state.revision}`, label: "Confirm booking", pattern: "approve_act", targetStatus: "booking_confirmed", requiresEvidence: true, enabled: true }];
    default:
      return [];
  }
}

export function budgetCommitmentReady(state: QuotationClosureState): boolean {
  return state.status === "booking_confirmed" && state.evidenceRefs.length > 0;
}

export function depositBudgetLabels(state: QuotationClosureState): { cashFlow: string | null; addedCost: string | null } {
  const deposit = state.deposit;
  if (!deposit) return { cashFlow: null, addedCost: null };
  const amount = `${deposit.currency} ${(deposit.amountMinor / 100).toFixed(2)}`;
  return {
    cashFlow: `Deposit schedule: ${amount}`,
    addedCost: deposit.isFee ? `Additional fee: ${amount}` : null,
  };
}

export function a2uiForQuotationClosure(state: QuotationClosureState): Record<string, unknown> {
  const actions = Object.fromEntries(closureActions(state).map((action) => [action.id, {
    kind: "quotation_closure_transition",
    quotation_id: state.quotationId,
    quotation_version_id: state.quotationVersionId,
    expected_state: state.status,
    target_state: action.targetStatus,
    requires_user_confirmation: true,
    external_payment: false,
  }]));
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: "Booking progress",
    state_id: `quotation-closure:${state.quotationId}:${state.revision}`,
    components: [
      { id: "closure-status", type: "stat_row", props: { label: "Status", value: state.status.replaceAll("_", " "), helper: state.deadlineAt ?? "No deadline recorded" } },
      { id: "closure-warning", type: "callout", props: {
        tone: state.changedTerms.length && !state.changedTermsReviewed ? "warning" : "info",
        title: state.changedTerms.length && !state.changedTermsReviewed ? "Contract review required" : "Evidence-backed booking",
        body: state.changedTerms.length && !state.changedTermsReviewed
          ? "Review changed terms before continuing."
          : "Selection, payment records, and booking confirmation remain separate steps.",
      } },
      { id: "closure-actions", type: "action_chips", props: { actions } },
    ],
  };
}
