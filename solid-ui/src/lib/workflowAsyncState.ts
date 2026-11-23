// @locs-version: 1.0
import {
  decideWorkflowWaitResume,
  compileWorkflow,
  describeWorkflow,
  getWorkflow,
  listWorkflowDeployments,
  listWorkflowRuns,
  listWorkflowTriggerRegistrations,
  listWorkflowWaitResumeRecords,
  patchWorkflow,
  runWorkflowAction,
  saveWorkflow,
  startWorkflowRun,
  type SavedWorkflow,
  type WorkflowConnectorOverrides,
  type WorkflowDeployment,
  type WorkflowRun,
  type WorkflowRunStartResponse,
  type WorkflowTriggerRegistration,
  type WorkflowWaitResumeRecord,
} from "@/lib/api";
import {
  workflowApprovalDecisionFeedbackLabel,
  workflowPendingApprovalMissingFeedback,
  workflowPendingApprovalWaitResumeRecord,
  type WorkflowApprovalDecisionRequest,
} from "@/lib/workflowApprovalState";
import {
  workflowBranchPresetSuccessFeedback,
} from "@/lib/workflowFamilyState";
import {
  workflowActionFeedback,
  workflowActionPreflightFeedback,
  workflowActionSuccessUiEffects,
  workflowCompileFeedback,
  workflowGraphPayload,
  workflowSavedFeedback,
} from "@/lib/workflowDeploymentHelpers";
import {
  workflowDescribeBranchSavedFeedback,
  workflowDescribeCreatedFeedback,
  workflowDescribeFallbackFeedback,
  workflowRegeneratedFeedback,
  workflowRegenerationFallbackFeedback,
} from "@/lib/workflowDescribeIntentAnalysis";
import { workflowPatchIrInvalidatedFeedback } from "@/lib/workflowGraphEditState";
import {
  workflowCompiledCollectionState,
  workflowCompiledCurrentState,
  workflowSaveRequestBody,
  workflowSavedCollectionState,
  workflowTriggerRegistrationsState,
  type WorkflowSaveMutationMode,
} from "@/lib/workflowPersistenceState";
import { resolveWorkflowSelectedRunId } from "@/lib/workflowReviewLocalState";
import { workflowDryRunFeedback, workflowRunActionFeedback } from "@/lib/workflowRunAnalysis";
import { runStatusSummary } from "@/lib/workflowRunSummary";
import type { WorkflowGraphDraft } from "@/lib/workflowGraphTypes";

export type WorkflowLoadStateResult = {
  workflow: SavedWorkflow;
  deployments: WorkflowDeployment[];
  runs: WorkflowRun[];
  triggerRegistrations: WorkflowTriggerRegistration[];
  selectedRunId: string | null;
};

export type WorkflowRunHistoryStateResult = {
  runs: WorkflowRun[];
  selectedRunId: string | null;
  shouldMarkWorkflowRun: boolean;
};

export type WorkflowSaveStateResult = {
  saved: SavedWorkflow;
  workflows: SavedWorkflow[];
  feedback: string;
};

export type WorkflowCompileStateResult = {
  workflow: SavedWorkflow | null;
  workflows: SavedWorkflow[];
  feedback: string;
};

export type WorkflowActionStateResult =
  | {
      kind: "preflight";
      feedback: string;
    }
  | {
      kind: "success";
      workflow: SavedWorkflow;
      workflows: SavedWorkflow[];
      feedback: string;
      uiEffects: ReturnType<typeof workflowActionSuccessUiEffects>;
    };

export type WorkflowRunStateResult = {
  run: WorkflowRun;
  selectedRunId: string;
  feedback: string;
  shouldMarkWorkflowRun: boolean;
  shouldExtendLiveRefreshWindow: boolean;
  shouldClearReplayPreview: boolean;
};

export type WorkflowDescribeStateResult = {
  workflow: SavedWorkflow;
  workflows: SavedWorkflow[];
  selectedNodeId: string | null;
  feedback: string;
  shouldResetExecutionHistory: boolean;
};

export type WorkflowPatchStateResult = {
  workflow: SavedWorkflow;
  workflows: SavedWorkflow[];
  feedback: string | null;
};

export type WorkflowWaitResumeLoadStateResult = {
  records: WorkflowWaitResumeRecord[];
};

export type WorkflowApprovalDecisionStateResult =
  | {
      kind: "preflight";
      feedback: string;
    }
  | {
      kind: "missing_pending_approval";
      feedback: string;
    }
  | {
      kind: "success";
      run: WorkflowRun;
      feedback: string;
      selectedRunId: string;
      shouldExtendLiveRefreshWindow: boolean;
    };

export type WorkflowBranchPresetStateResult = {
  workflow: SavedWorkflow;
  workflows: SavedWorkflow[];
  feedback: string;
};

export type WorkflowLoadStateDependencies = {
  getWorkflow?: typeof getWorkflow;
  listWorkflowDeployments?: typeof listWorkflowDeployments;
  listWorkflowRuns?: typeof listWorkflowRuns;
  listWorkflowTriggerRegistrations?: typeof listWorkflowTriggerRegistrations;
};

export async function loadWorkflowAsyncState(
  args: {
    workflowId: string;
    preferredRunId?: string | null;
    persistedRunId?: string | null;
  },
  deps: WorkflowLoadStateDependencies = {},
): Promise<WorkflowLoadStateResult> {
  const loadWorkflow = deps.getWorkflow ?? getWorkflow;
  const loadDeployments = deps.listWorkflowDeployments ?? listWorkflowDeployments;
  const loadRuns = deps.listWorkflowRuns ?? listWorkflowRuns;
  const loadTriggerRegistrations = deps.listWorkflowTriggerRegistrations ?? listWorkflowTriggerRegistrations;

  const [workflow, deployments, runs] = await Promise.all([
    loadWorkflow(args.workflowId),
    loadDeployments(args.workflowId),
    loadRuns(args.workflowId),
  ]);

  const triggerRegistrations = await loadTriggerRegistrations(args.workflowId)
    .then((response) => workflowTriggerRegistrationsState(response))
    .catch(() => []);

  return {
    workflow,
    deployments: deployments.deployments,
    runs: runs.runs,
    triggerRegistrations,
    selectedRunId: resolveWorkflowSelectedRunId({
      runs: runs.runs,
      preferredRunId: args.preferredRunId,
      persistedRunId: args.persistedRunId,
    }),
  };
}

export async function loadWorkflowDeploymentHistoryState(
  workflowId: string,
  deps: {
    listWorkflowDeployments?: typeof listWorkflowDeployments;
  } = {},
): Promise<WorkflowDeployment[]> {
  const loadDeployments = deps.listWorkflowDeployments ?? listWorkflowDeployments;
  const response = await loadDeployments(workflowId);
  return response.deployments;
}

export async function describeWorkflowBranchAsyncState(
  args: {
    workflowId: string | null | undefined;
    eventId: string;
    intent: string;
    presetOverride?: string | null;
    optimizationOverride?: "balanced" | "speed" | "cost" | null;
    regenerationMode?: "rebuild" | "preserve_manual";
    currentWorkflows: readonly SavedWorkflow[] | null | undefined;
    selectNodeId: (workflow: SavedWorkflow) => string | null;
  },
  deps: {
    describeWorkflow?: typeof describeWorkflow;
  } = {},
): Promise<WorkflowDescribeStateResult> {
  const describeWorkflowRequest = deps.describeWorkflow ?? describeWorkflow;
  const described = await describeWorkflowRequest({
    intent: args.intent,
    preset_override: args.presetOverride || undefined,
    optimization_override: args.optimizationOverride || undefined,
    regeneration_mode: args.regenerationMode,
    save_draft: true,
    branch_from_workflow_id: args.workflowId ?? undefined,
    branch_from_event_id: args.eventId,
  });
  return {
    workflow: described.workflow,
    workflows: workflowSavedCollectionState(args.currentWorkflows, described.workflow, "upsert"),
    selectedNodeId: args.selectNodeId(described.workflow),
    feedback: workflowDescribeBranchSavedFeedback(),
    shouldResetExecutionHistory: true,
  };
}

export async function createWorkflowFromIntentAsyncState(
  args: {
    intent: string;
    presetOverride?: string | null;
    optimizationOverride?: "balanced" | "speed" | "cost" | null;
    regenerationMode?: "rebuild" | "preserve_manual";
    currentWorkflows: readonly SavedWorkflow[] | null | undefined;
    fallbackWorkflow: SavedWorkflow;
    selectNodeId: (workflow: SavedWorkflow) => string | null;
  },
  deps: {
    describeWorkflow?: typeof describeWorkflow;
  } = {},
): Promise<WorkflowDescribeStateResult> {
  const describeWorkflowRequest = deps.describeWorkflow ?? describeWorkflow;
  try {
    const described = await describeWorkflowRequest({
      intent: args.intent,
      preset_override: args.presetOverride || undefined,
      optimization_override: args.optimizationOverride || undefined,
      regeneration_mode: args.regenerationMode,
      save_draft: true,
    });
    return {
      workflow: described.workflow,
      workflows: workflowSavedCollectionState(args.currentWorkflows, described.workflow, "upsert"),
      selectedNodeId: args.selectNodeId(described.workflow),
      feedback: workflowDescribeCreatedFeedback(described.workflow.preset_kinds[0]),
      shouldResetExecutionHistory: true,
    };
  } catch (error) {
    return {
      workflow: args.fallbackWorkflow,
      workflows: args.currentWorkflows ? [...args.currentWorkflows] : [],
      selectedNodeId: args.selectNodeId(args.fallbackWorkflow),
      feedback: workflowDescribeFallbackFeedback(error),
      shouldResetExecutionHistory: true,
    };
  }
}

export async function regenerateWorkflowFromIntentAsyncState(
  args: {
    workflow: SavedWorkflow;
    sourceIntent: string;
    presetOverride?: string | null;
    optimizationOverride?: "balanced" | "speed" | "cost" | null;
    regenerationMode?: "rebuild" | "preserve_manual";
    fallbackWorkflow: SavedWorkflow;
    selectNodeId: (workflow: SavedWorkflow) => string | null;
  },
  deps: {
    describeWorkflow?: typeof describeWorkflow;
  } = {},
): Promise<WorkflowDescribeStateResult> {
  const describeWorkflowRequest = deps.describeWorkflow ?? describeWorkflow;
  try {
    const described = await describeWorkflowRequest({
      intent: args.sourceIntent,
      base_workflow: args.workflow,
      preset_override: args.presetOverride || undefined,
      optimization_override: args.optimizationOverride || undefined,
      regeneration_mode: args.regenerationMode,
    });
    return {
      workflow: described.workflow,
      workflows: [],
      selectedNodeId: args.selectNodeId(described.workflow),
      feedback: workflowRegeneratedFeedback(),
      shouldResetExecutionHistory: true,
    };
  } catch (error) {
    return {
      workflow: args.fallbackWorkflow,
      workflows: [],
      selectedNodeId: args.selectNodeId(args.fallbackWorkflow),
      feedback: workflowRegenerationFallbackFeedback(error),
      shouldResetExecutionHistory: true,
    };
  }
}

export async function loadWorkflowRunHistoryState(
  args: {
    workflowId: string;
    persistedRunId?: string | null;
    currentRunId?: string | null;
  },
  deps: {
    listWorkflowRuns?: typeof listWorkflowRuns;
  } = {},
): Promise<WorkflowRunHistoryStateResult> {
  const loadRuns = deps.listWorkflowRuns ?? listWorkflowRuns;
  const response = await loadRuns(args.workflowId);
  return {
    runs: response.runs,
    selectedRunId: resolveWorkflowSelectedRunId({
      runs: response.runs,
      currentRunId: args.currentRunId,
      persistedRunId: args.persistedRunId,
    }),
    shouldMarkWorkflowRun: response.runs.length > 0,
  };
}

export async function saveWorkflowAsyncState(
  args: {
    workflow: Pick<SavedWorkflow, "latest_ir" | "favorite" | "archived_at" | "title"> | null | undefined;
    graph: WorkflowGraphDraft;
    currentWorkflows: readonly SavedWorkflow[] | null | undefined;
    mode: WorkflowSaveMutationMode;
  },
  deps: {
    saveWorkflow?: typeof saveWorkflow;
  } = {},
): Promise<WorkflowSaveStateResult> {
  const saveWorkflowRequest = deps.saveWorkflow ?? saveWorkflow;
  const response = await saveWorkflowRequest(workflowSaveRequestBody({
    graph: workflowGraphPayload(args.graph),
    workflow: args.workflow,
  }));
  const saved = response.workflow;
  return {
    saved,
    workflows: workflowSavedCollectionState(args.currentWorkflows, saved, args.mode),
    feedback: workflowSavedFeedback(saved.title),
  };
}

export async function patchWorkflowAsyncState(
  args: {
    workflowId: string;
    currentWorkflows: readonly SavedWorkflow[] | null | undefined;
    patch: Parameters<typeof patchWorkflow>[1];
  },
  deps: {
    patchWorkflow?: typeof patchWorkflow;
  } = {},
): Promise<WorkflowPatchStateResult> {
  const patchWorkflowRequest = deps.patchWorkflow ?? patchWorkflow;
  const response = await patchWorkflowRequest(args.workflowId, args.patch);
  const updated = response.workflow;
  return {
    workflow: updated,
    workflows: workflowSavedCollectionState(args.currentWorkflows, updated, "replace"),
    feedback: workflowPatchIrInvalidatedFeedback(Boolean(response.ir_invalidated)),
  };
}

export async function applyWorkflowBranchPresetAsyncState(args: {
  workflowId: string;
  currentWorkflows: readonly SavedWorkflow[] | null | undefined;
  edgeIds: readonly string[];
  labels: readonly string[];
  nodeLabel: string;
}, deps: {
  patchWorkflow?: typeof patchWorkflow;
} = {}): Promise<WorkflowBranchPresetStateResult> {
  const patchWorkflowRequest = deps.patchWorkflow ?? patchWorkflow;
  let latestWorkflow: SavedWorkflow | null = null;
  let latestWorkflows = args.currentWorkflows ? [...args.currentWorkflows] : [];
  for (const [index, edgeId] of args.edgeIds.entries()) {
    const response = await patchWorkflowRequest(args.workflowId, {
      op: "edge_meta_replace",
      edge_id: edgeId,
      condition_label: args.labels[index] || undefined,
    });
    latestWorkflow = response.workflow;
    latestWorkflows = workflowSavedCollectionState(latestWorkflows, response.workflow, "replace");
  }
  if (!latestWorkflow) {
    throw new Error("No workflow edges were available to patch.");
  }
  return {
    workflow: latestWorkflow,
    workflows: latestWorkflows,
    feedback: workflowBranchPresetSuccessFeedback(args.nodeLabel),
  };
}

export async function compileWorkflowAsyncState(
  args: {
    workflow: SavedWorkflow;
    currentWorkflows: readonly SavedWorkflow[] | null | undefined;
    compiledAt?: string;
  },
  deps: {
    compileWorkflow?: typeof compileWorkflow;
  } = {},
): Promise<WorkflowCompileStateResult> {
  const compileWorkflowRequest = deps.compileWorkflow ?? compileWorkflow;
  const response = await compileWorkflowRequest(args.workflow.workflow_id);
  const compiledAt = args.compiledAt ?? new Date().toISOString();
  return {
    workflow: workflowCompiledCurrentState(args.workflow, response, compiledAt),
    workflows: workflowCompiledCollectionState(args.currentWorkflows, response),
    feedback: workflowCompileFeedback(response.trigger_readiness_summary),
  };
}

export async function runWorkflowActionAsyncState(
  args: {
    workflow: SavedWorkflow;
    currentWorkflows: readonly SavedWorkflow[] | null | undefined;
    action: "favorite" | "archive" | "deploy" | "rollback";
    options?: {
      favorite?: boolean;
      archived?: boolean;
      environment?: "dev" | "prod";
      deployment_id?: string;
      connector_overrides?: WorkflowConnectorOverrides;
    };
  },
  deps: {
    runWorkflowAction?: typeof runWorkflowAction;
  } = {},
): Promise<WorkflowActionStateResult> {
  const preflightFeedback = workflowActionPreflightFeedback(args.action, args.workflow);
  if (preflightFeedback) {
    return {
      kind: "preflight",
      feedback: preflightFeedback,
    };
  }

  const runAction = deps.runWorkflowAction ?? runWorkflowAction;
  const response = await runAction(args.workflow.workflow_id, {
    action: args.action,
    favorite: args.options?.favorite,
    archived: args.options?.archived,
    environment: args.options?.environment,
    deployment_id: args.options?.deployment_id,
    connector_overrides: args.options?.connector_overrides,
  });
  const updated = response.workflow;
  return {
    kind: "success",
    workflow: updated,
    workflows: workflowSavedCollectionState(args.currentWorkflows, updated, "replace"),
    feedback: workflowActionFeedback({
      action: args.action,
      archivedAt: updated.archived_at,
      deploymentId: response.deployment_id,
      favorite: updated.favorite,
      triggerReadinessSummary: response.trigger_readiness_summary,
    }),
    uiEffects: workflowActionSuccessUiEffects(args.action),
  };
}

export async function loadWorkflowWaitResumeRecordsState(
  args: {
    workflowId: string;
    runId: string;
  },
  deps: {
    listWorkflowWaitResumeRecords?: typeof listWorkflowWaitResumeRecords;
  } = {},
): Promise<WorkflowWaitResumeLoadStateResult> {
  const listRecords = deps.listWorkflowWaitResumeRecords ?? listWorkflowWaitResumeRecords;
  const response = await listRecords(args.workflowId, args.runId);
  return {
    records: response.wait_resume_records,
  };
}

export async function decideWorkflowApprovalAsyncState(
  args: {
    workflowId: string | null | undefined;
    runId: string;
    option: WorkflowApprovalDecisionRequest;
  },
  deps: {
    listWorkflowWaitResumeRecords?: typeof listWorkflowWaitResumeRecords;
    decideWorkflowWaitResume?: typeof decideWorkflowWaitResume;
  } = {},
): Promise<WorkflowApprovalDecisionStateResult> {
  if (!args.workflowId) {
    return {
      kind: "preflight",
      feedback: "Select a workflow before recording an approval decision.",
    };
  }

  const listRecords = deps.listWorkflowWaitResumeRecords ?? listWorkflowWaitResumeRecords;
  const decideWaitResume = deps.decideWorkflowWaitResume ?? decideWorkflowWaitResume;
  const waitResume = await listRecords(args.workflowId, args.runId);
  const pendingApprovalRecord = workflowPendingApprovalWaitResumeRecord(waitResume.wait_resume_records);
  if (!pendingApprovalRecord) {
    return {
      kind: "missing_pending_approval",
      feedback: workflowPendingApprovalMissingFeedback(),
    };
  }
  const response = await decideWaitResume(
    args.workflowId,
    args.runId,
    pendingApprovalRecord.wait_resume_id,
    {
      decision: args.option.decision,
      option_id: args.option.optionId,
    },
  );
  return {
    kind: "success",
    run: response.run,
    feedback: workflowApprovalDecisionFeedbackLabel(
      args.option.decision,
      args.option.optionLabel,
      response.run.run_id,
      runStatusSummary(response.run),
    ),
    selectedRunId: response.run.run_id,
    shouldExtendLiveRefreshWindow: true,
  };
}

export async function startWorkflowRunAsyncState(
  args: {
    workflowId: string;
    kind: "start" | "replay";
    options?: {
      deployment_id?: string;
      replay_run_id?: string;
    };
  },
  deps: {
    startWorkflowRun?: typeof startWorkflowRun;
  } = {},
): Promise<WorkflowRunStateResult> {
  const startRun = deps.startWorkflowRun ?? startWorkflowRun;
  const response = await startRun(args.workflowId, {
    deployment_id: args.options?.deployment_id,
    replay_run_id: args.options?.replay_run_id,
    trigger_kind: args.kind === "replay" ? "replay" : "manual",
  });
  return workflowRunStateResultFromResponse({
    response,
    kind: args.kind,
    replayRunId: args.options?.replay_run_id,
    markWorkflowRun: true,
    clearReplayPreview: args.kind === "replay",
  });
}

export async function startWorkflowDryRunAsyncState(
  args: {
    workflowId: string;
    deploymentId: string;
  },
  deps: {
    startWorkflowRun?: typeof startWorkflowRun;
  } = {},
): Promise<WorkflowRunStateResult> {
  const startRun = deps.startWorkflowRun ?? startWorkflowRun;
  const response = await startRun(args.workflowId, {
    deployment_id: args.deploymentId,
    trigger_kind: "dry_run",
  });
  return workflowRunStateResultFromResponse({
    response,
    kind: "dry_run",
    markWorkflowRun: false,
    clearReplayPreview: false,
  });
}

function workflowRunStateResultFromResponse(args: {
  response: WorkflowRunStartResponse;
  kind: "start" | "replay" | "dry_run";
  replayRunId?: string | null;
  markWorkflowRun: boolean;
  clearReplayPreview: boolean;
}): WorkflowRunStateResult {
  return {
    run: args.response.run,
    selectedRunId: args.response.run.run_id,
    feedback: args.kind === "dry_run"
      ? workflowDryRunFeedback(args.response.run)
      : workflowRunActionFeedback({
        kind: args.kind,
        replayRunId: args.replayRunId,
        run: args.response.run,
      }),
    shouldMarkWorkflowRun: args.markWorkflowRun,
    shouldExtendLiveRefreshWindow: true,
    shouldClearReplayPreview: args.clearReplayPreview,
  };
}
