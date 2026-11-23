import type { AfpMessage } from "@/lib/api";
import {
  weddingTaskItemToAfpTaskMessage,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import {
  weddingDecisionProjectionToAfpMessage,
  type WeddingDecisionProjectionInput,
} from "@/lib/weddingDecisionAfpProjectionState";
import type { QuotationClosureState } from "@/lib/quotationClosureState";
import {
  applyQuotationClosureTemplate,
  type QuotationClosureDeadlineProjection,
} from "@/lib/quotationClosureTemplateProjection";

export type QuotationBudgetCommitment = {
  commitment_id: string;
  quotation_id: string;
  quotation_version_id: string;
  amount: { amount_minor: number; currency: string };
  source_refs: Array<{
    source_id: string;
    source_version_id: string;
    media_type: string;
  }>;
};

export type WeddingQuotationClosureContext = {
  metadata: unknown;
  vendorName: string;
  categoryLabel: string;
};

const WEDDING_BUDGET_CURRENCIES = new Set(["AUD", "EUR", "GBP", "USD"]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function assertCommitment(
  state: QuotationClosureState,
  commitment: QuotationBudgetCommitment,
): void {
  const currency = clean(commitment.amount.currency).toUpperCase();
  if (
    state.status !== "booking_confirmed"
    || state.evidenceRefs.length === 0
    || clean(commitment.commitment_id) === ""
    || commitment.quotation_id !== state.quotationId
    || commitment.quotation_version_id !== state.quotationVersionId
    || !Number.isSafeInteger(commitment.amount.amount_minor)
    || commitment.amount.amount_minor < 0
    || !WEDDING_BUDGET_CURRENCIES.has(currency)
    || commitment.source_refs.length === 0
  ) {
    throw new Error("Only an evidence-backed confirmed booking can update the wedding budget.");
  }
}

function moneyLabel(commitment: QuotationBudgetCommitment): string {
  const currency = commitment.amount.currency.toUpperCase();
  return `${currency} ${(commitment.amount.amount_minor / 100).toFixed(2)}`;
}

function sourceReferences(commitment: QuotationBudgetCommitment) {
  return commitment.source_refs.flatMap((source) => [
    { type: "quotation_closure_source", target: source.source_id, label: "Booking evidence" },
    { type: "quotation_closure_source_version", target: source.source_version_id, label: "Booking evidence version" },
  ]);
}

export function quotationBudgetCommitmentDecisionInput(
  state: QuotationClosureState,
  commitment: QuotationBudgetCommitment,
  context: WeddingQuotationClosureContext,
): WeddingDecisionProjectionInput {
  assertCommitment(state, commitment);
  const vendorName = clean(context.vendorName);
  const categoryLabel = clean(context.categoryLabel);
  if (!vendorName || !categoryLabel) {
    throw new Error("Vendor and category are required for a wedding budget commitment.");
  }
  const amount = moneyLabel(commitment);
  return {
    id: commitment.commitment_id,
    metadata: context.metadata,
    artifactId: `quotation:${commitment.quotation_id}`,
    artifactTitle: `${categoryLabel} booking confirmation`,
    artifactKind: "vendor_table",
    sourceLabels: ["Evidence-backed booking confirmation"],
    selectedOption: {
      id: `quotation-version:${commitment.quotation_version_id}`,
      rowIndex: 0,
      label: vendorName,
      detail: `Confirmed booking. Final quoted price ${amount}. This confirmation updates the booking, budget commitment, linked deadline task and decision record together.`,
      cells: [vendorName, categoryLabel, `Confirmed quote ${amount}`],
      columnCells: [
        { header: "Vendor", label: "Vendor", kind: "option", value: vendorName },
        { header: "Category", label: "Category", kind: "text", value: categoryLabel },
        { header: "Committed", label: "Committed", kind: "money", value: amount },
      ],
      selected: true,
      preferenceFitLabels: [],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "Confirmed from booking evidence.",
    },
    source: "agent",
    createdAt: state.deadlineAt ?? undefined,
  };
}

export function quotationBudgetCommitmentToWeddingAfp(
  state: QuotationClosureState,
  commitment: QuotationBudgetCommitment,
  context: WeddingQuotationClosureContext,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const message = weddingDecisionProjectionToAfpMessage(
    quotationBudgetCommitmentDecisionInput(state, commitment, context),
    nowIso,
  );
  return {
    ...message,
    references: [
      ...(message.references ?? []),
      { type: "quotation", target: commitment.quotation_id, label: "Quotation" },
      { type: "quotation_version", target: commitment.quotation_version_id, label: "Confirmed quotation version" },
      ...sourceReferences(commitment),
    ],
    metadata: {
      ...(message.metadata ?? {}),
      projection: "quotation_booking_to_wedding_budget",
      quotation_budget_commitment_id: commitment.commitment_id,
      quotation_id: commitment.quotation_id,
      quotation_version_id: commitment.quotation_version_id,
      booking_evidence_count: commitment.source_refs.length,
      reconciliation_summary: "Booking confirmed; budget commitment recorded; linked deadline task closed; decision record updated.",
      reconciliation_projection_kinds: ["booking", "budget_commitment", "task_status", "decision_record"],
      payment_execution: false,
    },
  };
}

function deadlineTask(
  state: QuotationClosureState,
  projection: QuotationClosureDeadlineProjection,
  context: WeddingQuotationClosureContext,
): WeddingPlanningTaskItem {
  const isDeposit = projection.kind === "deposit_review";
  const closed = projection.lifecycle === "closed";
  const amount = state.deposit
    ? `${state.deposit.currency.toUpperCase()} ${(state.deposit.amountMinor / 100).toFixed(2)}`
    : null;
  const vendorName = clean(context.vendorName) || "vendor";
  return {
    id: projection.taskId,
    title: closed
      ? `Closed quotation deadline for ${vendorName}`
      : isDeposit ? `Review deposit deadline for ${vendorName}` : `Review contract deadline for ${vendorName}`,
    kind: isDeposit ? "budget_review" : "contract_review",
    dueAt: projection.dueAt,
    dueLabel: isDeposit ? "Deposit deadline" : "Contract deadline",
    priority: "high",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "approved",
    linkedArtifactId: `quotation:${state.quotationId}`,
    metadata: {
      ...record(context.metadata),
      quotation_closure_deadline: true,
      quotation_closure_deadline_lifecycle: projection.lifecycle,
      quotation_closure_projection_id: projection.projectionId,
      quotation_id: state.quotationId,
      quotation_version_id: state.quotationVersionId,
      closure_revision: state.revision,
      schedule_basis: "quotation_closure_deadline",
      alert_offset_days: [7, 2, 0],
      budget_payment_review: isDeposit,
      budget_payment_candidate_id: isDeposit ? state.revision : null,
      budget_payment_due_amount_label: amount,
      budget_payment_due_date_label: projection.dueAt,
      budget_vendor_label: vendorName,
      budget_category_label: clean(context.categoryLabel),
      budget_source_label: "Quotation closure evidence",
      payment_execution: false,
    },
    notes: closed
      ? "Closed by a terminal quotation successor; prior evidence remains in history."
      : "Review the evidence-backed deadline. OmnyID does not execute payment.",
  };
}

export function quotationClosureDeadlineToWeddingTaskAfp(
  state: QuotationClosureState,
  context: WeddingQuotationClosureContext,
  nowIso = new Date().toISOString(),
): AfpMessage | null {
  return applyQuotationClosureTemplate(state, {
    deadline: (projection) => {
      const task = deadlineTask(state, projection, context);
      const message = weddingTaskItemToAfpTaskMessage(task, nowIso);
      if (!message) return null;
      return {
        ...message,
        id: `afp-${projection.projectionId}`,
        content: {
          ...record(message.content),
          status: projection.lifecycle === "closed" ? "archived" : "open",
          payment_execution: false,
        },
        metadata: {
          ...(message.metadata ?? {}),
          quotation_closure_deadline_lifecycle: projection.lifecycle,
          reconciliation_summary: projection.lifecycle === "closed"
            ? "The linked quotation deadline closed when the evidence-backed booking reached a terminal state."
            : "The linked quotation deadline is active and shared with Timeline and Tasks.",
          payment_execution: false,
        },
        references: [
          ...(message.references ?? []),
          { type: "quotation", target: state.quotationId, label: "Quotation" },
          { type: "quotation_version", target: state.quotationVersionId, label: "Quotation version" },
          { type: "quotation_closure_task", target: projection.taskId, label: "Stable derived task" },
          ...projection.evidenceRefs.map((target) => ({ type: "quotation_closure_source", target, label: "Closure evidence" })),
        ],
      };
    },
  });
}
