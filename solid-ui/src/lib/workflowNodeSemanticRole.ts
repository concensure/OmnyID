// @locs-version: 1.0
import type { WorkflowNodeDraft } from "@/lib/workflowGraphTypes";

export function nodeSemanticRole(node: WorkflowNodeDraft): string | null {
  return typeof node.metadata.semantic_role === "string"
    ? node.metadata.semantic_role
    : typeof node.metadata.semantic_node_kind === "string"
      ? node.metadata.semantic_node_kind
      : null;
}
