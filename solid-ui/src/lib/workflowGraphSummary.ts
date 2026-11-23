// @locs-version: 1.0
import type { SavedWorkflow } from "@/lib/api";
import { workflowTriggerReadinessSummaryForWorkflow } from "@/lib/workflowDeploymentHelpers";

export function summary(workflow: SavedWorkflow) {
  const graph = workflow.graph as { nodes?: unknown[]; edges?: unknown[]; status?: string };
  const triggerReadiness = workflowTriggerReadinessSummaryForWorkflow(workflow);
  return {
    nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
    status: typeof graph.status === "string" ? graph.status : "draft",
    triggerPreviewStatus: typeof triggerReadiness?.status === "string" ? triggerReadiness.status : null,
    triggerLiveRegistrationSupported:
      typeof triggerReadiness?.live_registration_supported === "boolean"
        ? triggerReadiness.live_registration_supported
        : null,
  };
}
