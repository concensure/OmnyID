import type { DecisionCardDomain } from "@/lib/decisionCardState";
import type { QuotationDecisionClosureProjection } from "@/lib/quotationDecisionClosureState";

export type QuotationDecisionClosureWorkspaceProjection = {
  contextNamespace: string;
  decisionCard: QuotationDecisionClosureProjection["decisionCard"];
  a2ui: Record<string, unknown>;
  activeActionId: string | null;
  paymentExecution: false;
};

/**
 * Applies template presentation metadata without copying or mutating quotation state.
 * Future templates can use the generic function and keep their own workspace shell.
 */
export function adaptQuotationDecisionClosureForTemplate(
  projection: QuotationDecisionClosureProjection,
  template: { contextNamespace: string; decisionDomain: DecisionCardDomain },
): QuotationDecisionClosureWorkspaceProjection {
  return {
    contextNamespace: template.contextNamespace,
    decisionCard: { ...projection.decisionCard, domain: template.decisionDomain },
    a2ui: { ...projection.a2ui, context_namespace: template.contextNamespace },
    activeActionId: projection.action?.id ?? null,
    paymentExecution: false,
  };
}

export function quotationDecisionClosureForWeddingWorkspace(
  projection: QuotationDecisionClosureProjection,
): QuotationDecisionClosureWorkspaceProjection {
  return adaptQuotationDecisionClosureForTemplate(projection, {
    contextNamespace: "wedding_planner",
    decisionDomain: "wedding",
  });
}
