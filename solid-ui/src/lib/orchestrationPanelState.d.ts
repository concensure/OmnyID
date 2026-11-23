// @locs-version: 1.0
export type OrchestrationGateState = {
  gate: "Approval" | "Clarification" | "None";
  gateExplainer: string;
  tone: "warning" | "strategy" | "info";
  nextSteps: string[][];
};

export function orchestrationGateState(query: string): OrchestrationGateState;

export function buildOrchestrationCompanionPanelState(copy: {
  query: string;
  summary: string;
  cardId?: string | null;
}): {
  schema_version: "a2ui.v1";
  kind: "panel";
  title: string;
  description: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<Record<string, unknown>>;
};
