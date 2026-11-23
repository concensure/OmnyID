import type { QuotationClosureState, QuotationClosureStatus } from "@/lib/quotationClosureState";

export function closureTransitionAfpInput(
  threadId: string,
  state: QuotationClosureState,
  targetStatus: QuotationClosureStatus,
  actorId: string,
  evidenceRefs: string[],
  occurredAt: string,
) {
  return {
    thread_id: threadId,
    type: "quotation_closure_transition",
    content: {
      quotation_id: state.quotationId,
      quotation_version_id: state.quotationVersionId,
      expected_state: state.status,
      target_state: targetStatus,
      actor_id: actorId,
      user_authority: true,
      occurred_at: occurredAt,
      evidence_refs: [...evidenceRefs].sort(),
      payment_execution: false,
    },
    references: [
      { type: "quotation", target: state.quotationId },
      { type: "quotation_version", target: state.quotationVersionId },
      ...evidenceRefs.map((target) => ({ type: "source", target })),
    ],
    metadata: { privacy: "tenant_private", e2ee_required: true, schema_version: "quotation.closure.v1" },
  };
}
