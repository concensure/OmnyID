import test from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_WEDDING_PLANNING_INTENT_EVENT,
  buildWeddingNavigationIntentFromPresentationAction,
  buildWeddingNavigationIntentFromSidebarAction,
  dispatchWeddingNavigationIntent,
  readWeddingNavigationIntentEventDetail,
  subscribeWeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import type { WeddingPresentationAction } from "@/lib/weddingPresentationState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

function presentationAction(overrides: Partial<WeddingPresentationAction> = {}): WeddingPresentationAction {
  return {
    kind: "open_planning_files",
    label: "Open planning files",
    weddingPlanId: "wedding_plan:alpha",
    responseWorkspaceId: "response_workspace:alpha",
    sourceResponseId: "response-alpha",
    artifactId: "artifact-alpha",
    sectionId: "artifacts",
    ...overrides,
  };
}

test("buildWeddingNavigationIntentFromPresentationAction routes planning files to response queue", () => {
  const intent = buildWeddingNavigationIntentFromPresentationAction(presentationAction());

  assert.equal(intent.view, "response_queue");
  assert.equal(intent.surface, "planning_files");
  assert.equal(intent.artifactId, "artifact-alpha");
  assert.equal(intent.metadata.template, "wedding_planning");
  assert.equal(intent.metadata.response_workspace_id, "response_workspace:alpha");
  assert.match(intent.notice, /Opening wedding documents/);
});

test("buildWeddingNavigationIntentFromPresentationAction maps existing surfaces", () => {
  assert.equal(buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "open_calendar" })).view, "calendar");
  assert.equal(buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "open_graph" })).view, "knowledge_graph");
  assert.equal(buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "open_task_list" })).view, "tasks");
  assert.equal(buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "approve_draft" })).view, "decision_queue");
  assert.equal(buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "continue_chat" })).view, "threads");
  assert.equal(buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "open_map" })).view, "response_queue");
});

test("buildWeddingNavigationIntentFromSidebarAction carries workspace and active artifact context", () => {
  const action: WeddingWorkspaceSidebarAction = {
    kind: "open_tasks",
    label: "Open tasks",
    enabled: true,
    reason: null,
  };
  const intent = buildWeddingNavigationIntentFromSidebarAction({
    action,
    weddingPlanId: "wedding_plan:beta",
    responseWorkspaceId: "response_workspace:beta",
    sourceResponseId: "response-beta",
    artifactId: "artifact-beta",
    metadata: {
      continue_context: {
        version: 1,
        summaryLabel: "2 planning files",
      },
      handoff_context: {
        version: 1,
        summaryLabel: "2 planning files",
        linkedCalendarCount: 1,
        linkedTaskCount: 2,
      },
      graph_context: {
        recommendation_id: "wedding_recommendation:risk:no-backup",
        source_node_ids: ["risk:no-backup"],
        edge_ids: ["edge:no-backup"],
      },
      surface: "malicious_override",
    },
  });

  assert.equal(intent.view, "tasks");
  assert.equal(intent.surface, "tasks");
  assert.equal(intent.sourceResponseId, "response-beta");
  assert.equal(intent.artifactId, "artifact-beta");
  assert.deepEqual(intent.metadata.continue_context, {
    version: 1,
    summaryLabel: "2 planning files",
  });
  assert.deepEqual(intent.metadata.handoff_context, {
    version: 1,
    summaryLabel: "2 planning files",
    linkedCalendarCount: 1,
    linkedTaskCount: 2,
  });
  assert.deepEqual(intent.metadata.graph_context, {
    recommendation_id: "wedding_recommendation:risk:no-backup",
    source_node_ids: ["risk:no-backup"],
    edge_ids: ["edge:no-backup"],
  });
  assert.equal(intent.metadata.surface, "tasks");
});

test("buildWeddingNavigationIntentFromSidebarAction routes provider setup to Connected Apps", () => {
  const action: WeddingWorkspaceSidebarAction = {
    kind: "open_connected_apps",
    label: "Open Connected Apps",
    enabled: true,
    reason: null,
    metadata: {
      provider_handoff_audit: {
        pending_executor_count: 2,
        capabilities: ["email", "registry"],
      },
    },
  };
  const intent = buildWeddingNavigationIntentFromSidebarAction({
    action,
    weddingPlanId: "wedding_plan:providers",
    responseWorkspaceId: "response_workspace:providers",
  });

  assert.equal(intent.view, "connected_apps");
  assert.equal(intent.surface, "connected_apps");
  assert.match(intent.notice, /Connected Apps/i);
  assert.deepEqual(intent.metadata.provider_handoff_audit, {
    pending_executor_count: 2,
    capabilities: ["email", "registry"],
  });
});

test("buildWeddingNavigationIntentFromSidebarAction routes budget summaries to the wedding budget", () => {
  const action: WeddingWorkspaceSidebarAction = {
    kind: "open_budget",
    label: "Open budget",
    enabled: true,
    reason: null,
  };
  const intent = buildWeddingNavigationIntentFromSidebarAction({
    action,
    weddingPlanId: "wedding_plan:budget",
    responseWorkspaceId: "response_workspace:budget",
  });

  assert.equal(intent.view, "response_queue");
  assert.equal(intent.surface, "budget");
  assert.match(intent.notice, /wedding budget/i);
});

test("buildWeddingNavigationIntentFromSidebarAction preserves decision-focus handoff packets", () => {
  const action: WeddingWorkspaceSidebarAction = {
    kind: "open_tasks",
    label: "Open Tasks",
    enabled: true,
    reason: null,
    metadata: {
      decision_focus: {
        version: 1,
        summary_label: "Focus on 2 wedding decisions now; 1 can wait.",
        backlog_count: 1,
        top_source_surface: "tasks",
        focus_items: [{
          id: "task:final-count",
          kind: "task",
          title: "Decide final caterer headcount",
          pressure_family: "obligation",
          source_surface: "tasks",
          evidence_labels: ["final guest count decision"],
        }],
      },
    },
  };
  const intent = buildWeddingNavigationIntentFromSidebarAction({
    action,
    weddingPlanId: "wedding_plan:focus",
    responseWorkspaceId: "response_workspace:focus",
  });

  assert.equal(intent.view, "tasks");
  assert.equal(intent.surface, "tasks");
  assert.deepEqual(intent.metadata.decision_focus, action.metadata?.decision_focus);
});

test("readWeddingNavigationIntentEventDetail preserves safe metadata while normalizing routing fields", () => {
  const detail = readWeddingNavigationIntentEventDetail(new CustomEvent("x", {
    detail: {
      view: "threads",
      surface: "continue_chat",
      weddingPlanId: "wedding_plan:chat",
      responseWorkspaceId: "response_workspace:chat",
      metadata: {
        continue_context: {
          version: 1,
          activeArtifact: { id: "artifact:brief" },
        },
        wedding_plan_id: "wrong",
      },
    },
  }));

  assert.equal(detail?.view, "threads");
  assert.equal(detail?.metadata.wedding_plan_id, "wedding_plan:chat");
  assert.deepEqual(detail?.metadata.continue_context, {
    version: 1,
    activeArtifact: { id: "artifact:brief" },
  });
});

test("wedding navigation event helpers dispatch, read, and unsubscribe", () => {
  const dispatched: Event[] = [];
  const listeners: Array<(event: Event) => void> = [];
  const target = {
    dispatchEvent(event: Event) {
      dispatched.push(event);
      listeners.forEach((listener) => listener(event));
      return true;
    },
    addEventListener(name: string, listener: EventListener) {
      if (name === OPEN_WEDDING_PLANNING_INTENT_EVENT) listeners.push(listener as (event: Event) => void);
    },
    removeEventListener(name: string, listener: EventListener) {
      if (name !== OPEN_WEDDING_PLANNING_INTENT_EVENT) return;
      const index = listeners.indexOf(listener as (event: Event) => void);
      if (index >= 0) listeners.splice(index, 1);
    },
  } as unknown as Window;
  const received: string[] = [];
  const unsubscribe = subscribeWeddingNavigationIntent((intent) => received.push(intent.view), target);
  const intent = buildWeddingNavigationIntentFromPresentationAction(presentationAction({ kind: "open_calendar" }));

  dispatchWeddingNavigationIntent(intent, target);
  unsubscribe();
  dispatchWeddingNavigationIntent(intent, target);

  assert.equal(dispatched.length, 2);
  assert.deepEqual(received, ["calendar"]);
  assert.equal(readWeddingNavigationIntentEventDetail(dispatched[0]!)?.view, "calendar");
});

test("readWeddingNavigationIntentEventDetail rejects malformed details", () => {
  assert.equal(readWeddingNavigationIntentEventDetail(new CustomEvent("x", { detail: null })), null);
  assert.equal(readWeddingNavigationIntentEventDetail(new CustomEvent("x", {
    detail: {
      view: "calendar",
      surface: "unsupported",
      weddingPlanId: "wedding_plan:alpha",
      responseWorkspaceId: "response_workspace:alpha",
    },
  })), null);
  assert.equal(readWeddingNavigationIntentEventDetail(new CustomEvent("x", {
    detail: {
      view: "calendar",
      surface: "calendar",
      weddingPlanId: "",
      responseWorkspaceId: "response_workspace:alpha",
    },
  })), null);
});
