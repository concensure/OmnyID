import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardBootstrapCalendarRuntimeSummary,
  dashboardBootstrapConversationAttentionItems,
  dashboardBootstrapConversationAttentionSummary,
  dashboardBootstrapContinuityBriefTitle,
  dashboardBootstrapContinuityStateFields,
  dashboardBootstrapCostSnapshot,
  dashboardBootstrapCostStatus,
  dashboardBootstrapDeviceSyncPolicyEntries,
  dashboardBootstrapDeviceSyncRuntimeSummary,
  dashboardBootstrapHasSampleMessages,
  dashboardBootstrapMessages,
  dashboardBootstrapOperationalRuntimeState,
  dashboardBootstrapProactiveSuggestions,
  dashboardBootstrapRuntimeBackups,
  dashboardBootstrapRuntimeDeployment,
  dashboardBootstrapRuntimeRestoreDrills,
  dashboardBootstrapSimulatorRuntimeSummary,
  dashboardBootstrapRuntimeStatusPanel,
  dashboardBootstrapRuntimeStatusViews,
  dashboardBootstrapRuntimeUpdates,
  dashboardBootstrapRuntimeUpdatesPanel,
  dashboardBootstrapSupportAccess,
  dashboardBootstrapSupportAccessHistory,
  dashboardBootstrapTaskRuntimeSummary,
  dashboardBootstrapThreadRetrievalState,
  dashboardBootstrapThreadSummaries,
} from "../src/lib/dashboardBootstrapState.ts";

test("dashboard bootstrap selectors provide stable empty fallbacks", () => {
  assert.deepEqual(dashboardBootstrapMessages(null), []);
  assert.deepEqual(dashboardBootstrapThreadSummaries(null), []);
  assert.equal(dashboardBootstrapThreadRetrievalState(null), null);
  assert.equal(dashboardBootstrapHasSampleMessages(null), false);
  assert.deepEqual(dashboardBootstrapProactiveSuggestions(null), []);
  assert.equal(dashboardBootstrapContinuityBriefTitle(null), null);
  assert.deepEqual(dashboardBootstrapContinuityStateFields(null), []);
  assert.deepEqual(dashboardBootstrapConversationAttentionItems(null), []);
  assert.equal(dashboardBootstrapConversationAttentionSummary(null), null);
  assert.equal(dashboardBootstrapCalendarRuntimeSummary(null), null);
  assert.equal(dashboardBootstrapCostSnapshot(null), null);
  assert.equal(dashboardBootstrapCostStatus(null), null);
  assert.deepEqual(dashboardBootstrapDeviceSyncPolicyEntries(null), []);
  assert.equal(dashboardBootstrapDeviceSyncRuntimeSummary(null), null);
  assert.equal(dashboardBootstrapSimulatorRuntimeSummary(null), null);
  assert.equal(dashboardBootstrapRuntimeDeployment(null), null);
  assert.equal(dashboardBootstrapRuntimeStatusPanel(null), null);
  assert.equal(dashboardBootstrapRuntimeStatusViews(null), null);
  assert.equal(dashboardBootstrapRuntimeBackups(null), null);
  assert.equal(dashboardBootstrapRuntimeRestoreDrills(null), null);
  assert.equal(dashboardBootstrapRuntimeUpdates(null), null);
  assert.equal(dashboardBootstrapRuntimeUpdatesPanel(null), null);
  assert.equal(dashboardBootstrapSupportAccess(null), null);
  assert.deepEqual(dashboardBootstrapSupportAccessHistory(null), []);
  assert.equal(dashboardBootstrapTaskRuntimeSummary(null), null);
  assert.deepEqual(dashboardBootstrapOperationalRuntimeState(null), {
    conversationAttentionSummary: null,
    workflowRuntimeSummary: null,
    browserRuntimeSummary: null,
    taskRuntimeSummary: null,
    calendarRuntimeSummary: null,
    deviceSyncRuntimeSummary: null,
    simulatorRuntimeSummary: null,
    fileRuntimeSummary: null,
    inboxRuntimeSummary: null,
    trustRuntimeSummary: null,
    runtimeStatus: "unknown",
    runtimeFramework: null,
    runtimeDeployment: null,
    runtimeMonitor: null,
    runtimeUpdates: null,
    runtimeUpdatesPanel: null,
    supportAccess: null,
    messages: [],
    browserTaskMessages: [],
    workflowRuntimeMessages: [],
    continuityBriefTitle: null,
  });
});

test("dashboard bootstrap selectors expose mounted messages and thread summaries", () => {
  const bootstrap = {
    messages: [
      {
        id: "msg-1",
        thread_id: "thread-1",
        from: "system",
        timestamp: "2026-08-14T06:00:00Z",
        type: "note",
        content: {},
        views: [],
        attachments: [],
      },
    ],
    thread_summaries: [
      {
        thread_id: "thread-1",
        title: "Ops handoff",
        preview: "Review recovery packet",
        message_count: 3,
        last_message_at: "2026-08-14T06:00:00Z",
        supertags: ["ops"],
        score: 0.88,
      },
    ],
    thread_retrieval_state: {
      summary: "Matched recent ops activity",
      badges: ["Recent", "Thread match"],
    },
  };

  assert.equal(dashboardBootstrapMessages(bootstrap).length, 1);
  assert.equal(dashboardBootstrapThreadSummaries(bootstrap).length, 1);
  assert.deepEqual(dashboardBootstrapThreadRetrievalState(bootstrap), {
    summary: "Matched recent ops activity",
    badges: ["Recent", "Thread match"],
  });
});

test("dashboard bootstrap sample detection only triggers on explicit sample sources", () => {
  const liveBootstrap = {
    messages: [
      {
        id: "live-1",
        thread_id: "thread-1",
        from: "system",
        timestamp: "2026-08-14T06:00:00Z",
        type: "note",
        content: {},
        metadata: { source: "live_bootstrap" },
        views: [],
        attachments: [],
      },
    ],
  };
  const sampleBootstrap = {
    messages: [
      {
        id: "sample-1",
        thread_id: "thread-2",
        from: "system",
        timestamp: "2026-08-14T07:00:00Z",
        type: "note",
        content: {},
        metadata: { source: "sample_bootstrap" },
        views: [],
        attachments: [],
      },
    ],
  };

  assert.equal(dashboardBootstrapHasSampleMessages(liveBootstrap), false);
  assert.equal(dashboardBootstrapHasSampleMessages(sampleBootstrap), true);
});

test("dashboard bootstrap runtime selectors expose proactive suggestions and filtered runtime messages", () => {
  const bootstrap = {
    proactive_suggestions: [
      {
        id: "suggestion-1",
        kind: "follow_up",
        title: "Follow up with supplier",
        summary: "A reply is due today.",
      },
    ],
    conversation_attention_items: [
      {
        id: "attention-1",
        title: "Reply to vendor",
      },
    ],
    continuity_brief: {
      title: "Operational handoff",
    },
    continuity_state_fields: [
      {
        key: "focus",
        label: "Focus",
      },
    ],
    conversation_attention_summary: {
      summary: "Two inbox threads need attention",
    },
    workflow_runtime_summary: {
      summary: "One workflow waiting on approval",
    },
    browser_runtime_summary: {
      summary: "Browser task queued",
    },
    task_runtime_summary: {
      summary: "Two tasks overdue",
    },
    calendar_runtime_summary: {
      summary: "Prep block starts in 20 minutes",
    },
    device_sync_runtime_summary: {
      summary: "Last sync delayed",
    },
    simulator_runtime_summary: {
      highest_rollout_stage: "review",
      surfaces: [{ surface: "synthesizer" }],
    },
    device_sync_policies: {
      entries: [
        {
          id: "policy-1",
          name: "Primary device sync",
        },
      ],
    },
    file_runtime_summary: {
      summary: "One document import pending",
    },
    inbox_runtime_summary: {
      summary: "Inbox cleared to 5 priority items",
    },
    trust_runtime_summary: {
      summary: "No trust incidents",
    },
    runtime_deployment: {
      framework: "fastapi",
      runtime_status_panel: {
        title: "Runtime healthy",
      },
      runtime_status_views: [
        {
          format: "rich_text",
          priority: 1,
          content: {},
        },
      ],
    },
    runtime_backups: {
      entries: [],
    },
    runtime_restore_drills: {
      entries: [],
    },
    runtime_updates: {
      summary: "Update available",
      panel: {
        title: "Update panel",
      },
    },
    support_access: {
      enabled: true,
    },
    messages: [
      {
        id: "browser-1",
        thread_id: "thread-browser",
        from: "system",
        timestamp: "2026-08-14T08:00:00Z",
        type: "browser_task",
        content: {},
        views: [],
        attachments: [],
      },
      {
        id: "workflow-1",
        thread_id: "thread-workflow",
        from: "system",
        timestamp: "2026-08-14T08:05:00Z",
        type: "workflow_run",
        content: {},
        views: [],
        attachments: [],
      },
      {
        id: "note-1",
        thread_id: "thread-note",
        from: "system",
        timestamp: "2026-08-14T08:10:00Z",
        type: "note",
        content: {},
        views: [],
        attachments: [],
      },
    ],
  };

  const runtimeState = dashboardBootstrapOperationalRuntimeState(bootstrap);
  assert.equal(dashboardBootstrapProactiveSuggestions(bootstrap).length, 1);
  assert.equal(dashboardBootstrapContinuityBriefTitle(bootstrap), "Operational handoff");
  assert.equal(dashboardBootstrapContinuityStateFields(bootstrap).length, 1);
  assert.equal(dashboardBootstrapConversationAttentionItems(bootstrap).length, 1);
  assert.deepEqual(dashboardBootstrapConversationAttentionSummary(bootstrap), {
    summary: "Two inbox threads need attention",
  });
  assert.deepEqual(dashboardBootstrapCalendarRuntimeSummary(bootstrap), {
    summary: "Prep block starts in 20 minutes",
  });
  assert.equal(dashboardBootstrapCostSnapshot(bootstrap), null);
  assert.equal(dashboardBootstrapCostStatus(bootstrap), null);
  assert.equal(dashboardBootstrapDeviceSyncPolicyEntries(bootstrap).length, 1);
  assert.deepEqual(dashboardBootstrapDeviceSyncRuntimeSummary(bootstrap), {
    summary: "Last sync delayed",
  });
  assert.deepEqual(dashboardBootstrapSimulatorRuntimeSummary(bootstrap), {
    highest_rollout_stage: "review",
    surfaces: [{ surface: "synthesizer" }],
  });
  assert.deepEqual(runtimeState.simulatorRuntimeSummary, {
    highest_rollout_stage: "review",
    surfaces: [{ surface: "synthesizer" }],
  });
  assert.equal(runtimeState.browserTaskMessages.length, 1);
  assert.equal(runtimeState.workflowRuntimeMessages.length, 1);
  assert.equal(runtimeState.messages.length, 3);
  assert.equal(runtimeState.continuityBriefTitle, "Operational handoff");
  assert.equal(runtimeState.runtimeStatus, "unknown");
  assert.equal(runtimeState.runtimeFramework, "fastapi");
  assert.equal(runtimeState.runtimeMonitor, null);
  assert.equal(dashboardBootstrapTaskRuntimeSummary(bootstrap)?.summary, "Two tasks overdue");
  assert.deepEqual(runtimeState.runtimeDeployment, {
    framework: "fastapi",
    runtime_status_panel: { title: "Runtime healthy" },
    runtime_status_views: [
      {
        format: "rich_text",
        priority: 1,
        content: {},
      },
    ],
  });
  assert.deepEqual(dashboardBootstrapRuntimeDeployment(bootstrap), {
    framework: "fastapi",
    runtime_status_panel: { title: "Runtime healthy" },
    runtime_status_views: [
      {
        format: "rich_text",
        priority: 1,
        content: {},
      },
    ],
  });
  assert.deepEqual(dashboardBootstrapRuntimeStatusPanel(bootstrap), { title: "Runtime healthy" });
  assert.equal(dashboardBootstrapRuntimeStatusViews(bootstrap)?.length, 1);
  assert.deepEqual(dashboardBootstrapRuntimeBackups(bootstrap), { entries: [] });
  assert.deepEqual(dashboardBootstrapRuntimeRestoreDrills(bootstrap), { entries: [] });
  assert.deepEqual(runtimeState.runtimeUpdates, { summary: "Update available", panel: { title: "Update panel" } });
  assert.deepEqual(runtimeState.runtimeUpdatesPanel, { title: "Update panel" });
  assert.deepEqual(dashboardBootstrapRuntimeUpdates(bootstrap), { summary: "Update available", panel: { title: "Update panel" } });
  assert.deepEqual(dashboardBootstrapRuntimeUpdatesPanel(bootstrap), { title: "Update panel" });
  assert.deepEqual(runtimeState.supportAccess, { enabled: true });
  assert.deepEqual(dashboardBootstrapSupportAccess(bootstrap), { enabled: true });
  assert.deepEqual(dashboardBootstrapSupportAccessHistory(bootstrap), []);
});
