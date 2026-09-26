// @locs-version: 1.0
import type { SavedWorkflow } from "@/lib/api";

export function prependWorkflow(
  current: readonly SavedWorkflow[] | null | undefined,
  workflow: SavedWorkflow,
): SavedWorkflow[] {
  return [workflow, ...(current ?? [])];
}

export function prependUniqueWorkflow(
  current: readonly SavedWorkflow[] | null | undefined,
  workflow: SavedWorkflow,
): SavedWorkflow[] {
  return [
    workflow,
    ...(current ?? []).filter((entry) => entry.workflow_id !== workflow.workflow_id),
  ];
}

export function upsertWorkflow(
  current: readonly SavedWorkflow[] | null | undefined,
  workflow: SavedWorkflow,
): SavedWorkflow[] {
  const list = current ?? [];
  const index = list.findIndex((entry) => entry.workflow_id === workflow.workflow_id);
  if (index < 0) return [workflow, ...list];
  const next = [...list];
  next[index] = workflow;
  return next;
}

export function replaceWorkflow(
  current: readonly SavedWorkflow[] | null | undefined,
  workflow: SavedWorkflow,
): SavedWorkflow[] {
  return (current ?? []).map((entry) =>
    entry.workflow_id === workflow.workflow_id ? workflow : entry
  );
}

export function patchWorkflowInCollection(
  current: readonly SavedWorkflow[] | null | undefined,
  workflowId: string,
  patch: Partial<SavedWorkflow>,
): SavedWorkflow[] {
  return (current ?? []).map((entry) =>
    entry.workflow_id === workflowId ? { ...entry, ...patch } : entry
  );
}
