import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  inferWorkflowSharedReviewShareModeFromHref,
  clearWorkflowStoredSharedReviewLinks,
  loadWorkflowRunHistoryReviewStorageState,
  loadWorkflowSharedReviewLinksStorage,
  persistWorkflowRunHistoryReviewStorageState,
  persistWorkflowSharedReviewLinksStorage,
  readWorkflowStoredSharedReviewRecordState,
  readWorkflowReviewUrlStateFromSearch,
  resolveWorkflowIdToLoad,
  resolveWorkflowRunReviewContextRestorePlan,
  resolveWorkflowRunReviewContextSelection,
  resolveWorkflowReviewUrlNavigationPlan,
  resolveWorkflowSelectedRunId,
  resolveWorkflowStoredSharedReviewSelection,
  resolveWorkflowStoredSharedReviewUiState,
  updateWorkflowStoredSharedReviewLink,
  upsertWorkflowStoredSharedReviewLink,
  upsertWorkflowRunReviewContext,
  upsertWorkflowRunSelection,
  upsertWorkflowStoredSharedReviewUiContext,
  workflowReviewLinkFeedback,
  workflowReviewUrlStateForWorkflow,
  workflowRunReviewContextForPersistence,
  workflowSharedReviewMatchesWorkflowId,
  workflowSharedReviewShareModeFromUrlState,
  workflowRunReviewContextFromUrlState,
  workflowSelectedStoredSharedReviewRecord,
  workflowSelectedStoredSharedReviewRecordState,
  workflowStoredSharedReviewClearPreflightFeedback,
  workflowStoredSharedReviewClearedFeedback,
  workflowStoredSharedReviewPinFeedback,
  workflowStoredSharedReviewPinPreflightFeedback,
  workflowStoredSharedReviewRefreshedFeedback,
  workflowStoredSharedReviewRefreshPreflightFeedback,
  workflowStoredSharedReviewRenameFeedback,
  workflowStoredSharedReviewRenamePreflightFeedback,
  workflowStoredSharedReviewRenamePromptUnavailableFeedback,
  workflowStoredSharedReviewResumeFeedback,
  workflowStoredSharedReviewResumeTarget,
  workflowStoredSharedReviewRecordStatesForWorkflow,
  workflowStoredSharedReviewRecordsForWorkflow,
  workflowStoredSharedReviewNarrowingState,
  workflowStoredSharedReviewUiStateAfterActiveFilterClear,
  workflowStoredSharedReviewUiStateAfterCompositionFocus,
  workflowStoredSharedReviewUiStateAfterPreviewContextClear,
  workflowStoredSharedReviewUiStateAfterPreviewContextReset,
  workflowStoredSharedReviewUiContextForPersistence,
  workflowStoredSharedReviewUiStateFromUrlState,
} from "../src/lib/workflowReviewLocalState.ts";

function createStorage() {
  const storage = new Map<string, string>();
  return {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };
}

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error("storage read blocked");
    },
    setItem() {
      throw new Error("storage write blocked");
    },
    removeItem() {
      throw new Error("storage remove blocked");
    },
    clear() {
      throw new Error("storage clear blocked");
    },
  };
}

test("workflow review local state loaders filter malformed persisted review state", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  const reviewStateKey = accountScopedStorageKey("omnyid.workflow.runHistory.review.v1", userId);
  const sharedLinksKey = accountScopedStorageKey("omnyid.workflow.sharedReviewLinks.v1", userId);
  Object.assign(globalThis, { localStorage });

  localStorage.setItem(
    reviewStateKey,
    JSON.stringify({
      drift_filter: "deployment",
      sort_mode: "drift_desc",
      selected_runs: {
        "workflow-a": "run-a",
        "   ": "run-b",
        "workflow-b": 3,
      },
      review_contexts: {
        "workflow-a": {
          selected_edge_id: "edge-a",
          timeline_filter: "deployment_context",
          focused_node_id: "node-a",
          selected_deployment_id: "deploy-a",
          selected_node_id: "focus-a",
        },
        "workflow-b": {
          selected_edge_id: "edge-b",
          timeline_filter: "invalid",
        },
      },
      shared_review_ui_contexts: {
        "workflow-a": {
          selected_review_id: "review-a",
          show_all: true,
          filter_text: "ops",
          sort_mode: "recent",
          share_mode_filter: "workspace",
          pinned_only: true,
        },
        "workflow-b": {
          sort_mode: "broken",
        },
      },
    }),
  );

  localStorage.setItem(
    sharedLinksKey,
    JSON.stringify({
      "workflow-a": [
        {
          id: "review-1",
          href: "https://example.test/review?a=1",
          saved_at: "2026-07-18T00:00:00.000Z",
          environment: "prod",
          deployment_id: "deploy-1",
          share_mode: "workspace",
          title: " Review A ",
          pinned: true,
        },
        {
          href: "   ",
        },
      ],
      "workflow-b": "https://example.test/core",
      "workflow-c": 4,
    }),
  );

  assert.deepEqual(loadWorkflowRunHistoryReviewStorageState(userId), {
    driftFilter: "deployment",
    sortMode: "drift_desc",
    selectedRuns: { "workflow-a": "run-a" },
    reviewContexts: {
      "workflow-a": {
        selected_edge_id: "edge-a",
        timeline_filter: "deployment_context",
        focused_node_id: "node-a",
        selected_deployment_id: "deploy-a",
        selected_node_id: "focus-a",
      },
    },
    sharedReviewUiContexts: {
      "workflow-a": {
        selected_review_id: "review-a",
        show_all: true,
        filter_text: "ops",
        sort_mode: "recent",
        share_mode_filter: "workspace",
        pinned_only: true,
      },
    },
  });

  assert.deepEqual(
    loadWorkflowSharedReviewLinksStorage({
      createId: (prefix) => `${prefix}-generated`,
      inferShareMode: (href) => (href.includes("core") ? "core" : "workspace"),
      now: () => "2026-07-18T12:00:00.000Z",
    }, userId),
    {
      "workflow-a": [
        {
          id: "review-1",
          href: "https://example.test/review?a=1",
          saved_at: "2026-07-18T00:00:00.000Z",
          environment: "prod",
          deployment_id: "deploy-1",
          share_mode: "workspace",
          title: "Review A",
          pinned: true,
        },
      ],
      "workflow-b": [
        {
          id: "shared_review-generated",
          href: "https://example.test/core",
          saved_at: "2026-07-18T12:00:00.000Z",
          environment: null,
          deployment_id: null,
          share_mode: "core",
          title: null,
          pinned: false,
        },
      ],
    },
  );
});

test("workflow review local state persistence trims and filters malformed values", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  const reviewStateKey = accountScopedStorageKey("omnyid.workflow.runHistory.review.v1", userId);
  const sharedLinksKey = accountScopedStorageKey("omnyid.workflow.sharedReviewLinks.v1", userId);
  Object.assign(globalThis, { localStorage });

  persistWorkflowRunHistoryReviewStorageState({
    driftFilter: "all",
    sortMode: "recent",
    selectedRuns: {
      "workflow-a": "run-a",
      "   ": "run-b",
      "workflow-b": "   ",
    },
    reviewContexts: {
      "workflow-a": {
        selected_edge_id: "edge-a",
        timeline_filter: "all",
        focused_node_id: null,
        selected_deployment_id: " deploy-a ",
        selected_node_id: "",
      },
      "workflow-b": {
        selected_edge_id: null,
        timeline_filter: "all",
        focused_node_id: null,
        selected_deployment_id: null,
        selected_node_id: null,
      },
    },
    sharedReviewUiContexts: {
      "workflow-a": {
        selected_review_id: " review-a ",
        show_all: true,
        filter_text: "ops",
        sort_mode: "recent",
        share_mode_filter: "workspace",
        pinned_only: true,
      },
      "   ": {
        selected_review_id: null,
        show_all: false,
        filter_text: "",
        sort_mode: "priority",
        share_mode_filter: "all",
        pinned_only: false,
      },
    },
  }, userId);

  assert.deepEqual(
    JSON.parse(localStorage.getItem(reviewStateKey) ?? "null"),
    {
      drift_filter: "all",
      sort_mode: "recent",
      selected_runs: { "workflow-a": "run-a" },
      review_contexts: {
        "workflow-a": {
          selected_edge_id: "edge-a",
          timeline_filter: "all",
          focused_node_id: null,
          selected_deployment_id: "deploy-a",
          selected_node_id: null,
        },
        "workflow-b": {
          selected_edge_id: null,
          timeline_filter: "all",
          focused_node_id: null,
          selected_deployment_id: null,
          selected_node_id: null,
        },
      },
      shared_review_ui_contexts: {
        "workflow-a": {
          selected_review_id: "review-a",
          show_all: true,
          filter_text: "ops",
          sort_mode: "recent",
          share_mode_filter: "workspace",
          pinned_only: true,
        },
      },
    },
  );

  persistWorkflowSharedReviewLinksStorage(
    {
      "workflow-a": [
        {
          id: " review-1 ",
          href: " https://example.test/review?a=1 ",
          saved_at: " 2026-07-18T00:00:00.000Z ",
          environment: " prod ",
          deployment_id: " deploy-1 ",
          share_mode: undefined,
          title: " Review A ",
          pinned: true,
        },
        {
          id: "review-2",
          href: "   ",
          saved_at: "2026-07-18T00:00:00.000Z",
          environment: null,
          deployment_id: null,
          share_mode: "core",
          title: null,
          pinned: false,
        },
      ],
      "   ": [],
    },
    {
      inferShareMode: (href) => (href.includes("core") ? "core" : "workspace"),
    },
    userId,
  );

  assert.deepEqual(
    JSON.parse(localStorage.getItem(sharedLinksKey) ?? "null"),
    {
      "workflow-a": [
        {
          id: "review-1",
          href: "https://example.test/review?a=1",
          saved_at: "2026-07-18T00:00:00.000Z",
          environment: "prod",
          deployment_id: "deploy-1",
          share_mode: "workspace",
          title: "Review A",
          pinned: true,
        },
      ],
    },
  );
});

test("workflow review local state tolerates unavailable browser storage", () => {
  Object.assign(globalThis, {
    localStorage: undefined,
    window: {},
  });

  assert.deepEqual(loadWorkflowRunHistoryReviewStorageState(), {
    driftFilter: "all",
    sortMode: "recent",
    selectedRuns: {},
    reviewContexts: {},
    sharedReviewUiContexts: {},
  });
  assert.deepEqual(
    loadWorkflowSharedReviewLinksStorage({
      createId: (prefix) => `${prefix}-generated`,
      inferShareMode: () => "core",
      now: () => "2026-07-18T12:00:00.000Z",
    }),
    {},
  );
  assert.doesNotThrow(() =>
    persistWorkflowRunHistoryReviewStorageState({
      driftFilter: "deployment",
      sortMode: "drift_desc",
      selectedRuns: { "workflow-a": "run-a" },
      reviewContexts: {},
      sharedReviewUiContexts: {},
    }, "user-1"),
  );
  assert.doesNotThrow(() =>
    persistWorkflowSharedReviewLinksStorage(
      {
        "workflow-a": [
          {
            id: "review-1",
            href: "https://example.test/review",
            saved_at: "2026-07-18T00:00:00.000Z",
            environment: null,
            deployment_id: null,
            share_mode: "core",
            title: null,
            pinned: false,
          },
        ],
      },
      { inferShareMode: () => "core" },
      "user-1",
    ),
  );
});

test("workflow review local state tolerates storage read and write failures", () => {
  const localStorage = createThrowingStorage();
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage },
  });

  assert.deepEqual(loadWorkflowRunHistoryReviewStorageState(), {
    driftFilter: "all",
    sortMode: "recent",
    selectedRuns: {},
    reviewContexts: {},
    sharedReviewUiContexts: {},
  });
  assert.deepEqual(
    loadWorkflowSharedReviewLinksStorage({
      createId: (prefix) => `${prefix}-generated`,
      inferShareMode: () => "core",
      now: () => "2026-07-18T12:00:00.000Z",
    }),
    {},
  );
  assert.doesNotThrow(() =>
    persistWorkflowRunHistoryReviewStorageState({
      driftFilter: "deployment",
      sortMode: "drift_desc",
      selectedRuns: { "workflow-a": "run-a" },
      reviewContexts: {},
      sharedReviewUiContexts: {},
    }, "user-1"),
  );
  assert.doesNotThrow(() =>
    persistWorkflowSharedReviewLinksStorage(
      {
        "workflow-a": [
          {
            id: "review-1",
            href: "https://example.test/review",
            saved_at: "2026-07-18T00:00:00.000Z",
            environment: null,
            deployment_id: null,
            share_mode: "core",
            title: null,
            pinned: false,
          },
        ],
      },
      { inferShareMode: () => "core" },
      "user-1",
    ),
  );
});

test("authenticated workflow review ignores unowned legacy global keys", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  const reviewStateKey = accountScopedStorageKey("omnyid.workflow.runHistory.review.v1", userId);
  const sharedLinksKey = accountScopedStorageKey("omnyid.workflow.sharedReviewLinks.v1", userId);
  Object.assign(globalThis, { localStorage });

  localStorage.setItem(
    "omnyid.workflow.runHistory.review.v1",
    JSON.stringify({
      drift_filter: "deployment",
      sort_mode: "drift_desc",
      selected_runs: { "workflow-a": "run-a" },
      review_contexts: {},
      shared_review_ui_contexts: {},
    }),
  );
  localStorage.setItem(
    "omnyid.workflow.sharedReviewLinks.v1",
    JSON.stringify({
      "workflow-a": [
        "https://example.test/review?wf=workflow-a",
      ],
    }),
  );

  assert.deepEqual(loadWorkflowRunHistoryReviewStorageState(userId), {
    driftFilter: "all",
    sortMode: "recent",
    selectedRuns: {},
    reviewContexts: {},
    sharedReviewUiContexts: {},
  });
  assert.deepEqual(
    loadWorkflowSharedReviewLinksStorage({
      createId: (prefix) => `${prefix}-generated`,
      inferShareMode: () => "core",
      now: () => "2026-07-18T12:00:00.000Z",
    }, userId),
    {},
  );

  assert.notEqual(localStorage.getItem("omnyid.workflow.runHistory.review.v1"), null);
  assert.notEqual(localStorage.getItem("omnyid.workflow.sharedReviewLinks.v1"), null);
  assert.equal(localStorage.getItem(reviewStateKey), null);
  assert.equal(localStorage.getItem(sharedLinksKey), null);
});

test("workflow review url state parsing and share-mode inference stay in the review helper", () => {
  assert.equal(readWorkflowReviewUrlStateFromSearch("?tf=broken"), null);
  const urlState = readWorkflowReviewUrlStateFromSearch(
    "?wf=wf-1&run=run-1&edge=edge-1&tf=deployment_context&rdf=deployment&rds=drift_desc&srid=review-1&sra=1&srf=ops&srsm=recent&srmf=workspace&srpo=1",
  );
  assert.deepEqual(urlState, {
    workflow_id: "wf-1",
    run_id: "run-1",
    selected_edge_id: "edge-1",
    timeline_filter: "deployment_context",
    focused_node_id: null,
    selected_deployment_id: null,
    selected_node_id: null,
    drift_filter: "deployment",
    sort_mode: "drift_desc",
    selected_review_id: "review-1",
    show_all_saved_reviews: true,
    saved_review_filter: "ops",
    saved_review_sort_mode: "recent",
    saved_review_share_mode_filter: "workspace",
    saved_review_pinned_only: true,
  });
  assert.ok(urlState);
  assert.deepEqual(workflowRunReviewContextFromUrlState(urlState), {
    selected_edge_id: "edge-1",
    timeline_filter: "deployment_context",
    focused_node_id: null,
    selected_deployment_id: null,
    selected_node_id: null,
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateFromUrlState(urlState), {
    selectedReviewId: "review-1",
    showAll: true,
    filterText: "ops",
    sortMode: "recent",
    shareModeFilter: "workspace",
    pinnedOnly: true,
  });
  assert.equal(workflowSharedReviewShareModeFromUrlState(urlState), "workspace");
  assert.equal(
    inferWorkflowSharedReviewShareModeFromHref(
      "https://example.test/review?wf=wf-1&srid=review-1",
      "https://example.test",
    ),
    "workspace",
  );
  assert.equal(
    inferWorkflowSharedReviewShareModeFromHref(
      "https://example.test/review?wf=wf-1",
      "https://example.test",
    ),
    "core",
  );
  assert.equal(
    workflowSharedReviewShareModeFromUrlState({
      ...urlState,
      selected_review_id: null,
      show_all_saved_reviews: false,
      saved_review_filter: "",
      saved_review_sort_mode: "priority",
      saved_review_share_mode_filter: "all",
      saved_review_pinned_only: false,
    }),
    "core",
  );
  assert.equal(
    workflowSharedReviewMatchesWorkflowId(
      "https://example.test/review?wf=wf-1&run=run-1",
      "wf-1",
      "https://example.test",
    ),
    true,
  );
  assert.equal(
    workflowSharedReviewMatchesWorkflowId(
      "https://example.test/review?wf=wf-2&run=run-1",
      "wf-1",
      "https://example.test",
    ),
    false,
  );
  assert.equal(
    workflowSharedReviewMatchesWorkflowId(
      "https://example.test/review?wf=wf-2&run=run-1",
      "wf-1",
      "https://example.test",
    ),
    false,
  );
  assert.deepEqual(workflowReviewUrlStateForWorkflow(urlState, "wf-1"), urlState);
  assert.equal(workflowReviewUrlStateForWorkflow(urlState, "wf-2"), null);
  assert.deepEqual(
    readWorkflowStoredSharedReviewRecordState(
      {
        href: "https://example.test/review?wf=wf-1&srid=review-1",
        share_mode: undefined,
      },
      "https://example.test",
    ),
    {
      parsedUrl: new URL("https://example.test/review?wf=wf-1&srid=review-1"),
      reviewState: {
        workflow_id: "wf-1",
        run_id: null,
        selected_edge_id: null,
        timeline_filter: "all",
        focused_node_id: null,
        selected_deployment_id: null,
        selected_node_id: null,
        drift_filter: "all",
        sort_mode: "recent",
        selected_review_id: "review-1",
        show_all_saved_reviews: false,
        saved_review_filter: "",
        saved_review_sort_mode: "priority",
        saved_review_share_mode_filter: "all",
        saved_review_pinned_only: false,
      },
      shareMode: "workspace",
    },
  );
  assert.deepEqual(
    resolveWorkflowStoredSharedReviewUiState({
      workflowId: "wf-1",
      pendingUrlState: urlState,
      persistedContext: {
        selected_review_id: "persisted-review",
        show_all: false,
        filter_text: "persisted",
        sort_mode: "priority",
        share_mode_filter: "all",
        pinned_only: false,
      },
    }),
    {
      selectedReviewId: "review-1",
      showAll: true,
      filterText: "ops",
      sortMode: "recent",
      shareModeFilter: "workspace",
      pinnedOnly: true,
    },
  );
  assert.deepEqual(
    resolveWorkflowStoredSharedReviewUiState({
      workflowId: "wf-1",
      pendingUrlState: null,
      persistedContext: {
        selected_review_id: "persisted-review",
        show_all: false,
        filter_text: "persisted",
        sort_mode: "priority",
        share_mode_filter: "core",
        pinned_only: true,
      },
    }),
    {
      selectedReviewId: "persisted-review",
      showAll: false,
      filterText: "persisted",
      sortMode: "priority",
      shareModeFilter: "core",
      pinnedOnly: true,
    },
  );
});

test("workflow review helper resolves run review context selection against current graph and deployments", () => {
  assert.deepEqual(
    resolveWorkflowRunReviewContextSelection({
      context: null,
      nodes: [{ id: "node-a" }],
      edges: [{ id: "edge-a" }],
      deployments: [{ deployment_id: "deploy-a" }],
    }),
    {
      selectedNodeId: null,
      selectedRunEdgeId: null,
      runTimelineFilterMode: "all",
      runTimelineFocusNodeId: null,
      selectedDeploymentRecordId: null,
    },
  );

  assert.deepEqual(
    resolveWorkflowRunReviewContextSelection({
      context: {
        selected_node_id: "node-a",
        selected_edge_id: "edge-a",
        timeline_filter: "deployment_context",
        focused_node_id: "node-b",
        selected_deployment_id: "deploy-a",
      },
      nodes: [{ id: "node-a" }, { id: "node-b" }],
      edges: [{ id: "edge-a" }],
      deployments: [{ deployment_id: "deploy-a" }],
    }),
    {
      selectedNodeId: "node-a",
      selectedRunEdgeId: "edge-a",
      runTimelineFilterMode: "deployment_context",
      runTimelineFocusNodeId: "node-b",
      selectedDeploymentRecordId: "deploy-a",
    },
  );

  assert.deepEqual(
    resolveWorkflowRunReviewContextSelection({
      context: {
        selected_node_id: "missing-node",
        selected_edge_id: "missing-edge",
        timeline_filter: "replay_drift",
        focused_node_id: "missing-focus",
        selected_deployment_id: "missing-deploy",
      },
      nodes: [{ id: "node-a" }],
      edges: [{ id: "edge-a" }],
      deployments: [{ deployment_id: "deploy-a" }],
    }),
    {
      selectedNodeId: null,
      selectedRunEdgeId: null,
      runTimelineFilterMode: "replay_drift",
      runTimelineFocusNodeId: null,
      selectedDeploymentRecordId: null,
    },
  );
});

test("workflow review helper filters, parses, and selects stored shared-review records", () => {
  const origin = "https://example.test";
  const links = {
    "wf-1": [
      {
        id: "review-a",
        href: "https://example.test/review?wf=wf-1&run=run-a&srid=review-a",
        saved_at: "2026-07-18T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-a",
        share_mode: "workspace" as const,
        title: "Review A",
        pinned: false,
      },
      {
        id: "review-other-workflow",
        href: "https://example.test/review?wf=wf-2&run=run-b",
        saved_at: "2026-07-18T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-b",
        share_mode: "core" as const,
        title: null,
        pinned: false,
      },
      {
        id: "review-invalid",
        href: "::::",
        saved_at: "2026-07-18T00:00:00.000Z",
        environment: null,
        deployment_id: null,
        share_mode: "core" as const,
        title: null,
        pinned: false,
      },
    ],
  };

  const records = workflowStoredSharedReviewRecordsForWorkflow(links, "wf-1", origin);
  assert.deepEqual(records.map((record) => record.id), ["review-a", "review-invalid"]);

  const states = workflowStoredSharedReviewRecordStatesForWorkflow(records, origin);
  assert.equal(states[0]?.recordState?.reviewState?.selected_review_id, "review-a");
  assert.equal(states[0]?.recordState?.shareMode, "workspace");
  assert.ok(states[1]?.recordState);
  assert.equal(states[1]?.recordState?.reviewState, null);
  assert.equal(workflowSelectedStoredSharedReviewRecord(records, "review-a")?.id, "review-a");
  assert.equal(workflowSelectedStoredSharedReviewRecord(records, "missing")?.id, "review-a");
  assert.equal(workflowSelectedStoredSharedReviewRecord([], "missing"), null);
  assert.equal(workflowSelectedStoredSharedReviewRecordState(states, "review-a")?.record.id, "review-a");
  assert.equal(workflowSelectedStoredSharedReviewRecordState(states, "missing"), null);
  assert.deepEqual(workflowStoredSharedReviewRecordsForWorkflow(links, null, origin), []);
});

test("workflow review helper builds saved-review action feedback and resume targets", () => {
  assert.equal(
    workflowReviewLinkFeedback({
      copied: true,
      href: "https://example.test/review",
      includeSavedReviewWorkspace: true,
      savedReviewWorkspaceActive: true,
    }),
    "Copied investigation link to clipboard with the current run review and saved-review workspace context.",
  );
  assert.equal(
    workflowReviewLinkFeedback({
      copied: false,
      href: "https://example.test/review",
      includeSavedReviewWorkspace: false,
      savedReviewWorkspaceActive: true,
    }),
    "Copy this investigation link manually. It includes the current run review context only: https://example.test/review",
  );

  const entry = {
    record: {
      id: "review-a",
      href: "https://example.test/workflows?wf=wf-1&run=run-a#timeline",
      saved_at: "2026-07-18T00:00:00.000Z",
      environment: "prod",
      deployment_id: "dep-a",
      share_mode: "workspace" as const,
      title: null,
      pinned: false,
    },
    recordState: readWorkflowStoredSharedReviewRecordState(
      {
        href: "https://example.test/workflows?wf=wf-1&run=run-a#timeline",
        share_mode: "workspace",
      },
      "https://example.test",
    ),
  };

  assert.deepEqual(workflowStoredSharedReviewResumeTarget(null), null);
  assert.deepEqual(workflowStoredSharedReviewResumeTarget(entry), {
    nextUrl: "/workflows?wf=wf-1&run=run-a#timeline",
    reviewState: entry.recordState?.reviewState,
    shareMode: "workspace",
  });
  assert.equal(
    workflowStoredSharedReviewResumeFeedback("workspace"),
    "Restored the stored shared investigation and its saved-review workspace context for this workflow.",
  );
  assert.equal(
    workflowStoredSharedReviewResumeFeedback("core"),
    "Restored the stored shared investigation context for this workflow.",
  );
  assert.equal(
    workflowStoredSharedReviewRenameFeedback("  Ops snapshot  "),
    'Renamed the saved investigation to "Ops snapshot".',
  );
  assert.equal(
    workflowStoredSharedReviewRenameFeedback("  "),
    "Cleared the custom name for the saved investigation.",
  );
  assert.equal(workflowStoredSharedReviewPinFeedback(false), "Pinned the saved investigation.");
  assert.equal(workflowStoredSharedReviewPinFeedback(true), "Unpinned the saved investigation.");
  assert.equal(
    workflowStoredSharedReviewClearPreflightFeedback(null, entry.record),
    "No stored shared investigation context is available to clear.",
  );
  assert.equal(
    workflowStoredSharedReviewClearPreflightFeedback("wf-1", null),
    "No stored shared investigation context is available to clear.",
  );
  assert.equal(workflowStoredSharedReviewClearPreflightFeedback("wf-1", entry.record), null);
  assert.equal(
    workflowStoredSharedReviewClearedFeedback(),
    "Cleared the stored shared investigation context for this workflow.",
  );
  assert.equal(
    workflowStoredSharedReviewRefreshPreflightFeedback(null),
    "Select a workflow before refreshing its stored shared investigation.",
  );
  assert.equal(workflowStoredSharedReviewRefreshPreflightFeedback("wf-1"), null);
  assert.equal(
    workflowStoredSharedReviewRefreshedFeedback(),
    "Updated the stored shared investigation to match the current review context.",
  );
  assert.equal(
    workflowStoredSharedReviewRenamePreflightFeedback(null, entry.record),
    "No stored shared investigation is selected to rename.",
  );
  assert.equal(
    workflowStoredSharedReviewRenamePreflightFeedback("wf-1", null),
    "No stored shared investigation is selected to rename.",
  );
  assert.equal(workflowStoredSharedReviewRenamePreflightFeedback("wf-1", entry.record), null);
  assert.equal(
    workflowStoredSharedReviewRenamePromptUnavailableFeedback(),
    "Could not open the saved investigation rename prompt.",
  );
  assert.equal(
    workflowStoredSharedReviewPinPreflightFeedback(null, entry.record),
    "No stored shared investigation is selected to pin.",
  );
  assert.equal(
    workflowStoredSharedReviewPinPreflightFeedback("wf-1", null),
    "No stored shared investigation is selected to pin.",
  );
  assert.equal(workflowStoredSharedReviewPinPreflightFeedback("wf-1", entry.record), null);
});

test("workflow review helper resolves selected run ids by current, preferred, persisted, then fallback", () => {
  const runs = [{ run_id: "run-a" }, { run_id: "run-b" }];

  assert.equal(
    resolveWorkflowSelectedRunId({
      runs,
      currentRunId: "run-b",
      preferredRunId: "run-a",
      persistedRunId: "run-a",
    }),
    "run-b",
  );
  assert.equal(
    resolveWorkflowSelectedRunId({
      runs,
      preferredRunId: "run-b",
      persistedRunId: "run-a",
    }),
    "run-b",
  );
  assert.equal(
    resolveWorkflowSelectedRunId({
      runs,
      preferredRunId: "missing",
      persistedRunId: "run-a",
    }),
    "run-a",
  );
  assert.equal(
    resolveWorkflowSelectedRunId({
      runs,
      preferredRunId: "missing",
      persistedRunId: "missing",
    }),
    "run-a",
  );
  assert.equal(resolveWorkflowSelectedRunId({ runs: [] }), null);
});

test("workflow review helper resolves initial workflow ids by preferred id then first available", () => {
  const workflows = [{ workflow_id: "wf-a" }, { workflow_id: "wf-b" }];

  assert.equal(
    resolveWorkflowIdToLoad({
      workflows,
      preferredWorkflowId: "wf-b",
      currentWorkflowPresent: false,
    }),
    "wf-b",
  );
  assert.equal(
    resolveWorkflowIdToLoad({
      workflows,
      preferredWorkflowId: "missing",
      currentWorkflowPresent: false,
    }),
    "wf-a",
  );
  assert.equal(
    resolveWorkflowIdToLoad({
      workflows,
      preferredWorkflowId: "wf-b",
      currentWorkflowPresent: true,
    }),
    null,
  );
  assert.equal(
    resolveWorkflowIdToLoad({
      workflows: [],
      preferredWorkflowId: "wf-b",
      currentWorkflowPresent: false,
    }),
    null,
  );
});

test("workflow review helper builds restore plans from URL state before persisted context", () => {
  const persistedContext = {
    selected_edge_id: "persisted-edge",
    timeline_filter: "all" as const,
    focused_node_id: "persisted-node",
    selected_deployment_id: "persisted-deployment",
    selected_node_id: "persisted-node",
  };
  const urlState = readWorkflowReviewUrlStateFromSearch(
    "?wf=wf-1&edge=edge-1&tf=deployment_context&node=node-1&dep=dep-1&sra=1&srmf=workspace",
  );
  assert.ok(urlState);

  assert.deepEqual(
    resolveWorkflowRunReviewContextRestorePlan({
      workflowId: "wf-1",
      pendingUrlState: urlState,
      persistedContext,
    }),
    {
      clearPendingUrlReviewState: true,
      context: {
        selected_edge_id: "edge-1",
        timeline_filter: "deployment_context",
        focused_node_id: null,
        selected_deployment_id: "dep-1",
        selected_node_id: "node-1",
      },
      persistSharedReviewLink: true,
      shareMode: "workspace",
      showSharedReviewBanner: true,
      workflowUrlState: urlState,
    },
  );

  assert.deepEqual(
    resolveWorkflowRunReviewContextRestorePlan({
      workflowId: "wf-2",
      pendingUrlState: urlState,
      persistedContext,
    }),
    {
      clearPendingUrlReviewState: false,
      context: persistedContext,
      persistSharedReviewLink: false,
      shareMode: null,
      showSharedReviewBanner: false,
      workflowUrlState: null,
    },
  );
});

test("workflow review helper resolves stored shared-review selection by active, URL, persisted, then fallback", () => {
  const records = [{ id: "review-a" }, { id: "review-b" }, { id: "review-c" }];

  assert.equal(
    resolveWorkflowStoredSharedReviewSelection({
      records,
      selectedId: "review-b",
      urlSelectedId: "review-c",
      persistedSelectedId: "review-a",
    }),
    "review-b",
  );
  assert.equal(
    resolveWorkflowStoredSharedReviewSelection({
      records,
      selectedId: "missing",
      urlSelectedId: "review-c",
      persistedSelectedId: "review-a",
    }),
    "review-c",
  );
  assert.equal(
    resolveWorkflowStoredSharedReviewSelection({
      records,
      selectedId: null,
      urlSelectedId: "missing",
      persistedSelectedId: "review-a",
    }),
    "review-a",
  );
  assert.equal(
    resolveWorkflowStoredSharedReviewSelection({
      records,
      selectedId: null,
      urlSelectedId: undefined,
      persistedSelectedId: "missing",
    }),
    "review-a",
  );
  assert.equal(
    resolveWorkflowStoredSharedReviewSelection({
      records: [],
      selectedId: "missing",
      urlSelectedId: "missing",
      persistedSelectedId: "missing",
    }),
    null,
  );
});

test("workflow review helper normalizes stored shared-review selector narrowing", () => {
  assert.deepEqual(
    workflowStoredSharedReviewNarrowingState({
      recordCount: 4,
      showAll: true,
      filterText: "ops",
    }),
    { showAll: false, filterText: "" },
  );
  assert.deepEqual(
    workflowStoredSharedReviewNarrowingState({
      recordCount: 5,
      showAll: false,
      filterText: "ops",
    }),
    { showAll: false, filterText: "" },
  );
  assert.deepEqual(
    workflowStoredSharedReviewNarrowingState({
      recordCount: 5,
      showAll: true,
      filterText: "ops",
    }),
    { showAll: true, filterText: "ops" },
  );
});

test("workflow review helper reduces stored shared-review selector UI transitions", () => {
  const state = {
    selectedReviewId: "review-1",
    showAll: false,
    filterText: "ops",
    sortMode: "recent" as const,
    shareModeFilter: "workspace" as const,
    pinnedOnly: true,
  };

  assert.deepEqual(workflowStoredSharedReviewUiStateAfterCompositionFocus(state, "all"), {
    ...state,
    showAll: true,
    filterText: "",
    shareModeFilter: "all",
    pinnedOnly: false,
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateAfterCompositionFocus(state, "pinned"), {
    ...state,
    showAll: true,
    sortMode: "priority",
    pinnedOnly: true,
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateAfterCompositionFocus(state, "core"), {
    ...state,
    showAll: true,
    shareModeFilter: "core",
    pinnedOnly: false,
  });

  assert.deepEqual(workflowStoredSharedReviewUiStateAfterActiveFilterClear(state, "pinned_only"), {
    ...state,
    pinnedOnly: false,
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateAfterActiveFilterClear(state, "share_mode"), {
    ...state,
    shareModeFilter: "all",
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateAfterActiveFilterClear(state, "search"), {
    ...state,
    filterText: "",
  });

  assert.deepEqual(workflowStoredSharedReviewUiStateAfterPreviewContextClear(state, "expanded"), {
    ...state,
    showAll: false,
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateAfterPreviewContextClear(state, "sort_mode"), {
    ...state,
    sortMode: "priority",
  });
  assert.deepEqual(workflowStoredSharedReviewUiStateAfterPreviewContextReset(state), {
    ...state,
    showAll: false,
    filterText: "",
    sortMode: "priority",
    shareModeFilter: "all",
    pinnedOnly: false,
  });
});

test("workflow review helper upserts stored shared-review links with stable ordering and limits", () => {
  const current = {
    "wf-1": [
      {
        id: "pinned-old",
        href: "https://example.test/pinned",
        saved_at: "2026-07-18T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-1",
        share_mode: "core" as const,
        title: null,
        pinned: true,
      },
      {
        id: "old",
        href: "https://example.test/old",
        saved_at: "2026-07-17T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-1",
        share_mode: "core" as const,
        title: null,
        pinned: false,
      },
    ],
  };

  assert.deepEqual(
    upsertWorkflowStoredSharedReviewLink(current, {
      workflowId: "wf-1",
      href: "https://example.test/new",
      savedAt: "2026-07-19T00:00:00.000Z",
      environment: "prod",
      deploymentId: "dep-1",
      shareMode: "workspace",
      createId: () => "new",
    })["wf-1"].map((entry) => entry.id),
    ["pinned-old", "new", "old"],
  );

  assert.deepEqual(
    upsertWorkflowStoredSharedReviewLink(current, {
      workflowId: "wf-1",
      href: "https://example.test/new",
      savedAt: "2026-07-19T00:00:00.000Z",
      environment: "prod",
      deploymentId: "dep-1",
      shareMode: "workspace",
      createId: () => "new",
      limit: 2,
    })["wf-1"].map((entry) => entry.id),
    ["pinned-old", "new"],
  );
});

test("workflow review helper preserves stored shared-review link identity for unchanged effective state", () => {
  const current = {
    "wf-1": [
      {
        id: "review-1",
        href: "https://example.test/review",
        saved_at: "2026-07-18T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-1",
        title: null,
        pinned: false,
      },
    ],
  };

  assert.equal(
    upsertWorkflowStoredSharedReviewLink(current, {
      workflowId: "wf-1",
      href: "https://example.test/review",
      savedAt: "2026-07-18T00:00:00.000Z",
      environment: "prod",
      deploymentId: "dep-1",
      shareMode: "workspace",
      createId: () => "unused",
      shareModeForRecord: () => "workspace",
    }),
    current,
  );
});

test("workflow review helper updates and clears stored shared-review links", () => {
  const current = {
    "wf-1": [
      {
        id: "review-1",
        href: "https://example.test/review-1",
        saved_at: "2026-07-18T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-1",
        share_mode: "core" as const,
        title: null,
        pinned: false,
      },
      {
        id: "review-2",
        href: "https://example.test/review-2",
        saved_at: "2026-07-17T00:00:00.000Z",
        environment: "prod",
        deployment_id: "dep-1",
        share_mode: "workspace" as const,
        title: null,
        pinned: false,
      },
    ],
  };

  assert.equal(updateWorkflowStoredSharedReviewLink(current, "wf-1", "missing", (entry) => entry), current);
  assert.deepEqual(
    updateWorkflowStoredSharedReviewLink(current, "wf-1", "review-2", (entry) => ({
      ...entry,
      pinned: true,
    }))["wf-1"].map((entry) => entry.id),
    ["review-2", "review-1"],
  );
  assert.deepEqual(clearWorkflowStoredSharedReviewLinks(current, "wf-1", "review-1"), {
    "wf-1": [current["wf-1"][1]],
  });
  assert.deepEqual(clearWorkflowStoredSharedReviewLinks(current, "wf-1"), {});
  assert.equal(clearWorkflowStoredSharedReviewLinks(current, "missing"), current);
});

test("workflow review helper resolves clear, load, and apply URL navigation plans", () => {
  const runs = [{ run_id: "run-a" }, { run_id: "run-b" }];

  assert.deepEqual(
    resolveWorkflowReviewUrlNavigationPlan({
      urlState: null,
      currentWorkflowId: "wf-1",
      runs,
      persistedRunId: "run-b",
    }),
    {
      kind: "clear",
      driftFilter: "all",
      sortMode: "recent",
      selectedRunId: "run-b",
    },
  );

  const urlState = readWorkflowReviewUrlStateFromSearch(
    "?wf=wf-2&run=run-a&edge=edge-1&tf=deployment_context&rdf=deployment&rds=drift_desc&srid=review-1&sra=1&srf=ops&srsm=recent&srmf=workspace&srpo=1",
  );
  assert.ok(urlState);

  assert.deepEqual(
    resolveWorkflowReviewUrlNavigationPlan({
      urlState,
      currentWorkflowId: "wf-1",
      runs,
    }),
    {
      kind: "load-workflow",
      driftFilter: "deployment",
      sortMode: "drift_desc",
      pendingUrlState: urlState,
      workflowIdToLoad: "wf-2",
    },
  );

  assert.deepEqual(
    resolveWorkflowReviewUrlNavigationPlan({
      urlState: { ...urlState, workflow_id: "wf-1" },
      currentWorkflowId: "wf-1",
      runs,
    }),
    {
      kind: "apply",
      driftFilter: "deployment",
      sortMode: "drift_desc",
      pendingUrlState: { ...urlState, workflow_id: "wf-1" },
      selectedRunId: "run-a",
      runReviewContext: {
        selected_edge_id: "edge-1",
        timeline_filter: "deployment_context",
        focused_node_id: null,
        selected_deployment_id: null,
        selected_node_id: null,
      },
      sharedReviewUiState: {
        selectedReviewId: "review-1",
        showAll: true,
        filterText: "ops",
        sortMode: "recent",
        shareModeFilter: "workspace",
        pinnedOnly: true,
      },
    },
  );
});

test("workflow review upsert helpers preserve object identity for unchanged state", () => {
  const selections = { "wf-1": "run-1" };
  assert.equal(upsertWorkflowRunSelection(selections, null, "run-2"), selections);
  assert.equal(upsertWorkflowRunSelection(selections, "wf-1", "run-1"), selections);
  assert.deepEqual(upsertWorkflowRunSelection(selections, "wf-1", "run-2"), { "wf-1": "run-2" });

  const runContext = {
    selected_edge_id: "edge-1",
    timeline_filter: "deployment_context" as const,
    focused_node_id: "node-focus",
    selected_deployment_id: "dep-1",
    selected_node_id: "node-1",
  };
  const runContexts = { "wf-1": runContext };
  assert.equal(upsertWorkflowRunReviewContext(runContexts, undefined, runContext), runContexts);
  assert.equal(upsertWorkflowRunReviewContext(runContexts, "wf-1", { ...runContext }), runContexts);
  assert.deepEqual(
    upsertWorkflowRunReviewContext(runContexts, "wf-1", { ...runContext, timeline_filter: "all" }),
    { "wf-1": { ...runContext, timeline_filter: "all" } },
  );

  const sharedContext = {
    selected_review_id: "review-1",
    show_all: true,
    filter_text: "ops",
    sort_mode: "recent" as const,
    share_mode_filter: "workspace" as const,
    pinned_only: true,
  };
  const sharedContexts = { "wf-1": sharedContext };
  assert.equal(upsertWorkflowStoredSharedReviewUiContext(sharedContexts, null, sharedContext), sharedContexts);
  assert.equal(upsertWorkflowStoredSharedReviewUiContext(sharedContexts, "wf-1", { ...sharedContext }), sharedContexts);
  assert.deepEqual(
    upsertWorkflowStoredSharedReviewUiContext(sharedContexts, "wf-1", { ...sharedContext, pinned_only: false }),
    { "wf-1": { ...sharedContext, pinned_only: false } },
  );
});

test("workflow review persistence builders preserve storage field names", () => {
  assert.deepEqual(
    workflowRunReviewContextForPersistence({
      focusedNodeId: "focus-node",
      runTimelineFilterMode: "replay_drift",
      selectedDeploymentRecordId: "dep-1",
      selectedNodeId: "node-1",
      selectedRunEdgeId: "edge-1",
    }),
    {
      selected_edge_id: "edge-1",
      timeline_filter: "replay_drift",
      focused_node_id: "focus-node",
      selected_deployment_id: "dep-1",
      selected_node_id: "node-1",
    },
  );

  assert.deepEqual(
    workflowStoredSharedReviewUiContextForPersistence({
      filterText: " ops ",
      pinnedOnly: true,
      selectedReviewId: "review-1",
      shareModeFilter: "workspace",
      showAll: true,
      sortMode: "recent",
    }),
    {
      selected_review_id: "review-1",
      show_all: true,
      filter_text: " ops ",
      sort_mode: "recent",
      share_mode_filter: "workspace",
      pinned_only: true,
    },
  );
});
