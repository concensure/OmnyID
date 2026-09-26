// @locs-version: 1.0
const WORKFLOW_EXPORT_FILENAME_PREFIX = "workflow";
const WORKFLOW_EXPORT_FILENAME_FALLBACK_ID = "untitled";
const WORKFLOW_EXPORT_FILENAME_ID_LIMIT = 40;

export function workflowExportFilename(workflowId: string): string {
  const safeId = workflowId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, WORKFLOW_EXPORT_FILENAME_ID_LIMIT);

  return `${WORKFLOW_EXPORT_FILENAME_PREFIX}-${safeId || WORKFLOW_EXPORT_FILENAME_FALLBACK_ID}.json`;
}

export function workflowExportPayload(args: {
  edges: readonly { source: string; target: string }[];
  exportedAt: string;
  nodes: readonly {
    id: string;
    kind: string;
    label: string;
    position: { x: number; y: number };
  }[];
  workflowId: string;
}): {
  edges: Array<{ source: string; target: string }>;
  exported_at: string;
  nodes: Array<{ id: string; kind: string; label: string; x: number; y: number }>;
  workflow_id: string;
} {
  return {
    workflow_id: args.workflowId,
    exported_at: args.exportedAt,
    nodes: args.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      x: node.position.x,
      y: node.position.y,
    })),
    edges: args.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
  };
}
