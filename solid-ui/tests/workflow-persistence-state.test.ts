import test from "node:test";
import assert from "node:assert/strict";

import type {
  SavedWorkflow,
  WorkflowCompileResponse,
  WorkflowTriggerRegistration,
} from "../src/lib/api.ts";
import {
  workflowCompiledCollectionState,
  workflowCompiledCurrentState,
  workflowSaveRequestBody,
  workflowSavedCollectionState,
  workflowTriggerRegistrationsState,
} from "../src/lib/workflowPersistenceState.ts";

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

function compileResponse(overrides: Partial<WorkflowCompileResponse> = {}): WorkflowCompileResponse {
  return {
    compiled: true,
    workflow_id: "wf-1",
    ir: { manifests: [{ id: "manifest-1" }] },
    trigger_readiness_summary: { live_registration_supported: true },
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

test("workflow persistence save request preserves latest ir and workflow defaults", () => {
  const workflow = savedWorkflow({
    favorite: true,
    archived_at: "2026-01-02T00:00:00.000Z",
    latest_ir: { manifests: [{ id: "compiled" }] },
  });

  assert.deepEqual(
    workflowSaveRequestBody({
      graph: { nodes: [{ id: "node-1" }], edges: [] },
      workflow,
    }),
    {
      graph: { nodes: [{ id: "node-1" }], edges: [] },
      latest_ir: { manifests: [{ id: "compiled" }] },
      favorite: true,
      archived: true,
    },
  );
});

test("workflow persistence save request allows explicit action overrides", () => {
  const workflow = savedWorkflow({
    favorite: true,
    archived_at: "2026-01-02T00:00:00.000Z",
    latest_ir: null,
  });

  assert.deepEqual(
    workflowSaveRequestBody({
      graph: { nodes: [], edges: [] },
      workflow,
      favorite: false,
      archived: false,
    }),
    {
      graph: { nodes: [], edges: [] },
      latest_ir: undefined,
      favorite: false,
      archived: false,
    },
  );
});

test("workflow persistence trigger registrations keep typed stable fallback arrays", () => {
  assert.deepEqual(workflowTriggerRegistrationsState(null), []);
  assert.deepEqual(workflowTriggerRegistrationsState({ registrations: [registration()] }), [registration()]);
});

test("workflow persistence compile helpers patch current and collection workflow state consistently", () => {
  const current = savedWorkflow();
  const response = compileResponse({
    ir: { manifests: [{ id: "compiled-2" }] },
    trigger_readiness_summary: { live_registration_supported: false },
  });

  assert.deepEqual(workflowCompiledCurrentState(current, response, "2026-08-31T10:00:00.000Z"), {
    ...current,
    latest_ir: { manifests: [{ id: "compiled-2" }] },
    trigger_readiness_summary: { live_registration_supported: false },
    updated_at: "2026-08-31T10:00:00.000Z",
  });
  assert.deepEqual(workflowCompiledCollectionState([current], response), [{
    ...current,
    latest_ir: { manifests: [{ id: "compiled-2" }] },
    trigger_readiness_summary: { live_registration_supported: false },
  }]);
});

test("workflow persistence saved collection modes preserve list semantics", () => {
  const first = savedWorkflow({ workflow_id: "wf-1", title: "First" });
  const second = savedWorkflow({ workflow_id: "wf-2", title: "Second" });
  const updatedSecond = savedWorkflow({ workflow_id: "wf-2", title: "Second updated" });

  assert.deepEqual(
    workflowSavedCollectionState([first], second, "prepend"),
    [second, first],
  );
  assert.deepEqual(
    workflowSavedCollectionState([first, second], updatedSecond, "prepend_unique"),
    [updatedSecond, first],
  );
  assert.deepEqual(
    workflowSavedCollectionState([first, second], updatedSecond, "replace"),
    [first, updatedSecond],
  );
  assert.deepEqual(
    workflowSavedCollectionState([first], second, "upsert"),
    [second, first],
  );
});
