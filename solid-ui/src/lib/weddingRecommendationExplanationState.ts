// @locs-version: 2.0
import type {
  WeddingGraphEdge,
  WeddingGraphNode,
  WeddingKnowledgeGraphState,
} from "@/lib/weddingKnowledgeGraphState";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";

export type WeddingRecommendationKind =
  | "constraint_conflict"
  | "missing_evidence"
  | "risk"
  | "approval"
  | "decision"
  | "topology_anchor";

export type WeddingRecommendationExplanation = {
  id: string;
  kind: WeddingRecommendationKind;
  title: string;
  body: string;
  evidenceLabel: string;
  badges: string[];
  sourceNodeIds: string[];
  edgeIds: string[];
  nextActionLabel: string;
};

export type WeddingRecommendationExplanationState = {
  summaryLabel: string;
  recommendations: WeddingRecommendationExplanation[];
  primaryRecommendation: WeddingRecommendationExplanation | null;
};

export type WeddingConstraintEvaluationRecommendation = {
  evaluationId: string;
  constraintRef: string;
  candidateRevisionRef: string;
  result: "satisfied" | "conflict" | "unknown" | "not_applicable";
  severity: "blocking" | "decision_relevant" | "informational";
  title: string;
  evidenceLabel: string;
};

function readableKind(kind: string): string {
  return kind.replace(/_/g, " ");
}

function edgesForNode(graph: WeddingKnowledgeGraphState, nodeId: string): WeddingGraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}

function evidenceForNode(node: WeddingGraphNode, edges: readonly WeddingGraphEdge[]): string {
  const relationshipLabel = `${edges.length} graph relationship${edges.length === 1 ? "" : "s"}`;
  return `${readableKind(node.kind)} node; ${relationshipLabel}; degree ${node.degree}`;
}

function isSourceVerificationRisk(node: WeddingGraphNode): boolean {
  return node.supertags.includes("wedding_source_verification");
}

function riskBadges(node: WeddingGraphNode, severity: string): string[] {
  return isSourceVerificationRisk(node)
    ? ["risk", "source verification", `severity:${severity}`]
    : ["risk", `severity:${severity}`];
}

function riskNextActionLabel(node: WeddingGraphNode): string {
  if (isSourceVerificationRisk(node)) {
    return "Open the source artifact, add or verify source URLs, and confirm pricing, availability, legal, map, registry, or vendor claims before acting.";
  }
  return "Open wedding documents and resolve this risk before treating the plan as ready.";
}

function riskRecommendations(graph: WeddingKnowledgeGraphState): WeddingRecommendationExplanation[] {
  return graph.riskNodes.slice(0, 3).map((node) => {
    const edges = edgesForNode(graph, node.id);
    const severity = typeof node.metadata.severity === "string" ? node.metadata.severity : "medium";
    const evidence = typeof node.metadata.evidence === "string" && node.metadata.evidence.trim()
      ? node.metadata.evidence.trim()
      : "Risk was generated from available planning context.";
    return {
      id: `wedding_recommendation:risk:${node.id}`,
      kind: "risk",
      title: node.label,
      body: evidence,
      evidenceLabel: evidenceForNode(node, edges),
      badges: riskBadges(node, severity),
      sourceNodeIds: [node.id],
      edgeIds: edges.map((edge) => edge.id),
      nextActionLabel: riskNextActionLabel(node),
    };
  });
}

function missingEvidenceRecommendations(graph: WeddingKnowledgeGraphState): WeddingRecommendationExplanation[] {
  return graph.missingEvidenceLabels.slice(0, 4).map((label, index) => ({
    id: `wedding_recommendation:missing:${index}`,
    kind: "missing_evidence",
    title: label.replace(/\.$/, ""),
    body: "This is a planning gap, not a failure. The response should ask for or generate this evidence before making confident downstream recommendations.",
    evidenceLabel: "Derived from missing artifact, schedule, or task evidence in the wedding graph.",
    badges: ["missing evidence", "conservative"],
    sourceNodeIds: [],
    edgeIds: [],
    nextActionLabel: label,
  }));
}

function constraintEvaluationRecommendations(
  evaluations: readonly WeddingConstraintEvaluationRecommendation[],
): WeddingRecommendationExplanation[] {
  return evaluations
    .filter((evaluation) => evaluation.result === "conflict" || evaluation.result === "unknown")
    .slice()
    .sort((left, right) => left.evaluationId.localeCompare(right.evaluationId))
    .slice(0, 4)
    .map((evaluation) => ({
      id: `wedding_recommendation:constraint:${evaluation.evaluationId}`,
      kind: evaluation.result === "conflict" ? "constraint_conflict" : "missing_evidence",
      title: safeWeddingUiText(
        evaluation.title.trim().slice(0, 180),
        "Planning requirement needs review",
      ),
      body: evaluation.result === "conflict"
        ? "This option conflicts with a confirmed planning requirement. Review the checked evidence before deciding."
        : "The current option evidence does not confirm whether this planning requirement is met.",
      evidenceLabel: safeWeddingUiText(
        evaluation.evidenceLabel.trim().slice(0, 220),
        "Current option evidence needs checking.",
      ),
      badges: evaluation.result === "conflict"
        ? ["constraint conflict", evaluation.severity.replace(/_/g, " ")]
        : ["missing evidence", "constraint check"],
      sourceNodeIds: [evaluation.constraintRef, evaluation.candidateRevisionRef],
      edgeIds: [],
      nextActionLabel: evaluation.result === "conflict"
        ? "Compare or resolve this requirement before choosing."
        : "Ask the vendor or check the current quote for this detail.",
    }));
}

function approvalRecommendations(graph: WeddingKnowledgeGraphState): WeddingRecommendationExplanation[] {
  return graph.edges
    .filter((edge) => edge.kind === "requires_approval")
    .slice(0, 3)
    .map((edge) => {
      const sourceNode = graph.nodes.find((node) => node.id === edge.source);
      return {
        id: `wedding_recommendation:approval:${edge.id}`,
        kind: "approval",
        title: `${sourceNode?.label ?? "Wedding item"} needs approval`,
        body: "Consequential wedding actions should stay draft-only until the user approves what will be shared, sent, or committed.",
        evidenceLabel: sourceNode ? evidenceForNode(sourceNode, edgesForNode(graph, sourceNode.id)) : "Requires approval edge",
        badges: ["approval gated", edge.label],
        sourceNodeIds: [edge.source, edge.target],
        edgeIds: [edge.id],
        nextActionLabel: "Review and approve before sending or sharing.",
      };
    });
}

function decisionRecommendations(graph: WeddingKnowledgeGraphState): WeddingRecommendationExplanation[] {
  return graph.nodes
    .filter((node) => node.kind === "decision" && node.metadata.decision_status !== "decided")
    .slice(0, 3)
    .map((node) => {
      const edges = edgesForNode(graph, node.id);
      const constrains = edges.filter((edge) => edge.kind === "constrains").length;
      return {
        id: `wedding_recommendation:decision:${node.id}`,
        kind: "decision",
        title: node.label,
        body: constrains > 0
          ? `This decision constrains ${constrains} downstream planning item${constrains === 1 ? "" : "s"}.`
          : "This decision is still open and should stay visible in the planning workspace.",
        evidenceLabel: evidenceForNode(node, edges),
        badges: ["open decision", `degree:${node.degree}`],
        sourceNodeIds: [node.id],
        edgeIds: edges.map((edge) => edge.id),
        nextActionLabel: "Capture the decision or add the missing constraint.",
      };
    });
}

function topologyAnchorRecommendations(graph: WeddingKnowledgeGraphState): WeddingRecommendationExplanation[] {
  return graph.highDegreeNodes
    .filter((node) => node.kind !== "wedding_plan" && node.kind !== "response_workspace" && node.kind !== "risk")
    .slice(0, 3)
    .map((node) => {
      const edges = edgesForNode(graph, node.id);
      return {
        id: `wedding_recommendation:topology:${node.id}`,
        kind: "topology_anchor",
        title: node.label,
        body: `This ${readableKind(node.kind)} is central to the current plan because it connects to ${node.degree} relationship${node.degree === 1 ? "" : "s"}.`,
        evidenceLabel: evidenceForNode(node, edges),
        badges: ["topology anchor", `degree:${node.degree}`],
        sourceNodeIds: [node.id],
        edgeIds: edges.map((edge) => edge.id),
        nextActionLabel: "Use this as a planning anchor for the next response.",
      };
    });
}

export function buildWeddingRecommendationExplanationState(
  graph: WeddingKnowledgeGraphState,
  constraintEvaluations: readonly WeddingConstraintEvaluationRecommendation[] = [],
): WeddingRecommendationExplanationState {
  const recommendations = [
    ...constraintEvaluationRecommendations(constraintEvaluations),
    ...missingEvidenceRecommendations(graph),
    ...riskRecommendations(graph),
    ...approvalRecommendations(graph),
    ...decisionRecommendations(graph),
    ...topologyAnchorRecommendations(graph),
  ].slice(0, 10);

  return {
    summaryLabel: recommendations.length === 0
      ? "No graph-backed wedding recommendations yet."
      : constraintEvaluations.length > 0
        ? `${recommendations.length} evidence-backed wedding recommendation${recommendations.length === 1 ? "" : "s"}`
        : `${recommendations.length} graph-backed wedding recommendation${recommendations.length === 1 ? "" : "s"}`,
    recommendations,
    primaryRecommendation: recommendations[0] ?? null,
  };
}
