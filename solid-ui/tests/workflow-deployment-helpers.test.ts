import test from "node:test";
import assert from "node:assert/strict";

import {
  deploymentOverrideDraftForEnvironment,
  deploymentOverridePayload,
  rollbackPreviewDeploymentIdForFocus,
  workflowActionFeedback,
  workflowActionPreflightFeedback,
  workflowActionSuccessUiEffects,
  workflowCompileFeedback,
  workflowCompiledStateForWorkflow,
  workflowConnectorOverrideTargets,
  workflowDeploymentOverrideDraftAfterEnvironmentChange,
  workflowGraphPayload,
  workflowSavedFeedback,
  workflowValidationFeedback,
} from "../src/lib/workflowDeploymentHelpers.ts";
import type { SavedWorkflow } from "../src/lib/api.ts";
import type { WorkflowGraphDraft } from "../src/lib/workflowGraphTypes.ts";

test("deploymentOverridePayload omits empty targeted override maps", () => {
  assert.deepEqual(
    deploymentOverridePayload({
      draft: {
        delivery_tier: "staging",
        auth_mode: "sandbox_credentials",
        side_effects: "preview_only",
        provider_route: "sandbox",
      },
      familyOverrides: {
        slack: {},
      },
      nodeOverrides: {
        "node-1": {},
      },
    }),
    {
      delivery_tier: "staging",
      auth_mode: "sandbox_credentials",
      side_effects: "preview_only",
      provider_route: "sandbox",
    },
  );
});

test("deploymentOverridePayload compacts family and node overrides independently", () => {
  assert.deepEqual(
    deploymentOverridePayload({
      draft: {
        delivery_tier: "production",
        auth_mode: "tenant_credentials",
        side_effects: "executed",
        provider_route: "primary",
      },
      familyOverrides: {
        slack: { auth_mode: "sandbox_credentials" },
        salesforce: { provider_route: "" },
      },
      nodeOverrides: {
        "node-1": { delivery_tier: "staging", side_effects: "preview_only" },
        "node-2": {},
      },
    }),
    {
      delivery_tier: "production",
      auth_mode: "tenant_credentials",
      side_effects: "executed",
      provider_route: "primary",
      family_overrides: {
        slack: { auth_mode: "sandbox_credentials" },
      },
      node_overrides: {
        "node-1": { delivery_tier: "staging", side_effects: "preview_only" },
      },
    },
  );
});

test("workflowDeploymentOverrideDraftAfterEnvironmentChange preserves drafts that match the environment tier", () => {
  const productionDraft = deploymentOverrideDraftForEnvironment("prod");
  const developmentDraft = deploymentOverrideDraftForEnvironment("dev");

  assert.equal(
    workflowDeploymentOverrideDraftAfterEnvironmentChange(productionDraft, "prod"),
    productionDraft,
  );
  assert.equal(
    workflowDeploymentOverrideDraftAfterEnvironmentChange(developmentDraft, "dev"),
    developmentDraft,
  );
});

test("workflowDeploymentOverrideDraftAfterEnvironmentChange rebases drafts across environment tiers", () => {
  assert.deepEqual(
    workflowDeploymentOverrideDraftAfterEnvironmentChange(
      deploymentOverrideDraftForEnvironment("dev"),
      "prod",
    ),
    deploymentOverrideDraftForEnvironment("prod"),
  );
  assert.deepEqual(
    workflowDeploymentOverrideDraftAfterEnvironmentChange(
      deploymentOverrideDraftForEnvironment("prod"),
      "dev",
    ),
    deploymentOverrideDraftForEnvironment("dev"),
  );
});

test("rollbackPreviewDeploymentIdForFocus only targets non-active deployments for an environment", () => {
  const deployments = [
    { deployment_id: "prod-current", environment: "prod" },
    { deployment_id: "prod-old", environment: "prod" },
    { deployment_id: "dev-current", environment: "dev" },
  ];

  assert.equal(rollbackPreviewDeploymentIdForFocus(null, deployments), null);
  assert.equal(rollbackPreviewDeploymentIdForFocus("missing", deployments), null);
  assert.equal(rollbackPreviewDeploymentIdForFocus("prod-current", deployments), null);
  assert.equal(rollbackPreviewDeploymentIdForFocus("prod-old", deployments), "prod-old");
  assert.equal(rollbackPreviewDeploymentIdForFocus("dev-current", deployments), null);
});

test("workflowActionFeedback formats workflow action outcomes with readiness suffixes", () => {
  assert.equal(
    workflowActionFeedback({
      action: "deploy",
      deploymentId: "dep-1",
      triggerReadinessSummary: {
        status: "ready",
        live_registration_supported: true,
      },
    }),
    "Workflow deployed with deployment id dep-1. Trigger registration is live-ready.",
  );
  assert.equal(
    workflowActionFeedback({
      action: "rollback",
      deploymentId: "dep-2",
      triggerReadinessSummary: {
        status: "preview_only",
        live_registration_supported: false,
      },
    }),
    "Workflow rolled back with deployment id dep-2. Trigger wiring is still preview-only.",
  );
  assert.equal(workflowActionFeedback({ action: "favorite", favorite: true }), "Workflow favorited.");
  assert.equal(workflowActionFeedback({ action: "favorite", favorite: false }), "Workflow removed from favorites.");
  assert.equal(workflowActionFeedback({ action: "archive", archivedAt: "2026-07-18T00:00:00.000Z" }), "Workflow archived.");
  assert.equal(workflowActionFeedback({ action: "archive", archivedAt: null }), "Workflow restored from archive.");
});

test("workflowCompileFeedback preserves trigger readiness suffixes", () => {
  assert.equal(
    workflowCompileFeedback({
      status: "ready",
      live_registration_supported: true,
    }),
    "Compiled workflow into deterministic runtime IR. Trigger registration is live-ready.",
  );
  assert.equal(
    workflowCompileFeedback(null),
    "Compiled workflow into deterministic runtime IR.",
  );
});

test("workflowActionPreflightFeedback blocks deploys without compiled IR only", () => {
  const draftWorkflow: SavedWorkflow = {
    workflow_id: "workflow-1",
    owner_user_id: "user-1",
    title: "Draft workflow",
    favorite: false,
    preset_kinds: [],
    graph: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
  const compiledWorkflow: SavedWorkflow = {
    ...draftWorkflow,
    latest_ir: { manifests: [] },
  };

  assert.equal(
    workflowActionPreflightFeedback("deploy", draftWorkflow),
    "Compile the workflow before deploying it.",
  );
  assert.equal(workflowActionPreflightFeedback("deploy", compiledWorkflow), null);
  assert.equal(workflowActionPreflightFeedback("rollback", draftWorkflow), null);
  assert.equal(workflowActionPreflightFeedback("favorite", draftWorkflow), null);
  assert.equal(workflowActionPreflightFeedback("archive", draftWorkflow), null);
});

test("workflowValidationFeedback summarizes invalid, preview-only, and clear validation results", () => {
  assert.equal(
    workflowValidationFeedback({
      valid: false,
      summary: {
        trigger_readiness_summary: {
          status: "blocked",
          live_registration_supported: false,
        },
      },
    }),
    "Workflow validation found validation or compile-time issues.",
  );
  assert.equal(
    workflowValidationFeedback({
      valid: true,
      summary: {
        trigger_readiness_summary: {
          status: "preview_only",
          live_registration_supported: false,
        },
      },
    }),
    "Workflow validation passed with readiness limits. Compiled trigger wiring is still preview-only.",
  );
  assert.equal(
    workflowValidationFeedback({
      valid: true,
      summary: {
        trigger_readiness_summary: {
          status: "ready",
          live_registration_supported: true,
        },
      },
    }),
    "Workflow validation passed.",
  );
  assert.equal(
    workflowValidationFeedback({ valid: true, summary: null }),
    "Workflow validation passed.",
  );
});

test("workflowGraphPayload creates a shallow graph payload without mutating the draft", () => {
  const graph: WorkflowGraphDraft = {
    version: "omnyid-workflow.v1",
    workflow_id: "workflow-1",
    title: "Payload graph",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["node-a"],
    nodes: [],
    edges: [],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: { source: "test" },
  };

  const payload = workflowGraphPayload(graph);

  assert.deepEqual(payload, graph);
  assert.notEqual(payload, graph);
  assert.equal(payload.metadata, graph.metadata);
});

test("workflowSavedFeedback preserves saved workflow title copy", () => {
  assert.equal(workflowSavedFeedback("Morning Ops"), 'Saved "Morning Ops".');
});

test("workflowActionSuccessUiEffects isolates deployment action side effects", () => {
  assert.deepEqual(workflowActionSuccessUiEffects("deploy"), {
    closeDeployPreview: true,
    clearRollbackPreview: false,
    extendLiveRefreshWindow: true,
    refreshDeploymentHistory: true,
  });
  assert.deepEqual(workflowActionSuccessUiEffects("rollback"), {
    closeDeployPreview: false,
    clearRollbackPreview: true,
    extendLiveRefreshWindow: true,
    refreshDeploymentHistory: true,
  });
  assert.deepEqual(workflowActionSuccessUiEffects("favorite"), {
    closeDeployPreview: false,
    clearRollbackPreview: false,
    extendLiveRefreshWindow: false,
    refreshDeploymentHistory: false,
  });
  assert.deepEqual(workflowActionSuccessUiEffects("archive"), {
    closeDeployPreview: false,
    clearRollbackPreview: false,
    extendLiveRefreshWindow: false,
    refreshDeploymentHistory: false,
  });
});

test("workflowConnectorOverrideTargets extracts sorted families from tool nodes only", () => {
  const graph: WorkflowGraphDraft = {
    version: "omnyid-workflow.v1",
    workflow_id: "workflow-1",
    title: "Connector graph",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["tool-a"],
    nodes: [
      {
        id: "tool-a",
        kind: "tool",
        label: "Slack send",
        description: "",
        position: { x: 0, y: 0 },
        config: { capability_id: "email" },
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
      {
        id: "tool-b",
        kind: "tool",
        label: "Generic tool",
        description: "",
        position: { x: 100, y: 0 },
        config: {},
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
      {
        id: "condition-a",
        kind: "condition",
        label: "Decision",
        description: "",
        position: { x: 200, y: 0 },
        config: { integration_family: "ignored" },
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
      {
        id: "tool-c",
        kind: "tool",
        label: "Calendar sync",
        description: "",
        position: { x: 300, y: 0 },
        config: { capability_id: "calendar" },
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
    ],
    edges: [],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };

  assert.deepEqual(workflowConnectorOverrideTargets(null), { families: [], nodes: [] });
  assert.deepEqual(workflowConnectorOverrideTargets(graph), {
    families: ["communications", "integration", "scheduling"],
    nodes: [
      { id: "tool-a", label: "Slack send", family: "communications" },
      { id: "tool-b", label: "Generic tool", family: "integration" },
      { id: "tool-c", label: "Calendar sync", family: "scheduling" },
    ],
  });
});

test("workflowCompiledStateForWorkflow applies compile results without replacing unrelated workflow fields", () => {
  const workflow: SavedWorkflow = {
    workflow_id: "workflow-1",
    owner_user_id: "user-1",
    title: "Original workflow",
    description: "Preserved",
    favorite: true,
    preset_kinds: ["support"],
    graph: { nodes: [], edges: [] },
    latest_ir: { manifests: [{ id: "old" }] },
    trigger_readiness_summary: {
      status: "preview_only",
      live_registration_supported: false,
    },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    archived_at: null,
  };

  const updated = workflowCompiledStateForWorkflow(workflow, {
    ir: { manifests: [{ id: "new" }] },
    triggerReadinessSummary: {
      status: "ready",
      live_registration_supported: true,
    },
    updatedAt: "2026-07-03T00:00:00.000Z",
  });

  assert.deepEqual(updated, {
    ...workflow,
    latest_ir: { manifests: [{ id: "new" }] },
    trigger_readiness_summary: {
      status: "ready",
      live_registration_supported: true,
    },
    updated_at: "2026-07-03T00:00:00.000Z",
  });
  assert.equal(workflow.updated_at, "2026-07-02T00:00:00.000Z");
});
