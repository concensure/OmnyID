import test from "node:test";
import assert from "node:assert/strict";

import type {
  SavedWorkflow,
  WorkflowActionResponse,
  WorkflowCompileResponse,
  WorkflowDeployment,
  WorkflowDescribeResponse,
  WorkflowRun,
  WorkflowRunStartResponse,
  WorkflowTriggerRegistration,
  WorkflowWaitResumeDecisionResponse,
  WorkflowWaitResumeListResponse,
} from "../src/lib/api.ts";
import {
  applyWorkflowBranchPresetAsyncState,
  compileWorkflowAsyncState,
  createWorkflowFromIntentAsyncState,
  decideWorkflowApprovalAsyncState,
  describeWorkflowBranchAsyncState,
  loadWorkflowAsyncState,
  loadWorkflowRunHistoryState,
  loadWorkflowWaitResumeRecordsState,
  patchWorkflowAsyncState,
  regenerateWorkflowFromIntentAsyncState,
  runWorkflowActionAsyncState,
  saveWorkflowAsyncState,
  startWorkflowDryRunAsyncState,
  startWorkflowRunAsyncState,
} from "../src/lib/workflowAsyncState.ts";

function savedWorkflow(overrides: Partial<SavedWorkflow> = {}): SavedWorkflow {
  return {
    workflow_id: "wf-1",
    owner_user_id: "user-1",
    title: "Workflow",
    favorite: false,
    preset_kinds: [],
    graph: { nodes: [], edges: [] },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deployment(overrides: Partial<WorkflowDeployment> = {}): WorkflowDeployment {
  return {
    deployment_id: "dep-1",
    workflow_id: "wf-1",
    owner_user_id: "user-1",
    environment: "dev",
    status: "active",
    ir_snapshot: { manifests: [{ id: "manifest-1" }] },
    graph_snapshot: { nodes: [], edges: [] },
    deployed_at: "2026-01-02T00:00:00.000Z",
    created_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    run_id: "run-1",
    workflow_id: "wf-1",
    deployment_id: "dep-1",
    owner_user_id: "user-1",
    status: "completed",
    trigger_kind: "manual",
    timeline: [],
    result: {},
    started_at: "2026-01-03T00:00:00.000Z",
    created_at: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function registration(
  overrides: Partial<WorkflowTriggerRegistration> = {},
): WorkflowTriggerRegistration {
  return {
    registration_id: "reg-1",
    workflow_id: "wf-1",
    deployment_id: "dep-1",
    owner_user_id: "user-1",
    environment: "dev",
    trigger_node_id: "node-trigger",
    manifest_node_id: "node-manifest",
    trigger_family: "time",
    trigger_kind: "cron",
    registration_status: "registered",
    idempotency_key: "idem-1",
    descriptor_json: {},
    retry_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("loadWorkflowAsyncState returns typed workflow payloads and non-fatal trigger fallback", async () => {
  const result = await loadWorkflowAsyncState(
    {
      workflowId: "wf-1",
      preferredRunId: "run-2",
      persistedRunId: "run-1",
    },
    {
      getWorkflow: async () => savedWorkflow(),
      listWorkflowDeployments: async () => ({ workflow_id: "wf-1", deployments: [deployment()] }),
      listWorkflowRuns: async () => ({ workflow_id: "wf-1", runs: [run(), run({ run_id: "run-2" })] }),
      listWorkflowTriggerRegistrations: async () => {
        throw new Error("temporary");
      },
    },
  );

  assert.equal(result.workflow.workflow_id, "wf-1");
  assert.equal(result.deployments.length, 1);
  assert.equal(result.runs.length, 2);
  assert.equal(result.selectedRunId, "run-2");
  assert.deepEqual(result.triggerRegistrations, []);
});

test("loadWorkflowRunHistoryState keeps selected run precedence and mark-workflow flag", async () => {
  const result = await loadWorkflowRunHistoryState(
    {
      workflowId: "wf-1",
      currentRunId: "run-2",
      persistedRunId: "run-1",
    },
    {
      listWorkflowRuns: async () => ({
        workflow_id: "wf-1",
        runs: [run({ run_id: "run-1" }), run({ run_id: "run-2" })],
      }),
    },
  );

  assert.equal(result.selectedRunId, "run-2");
  assert.equal(result.shouldMarkWorkflowRun, true);
});

test("saveWorkflowAsyncState returns saved workflow, collection mutation, and feedback", async () => {
  const current = [savedWorkflow({ workflow_id: "wf-existing", title: "Existing" })];
  const result = await saveWorkflowAsyncState(
    {
      workflow: savedWorkflow({ title: "Draft title" }),
      graph: { title: "Draft title", description: "", nodes: [], edges: [], roots: [], presets: [], metadata: {} },
      currentWorkflows: current,
      mode: "prepend",
    },
    {
      saveWorkflow: async () => ({
        saved: true,
        workflow: savedWorkflow({ workflow_id: "wf-saved", title: "Saved title" }),
      }),
    },
  );

  assert.equal(result.saved.workflow_id, "wf-saved");
  assert.equal(result.workflows[0]?.workflow_id, "wf-saved");
  assert.equal(result.feedback, 'Saved "Saved title".');
});

test("describe workflow async helpers return typed describe and fallback states", async () => {
  const branched = await describeWorkflowBranchAsyncState(
    {
      workflowId: "wf-parent",
      eventId: "evt-1",
      intent: "Build a branch",
      presetOverride: "research_assistant",
      optimizationOverride: "balanced",
      regenerationMode: "rebuild",
      currentWorkflows: [savedWorkflow()],
      selectNodeId: () => "node-2",
    },
    {
      describeWorkflow: async () => ({
        described: true,
        workflow: savedWorkflow({ workflow_id: "wf-branch", preset_kinds: ["research_assistant"] }),
        intent_expansion: {
          preset_kind: "research_assistant",
          requires_approval: false,
          needs_branching: false,
          needs_research_support: false,
          public_output: false,
          optimization_mode: "balanced",
        },
      } satisfies WorkflowDescribeResponse),
    },
  );
  const createdFallback = await createWorkflowFromIntentAsyncState(
    {
      intent: "Create fallback",
      presetOverride: "",
      optimizationOverride: "balanced",
      regenerationMode: "rebuild",
      currentWorkflows: [savedWorkflow()],
      fallbackWorkflow: savedWorkflow({ workflow_id: "wf-fallback" }),
      selectNodeId: () => "node-fallback",
    },
    {
      describeWorkflow: async () => {
        throw new Error("offline");
      },
    },
  );
  const regenerated = await regenerateWorkflowFromIntentAsyncState(
    {
      workflow: savedWorkflow({ workflow_id: "wf-existing" }),
      sourceIntent: "Regenerate this",
      presetOverride: "",
      optimizationOverride: "speed",
      regenerationMode: "preserve_manual",
      fallbackWorkflow: savedWorkflow({ workflow_id: "wf-local" }),
      selectNodeId: () => "node-regenerated",
    },
    {
      describeWorkflow: async () => ({
        described: true,
        workflow: savedWorkflow({ workflow_id: "wf-regenerated" }),
        intent_expansion: {
          preset_kind: "research_assistant",
          requires_approval: false,
          needs_branching: false,
          needs_research_support: false,
          public_output: false,
          optimization_mode: "balanced",
        },
      } satisfies WorkflowDescribeResponse),
    },
  );

  assert.equal(branched.workflow.workflow_id, "wf-branch");
  assert.equal(branched.selectedNodeId, "node-2");
  assert.equal(branched.shouldResetExecutionHistory, true);
  assert.match(branched.feedback, /saved a new workflow branch/i);

  assert.equal(createdFallback.workflow.workflow_id, "wf-fallback");
  assert.equal(createdFallback.selectedNodeId, "node-fallback");
  assert.match(createdFallback.feedback, /used local describe fallback/i);

  assert.equal(regenerated.workflow.workflow_id, "wf-regenerated");
  assert.equal(regenerated.selectedNodeId, "node-regenerated");
  assert.match(regenerated.feedback, /regenerated the workflow draft/i);
});

test("patch and wait-resume async helpers return normalized workflow and record state", async () => {
  const patchResult = await patchWorkflowAsyncState(
    {
      workflowId: "wf-1",
      currentWorkflows: [savedWorkflow()],
      patch: { op: "workflow_meta_replace", title: "Updated" },
    },
    {
      patchWorkflow: async () => ({
        patched: true,
        ir_invalidated: true,
        workflow: savedWorkflow({ title: "Updated" }),
      }),
    },
  );
  const waitResumeResult = await loadWorkflowWaitResumeRecordsState(
    {
      workflowId: "wf-1",
      runId: "run-1",
    },
    {
      listWorkflowWaitResumeRecords: async () => ({
        workflow_id: "wf-1",
        run_id: "run-1",
        wait_resume_records: [
          {
            wait_resume_id: "wr-1",
            workflow_id: "wf-1",
            deployment_id: "dep-1",
            run_id: "run-1",
            owner_user_id: "user-1",
            manifest_node_id: "node-1",
            source_graph_node_id: "node-1",
            status: "pending",
            resume_family: "approval",
            resume_kind: "manual",
            descriptor: {},
            created_at: "2026-09-01T00:00:00.000Z",
          },
        ],
      } satisfies WorkflowWaitResumeListResponse),
    },
  );

  assert.equal(patchResult.workflow.title, "Updated");
  assert.equal(patchResult.workflows[0]?.title, "Updated");
  assert.match(patchResult.feedback ?? "", /compiled ir was cleared|rebuilt before deploy/i);
  assert.equal(waitResumeResult.records[0]?.wait_resume_id, "wr-1");
});

test("applyWorkflowBranchPresetAsyncState patches each branch edge and returns the latest workflow state", async () => {
  const patchedEdges: string[] = [];
  const result = await applyWorkflowBranchPresetAsyncState(
    {
      workflowId: "wf-1",
      currentWorkflows: [savedWorkflow()],
      edgeIds: ["edge-a", "edge-b"],
      labels: ["success", "fallback"],
      nodeLabel: "Decision",
    },
    {
      patchWorkflow: async (_workflowId, patch) => {
        patchedEdges.push(patch.edge_id);
        return {
          patched: true,
          ir_invalidated: false,
          workflow: savedWorkflow({ title: `Patched ${patch.edge_id}` }),
        };
      },
    },
  );

  assert.deepEqual(patchedEdges, ["edge-a", "edge-b"]);
  assert.equal(result.workflow.title, "Patched edge-b");
  assert.equal(result.workflows[0]?.title, "Patched edge-b");
  assert.equal(result.feedback, "Applied branch preset to Decision.");
});

test("compileWorkflowAsyncState patches current and collection workflow state consistently", async () => {
  const currentWorkflow = savedWorkflow();
  const result = await compileWorkflowAsyncState(
    {
      workflow: currentWorkflow,
      currentWorkflows: [currentWorkflow],
      compiledAt: "2026-09-01T10:00:00.000Z",
    },
    {
      compileWorkflow: async () => ({
        compiled: true,
        workflow_id: "wf-1",
        ir: { manifests: [{ id: "compiled-1" }] },
        trigger_readiness_summary: { live_registration_supported: true },
      } satisfies WorkflowCompileResponse),
    },
  );

  assert.equal(result.workflow?.latest_ir?.manifests?.[0]?.id, "compiled-1");
  assert.equal(result.workflow?.updated_at, "2026-09-01T10:00:00.000Z");
  assert.equal(result.workflows[0]?.latest_ir?.manifests?.[0]?.id, "compiled-1");
});

test("runWorkflowActionAsyncState returns preflight feedback before calling the network", async () => {
  let called = false;
  const result = await runWorkflowActionAsyncState(
    {
      workflow: savedWorkflow({ latest_ir: null }),
      currentWorkflows: [],
      action: "deploy",
    },
    {
      runWorkflowAction: async () => {
        called = true;
        return {
          updated: true,
          workflow: savedWorkflow(),
        } satisfies WorkflowActionResponse;
      },
    },
  );

  assert.equal(result.kind, "preflight");
  assert.equal(result.feedback, "Compile the workflow before deploying it.");
  assert.equal(called, false);
});

test("runWorkflowActionAsyncState returns updated workflow, collection state, and ui effects", async () => {
  const result = await runWorkflowActionAsyncState(
    {
      workflow: savedWorkflow({ latest_ir: { manifests: [{ id: "compiled" }] } }),
      currentWorkflows: [savedWorkflow()],
      action: "deploy",
      options: { environment: "prod" },
    },
    {
      runWorkflowAction: async () => ({
        updated: true,
        deployment_id: "dep-2",
        trigger_readiness_summary: { live_registration_supported: true },
        workflow: savedWorkflow({
          latest_ir: { manifests: [{ id: "compiled" }] },
        }),
      } satisfies WorkflowActionResponse),
    },
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.workflows[0]?.workflow_id, "wf-1");
  assert.equal(result.uiEffects.refreshDeploymentHistory, true);
  assert.match(result.feedback, /deployed|deployment/i);
});

test("decideWorkflowApprovalAsyncState returns preflight, missing, and success states", async () => {
  const preflight = await decideWorkflowApprovalAsyncState({
    workflowId: null,
    runId: "run-1",
    option: {
      busyAction: "workflow_approval_approved",
      decision: "approved",
      optionId: "opt-1",
      optionLabel: "Approve",
    },
  });
  const missing = await decideWorkflowApprovalAsyncState(
    {
      workflowId: "wf-1",
      runId: "run-1",
      option: {
        busyAction: "workflow_approval_rejected",
        decision: "rejected",
        optionId: "opt-2",
        optionLabel: "Reject",
      },
    },
    {
      listWorkflowWaitResumeRecords: async () => ({
        workflow_id: "wf-1",
        run_id: "run-1",
        wait_resume_records: [],
      } satisfies WorkflowWaitResumeListResponse),
    },
  );
  const success = await decideWorkflowApprovalAsyncState(
    {
      workflowId: "wf-1",
      runId: "run-1",
      option: {
        busyAction: "workflow_approval_approved",
        decision: "approved",
        optionId: "opt-3",
        optionLabel: "Approve",
      },
    },
    {
      listWorkflowWaitResumeRecords: async () => ({
        workflow_id: "wf-1",
        run_id: "run-1",
        wait_resume_records: [
          {
            wait_resume_id: "wr-2",
            workflow_id: "wf-1",
            deployment_id: "dep-1",
            run_id: "run-1",
            owner_user_id: "user-1",
            manifest_node_id: "node-1",
            source_graph_node_id: "node-1",
            status: "pending",
            resume_family: "approval",
            resume_kind: "manual",
            descriptor: {},
            created_at: "2026-09-01T00:00:00.000Z",
          },
        ],
      } satisfies WorkflowWaitResumeListResponse),
      decideWorkflowWaitResume: async () => ({
        updated: true,
        workflow_id: "wf-1",
        run_id: "run-1",
        wait_resume_id: "wr-2",
        decision: "approved",
        wait_resume_status: "approved",
        run: run({ run_id: "run-approved", status: "completed" }),
        decision_dispatch: {},
      } satisfies WorkflowWaitResumeDecisionResponse),
    },
  );

  assert.equal(preflight.kind, "preflight");
  assert.match(preflight.feedback, /select a workflow/i);
  assert.equal(missing.kind, "missing_pending_approval");
  assert.match(missing.feedback, /no longer has a pending approval/i);
  assert.equal(success.kind, "success");
  if (success.kind !== "success") return;
  assert.equal(success.selectedRunId, "run-approved");
  assert.equal(success.shouldExtendLiveRefreshWindow, true);
  assert.match(success.feedback, /approved|run-approved/i);
});

test("startWorkflowRunAsyncState and startWorkflowDryRunAsyncState return typed run feedback and flags", async () => {
  const startResult = await startWorkflowRunAsyncState(
    {
      workflowId: "wf-1",
      kind: "replay",
      options: { replay_run_id: "run-source" },
    },
    {
      startWorkflowRun: async () => ({
        started: true,
        workflow_id: "wf-1",
        run: run({ run_id: "run-replay", status: "running", trigger_kind: "replay" }),
      } satisfies WorkflowRunStartResponse),
    },
  );
  const dryRunResult = await startWorkflowDryRunAsyncState(
    {
      workflowId: "wf-1",
      deploymentId: "dep-1",
    },
    {
      startWorkflowRun: async () => ({
        started: true,
        workflow_id: "wf-1",
        run: run({ run_id: "run-dry", status: "completed", trigger_kind: "dry_run" }),
      } satisfies WorkflowRunStartResponse),
    },
  );

  assert.equal(startResult.selectedRunId, "run-replay");
  assert.equal(startResult.shouldMarkWorkflowRun, true);
  assert.equal(startResult.shouldClearReplayPreview, true);
  assert.match(startResult.feedback, /replay started/i);

  assert.equal(dryRunResult.selectedRunId, "run-dry");
  assert.equal(dryRunResult.shouldMarkWorkflowRun, false);
  assert.equal(dryRunResult.shouldClearReplayPreview, false);
  assert.match(dryRunResult.feedback, /dry run|completed/i);
});
