// @locs-version: 1.0
import type {
  SavedWorkflow,
  WorkflowCompileResponse,
  WorkflowCompiledIr,
  WorkflowTriggerRegistration,
} from "@/lib/api";
import {
  patchWorkflowInCollection,
  prependUniqueWorkflow,
  prependWorkflow,
  replaceWorkflow,
  upsertWorkflow,
} from "@/lib/workflowCollectionState";
import { workflowCompiledStateForWorkflow } from "@/lib/workflowDeploymentHelpers";

export type WorkflowSaveMutationMode = "prepend" | "prepend_unique" | "replace" | "upsert";

export function workflowSaveRequestBody(args: {
  graph: Record<string, unknown>;
  workflow?: Pick<SavedWorkflow, "latest_ir" | "favorite" | "archived_at"> | null;
  favorite?: boolean;
  archived?: boolean;
}): {
  graph: Record<string, unknown>;
  latest_ir?: WorkflowCompiledIr | null;
  favorite?: boolean;
  archived?: boolean;
} {
  return {
    graph: args.graph,
    latest_ir: args.workflow?.latest_ir ?? undefined,
    favorite: args.favorite ?? args.workflow?.favorite,
    archived: args.archived ?? (args.workflow ? Boolean(args.workflow.archived_at) : undefined),
  };
}

export function workflowTriggerRegistrationsState(
  response: { registrations: WorkflowTriggerRegistration[] } | null | undefined,
): WorkflowTriggerRegistration[] {
  return response?.registrations ?? [];
}

export function workflowCompiledCurrentState(
  workflow: SavedWorkflow | null | undefined,
  response: Pick<WorkflowCompileResponse, "ir" | "trigger_readiness_summary">,
  compiledAt: string,
): SavedWorkflow | null {
  if (!workflow) return null;
  return workflowCompiledStateForWorkflow(workflow, {
    ir: response.ir,
    triggerReadinessSummary: response.trigger_readiness_summary,
    updatedAt: compiledAt,
  });
}

export function workflowCompiledCollectionState(
  current: readonly SavedWorkflow[] | null | undefined,
  response: Pick<WorkflowCompileResponse, "workflow_id" | "ir" | "trigger_readiness_summary">,
): SavedWorkflow[] {
  return patchWorkflowInCollection(current, response.workflow_id, {
    latest_ir: response.ir,
    trigger_readiness_summary: response.trigger_readiness_summary,
  });
}

export function workflowSavedCollectionState(
  current: readonly SavedWorkflow[] | null | undefined,
  workflow: SavedWorkflow,
  mode: WorkflowSaveMutationMode,
): SavedWorkflow[] {
  switch (mode) {
    case "prepend":
      return prependWorkflow(current, workflow);
    case "prepend_unique":
      return prependUniqueWorkflow(current, workflow);
    case "replace":
      return replaceWorkflow(current, workflow);
    case "upsert":
      return upsertWorkflow(current, workflow);
    default:
      return upsertWorkflow(current, workflow);
  }
}
