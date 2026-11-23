import type { QuotationClosureState } from "@/lib/quotationClosureState";

export type QuotationClosureDeadlineProjection = {
  projectionId: string;
  taskId: string;
  quotationId: string;
  quotationVersionId: string;
  closureRevision: string;
  lifecycle: "open" | "closed";
  kind: "contract_review" | "deposit_review";
  dueAt: string | null;
  evidenceRefs: string[];
  paymentExecution: false;
};

export type QuotationClosureTemplateAdapter<T> = {
  deadline(projection: QuotationClosureDeadlineProjection): T | null;
};

const TERMINAL = new Set<QuotationClosureState["status"]>([
  "booking_confirmed",
  "cancelled",
  "refunded",
  "superseded",
]);

export function quotationClosureDeadlineProjection(
  state: QuotationClosureState,
): QuotationClosureDeadlineProjection | null {
  const lifecycle = TERMINAL.has(state.status) ? "closed" : "open";
  if (lifecycle === "open" && !state.deadlineAt) return null;
  const deposit = state.status === "deposit_requested" || state.status === "deposit_recorded_paid";
  return {
    projectionId: `quotation-closure-deadline:${state.quotationId}:${state.quotationVersionId}:${state.revision}`,
    taskId: `quotation-closure-deadline:${state.quotationId}:${state.quotationVersionId}`,
    quotationId: state.quotationId,
    quotationVersionId: state.quotationVersionId,
    closureRevision: state.revision,
    lifecycle,
    kind: deposit ? "deposit_review" : "contract_review",
    dueAt: lifecycle === "open" ? state.deadlineAt ?? null : null,
    evidenceRefs: [...new Set(state.evidenceRefs)].sort(),
    paymentExecution: false,
  };
}

export function applyQuotationClosureTemplate<T>(
  state: QuotationClosureState,
  adapter: QuotationClosureTemplateAdapter<T>,
): T | null {
  const deadline = quotationClosureDeadlineProjection(state);
  return deadline ? adapter.deadline(deadline) : null;
}
