// @locs-version: 2.0
import type { AfpMessage, DashboardBootstrap, ThreadSummary } from "./api";
import {
  runtimeDeploymentFramework,
  runtimeDeploymentMonitor,
  runtimeDeploymentStatusPanel,
  runtimeDeploymentStatus,
  runtimeDeploymentStatusViews,
} from "./runtimeDeploymentState";
import { runtimeUpdatesPanel } from "./runtimeUpdatesState";
import { threadRetrievalState } from "./threadRetrievalState";

type DashboardBootstrapMessagesCarrier = {
  messages?: AfpMessage[] | null;
} | null | undefined;

type DashboardBootstrapActionLogCarrier = {
  action_log?: DashboardBootstrap["action_log"] | null;
} | null | undefined;

type DashboardBootstrapThreadSummariesCarrier = {
  thread_summaries?: ThreadSummary[] | null;
} | null | undefined;

type DashboardBootstrapProactiveSuggestion = NonNullable<DashboardBootstrap["proactive_suggestions"]>[number];

type DashboardBootstrapProactiveSuggestionsCarrier = {
  proactive_suggestions?: DashboardBootstrap["proactive_suggestions"] | null;
} | null | undefined;

type DashboardBootstrapContinuityBriefCarrier = {
  continuity_brief?: DashboardBootstrap["continuity_brief"] | null;
} | null | undefined;

type DashboardBootstrapContinuityStateFieldsCarrier = {
  continuity_state_fields?: DashboardBootstrap["continuity_state_fields"] | null;
} | null | undefined;

type DashboardBootstrapContinuityWatcherSignalsCarrier = {
  continuity_watcher_signals?: DashboardBootstrap["continuity_watcher_signals"] | null;
} | null | undefined;

type DashboardBootstrapConversationAttentionCarrier = {
  conversation_attention_items?: DashboardBootstrap["conversation_attention_items"] | null;
  conversation_attention_summary?: DashboardBootstrap["conversation_attention_summary"] | null;
} | null | undefined;

type DashboardBootstrapRuntimeSupportCarrier = {
  calendar_runtime_summary?: DashboardBootstrap["calendar_runtime_summary"] | null;
  cost_snapshot?: DashboardBootstrap["cost_snapshot"] | null;
  cost_status?: DashboardBootstrap["cost_status"] | null;
  device_sync_policies?: DashboardBootstrap["device_sync_policies"] | null;
  device_sync_runtime_summary?: DashboardBootstrap["device_sync_runtime_summary"] | null;
  simulator_runtime_summary?: DashboardBootstrap["simulator_runtime_summary"] | null;
  runtime_backups?: DashboardBootstrap["runtime_backups"] | null;
  runtime_deployment?: DashboardBootstrap["runtime_deployment"] | null;
  runtime_restore_drills?: DashboardBootstrap["runtime_restore_drills"] | null;
  runtime_updates?: DashboardBootstrap["runtime_updates"] | null;
  support_access?: DashboardBootstrap["support_access"] | null;
  support_access_history?: DashboardBootstrap["support_access_history"] | null;
  task_runtime_summary?: DashboardBootstrap["task_runtime_summary"] | null;
} | null | undefined;

type DashboardBootstrapOperationalRuntimeCarrier = Pick<
  DashboardBootstrap,
  | "messages"
  | "conversation_attention_summary"
  | "continuity_brief"
  | "runtime_updates"
  | "workflow_runtime_summary"
  | "browser_runtime_summary"
  | "task_runtime_summary"
  | "calendar_runtime_summary"
  | "trust_runtime_summary"
  | "file_runtime_summary"
  | "inbox_runtime_summary"
  | "device_sync_runtime_summary"
  | "simulator_runtime_summary"
  | "runtime_deployment"
  | "support_access"
> | null | undefined;

export type DashboardBootstrapOperationalRuntimeState = {
  conversationAttentionSummary: DashboardBootstrap["conversation_attention_summary"] | null;
  workflowRuntimeSummary: DashboardBootstrap["workflow_runtime_summary"] | null;
  browserRuntimeSummary: DashboardBootstrap["browser_runtime_summary"] | null;
  taskRuntimeSummary: DashboardBootstrap["task_runtime_summary"] | null;
  calendarRuntimeSummary: DashboardBootstrap["calendar_runtime_summary"] | null;
  deviceSyncRuntimeSummary: DashboardBootstrap["device_sync_runtime_summary"] | null;
  simulatorRuntimeSummary: DashboardBootstrap["simulator_runtime_summary"] | null;
  fileRuntimeSummary: DashboardBootstrap["file_runtime_summary"] | null;
  inboxRuntimeSummary: DashboardBootstrap["inbox_runtime_summary"] | null;
  trustRuntimeSummary: DashboardBootstrap["trust_runtime_summary"] | null;
  runtimeStatus: string;
  runtimeFramework: string | null;
  runtimeDeployment: DashboardBootstrap["runtime_deployment"] | null;
  runtimeMonitor: NonNullable<DashboardBootstrap["runtime_deployment"]>["runtime_monitor"] | null;
  runtimeUpdates: DashboardBootstrap["runtime_updates"] | null;
  runtimeUpdatesPanel: NonNullable<DashboardBootstrap["runtime_updates"]>["panel"] | null;
  supportAccess: DashboardBootstrap["support_access"] | null;
  messages: AfpMessage[];
  browserTaskMessages: AfpMessage[];
  workflowRuntimeMessages: AfpMessage[];
  continuityBriefTitle: string | null;
};

export function dashboardBootstrapMessages(
  bootstrap?: DashboardBootstrapMessagesCarrier,
): AfpMessage[] {
  return bootstrap?.messages ?? [];
}

export function dashboardBootstrapActionLog(
  bootstrap?: DashboardBootstrapActionLogCarrier,
): NonNullable<DashboardBootstrap["action_log"]> {
  return bootstrap?.action_log ?? [];
}

export function dashboardBootstrapThreadSummaries(
  bootstrap?: DashboardBootstrapThreadSummariesCarrier,
): ThreadSummary[] {
  return bootstrap?.thread_summaries ?? [];
}

export function dashboardBootstrapThreadRetrievalState(
  bootstrap?: { thread_retrieval_state?: DashboardBootstrap["thread_retrieval_state"] | null } | null,
): DashboardBootstrap["thread_retrieval_state"] | null {
  return threadRetrievalState(bootstrap);
}

export function dashboardBootstrapHasSampleMessages(
  bootstrap?: DashboardBootstrap | null,
): boolean {
  return dashboardBootstrapMessages(bootstrap).some(
    (message) => message.metadata?.source === "sample_bootstrap",
  );
}

export function dashboardBootstrapProactiveSuggestions(
  bootstrap?: DashboardBootstrapProactiveSuggestionsCarrier,
): DashboardBootstrapProactiveSuggestion[] {
  return bootstrap?.proactive_suggestions ?? [];
}

export function dashboardBootstrapContinuityBriefTitle(
  bootstrap?: DashboardBootstrapContinuityBriefCarrier,
): string | null {
  return bootstrap?.continuity_brief?.title ?? null;
}

export function dashboardBootstrapContinuityStateFields(
  bootstrap?: DashboardBootstrapContinuityStateFieldsCarrier,
): NonNullable<DashboardBootstrap["continuity_state_fields"]> {
  return bootstrap?.continuity_state_fields ?? [];
}

export function dashboardBootstrapContinuityWatcherSignals(
  bootstrap?: DashboardBootstrapContinuityWatcherSignalsCarrier,
): NonNullable<DashboardBootstrap["continuity_watcher_signals"]> {
  return bootstrap?.continuity_watcher_signals ?? [];
}

export function dashboardBootstrapConversationAttentionItems(
  bootstrap?: DashboardBootstrapConversationAttentionCarrier,
): NonNullable<DashboardBootstrap["conversation_attention_items"]> {
  return bootstrap?.conversation_attention_items ?? [];
}

export function dashboardBootstrapConversationAttentionSummary(
  bootstrap?: DashboardBootstrapConversationAttentionCarrier,
): DashboardBootstrap["conversation_attention_summary"] | null {
  return bootstrap?.conversation_attention_summary ?? null;
}

export function dashboardBootstrapCalendarRuntimeSummary(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["calendar_runtime_summary"] | null {
  return bootstrap?.calendar_runtime_summary ?? null;
}

export function dashboardBootstrapCostSnapshot(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["cost_snapshot"] | null {
  return bootstrap?.cost_snapshot ?? null;
}

export function dashboardBootstrapCostStatus(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["cost_status"] | null {
  return bootstrap?.cost_status ?? null;
}

export function dashboardBootstrapDeviceSyncRuntimeSummary(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["device_sync_runtime_summary"] | null {
  return bootstrap?.device_sync_runtime_summary ?? null;
}

export function dashboardBootstrapSimulatorRuntimeSummary(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["simulator_runtime_summary"] | null {
  return bootstrap?.simulator_runtime_summary ?? null;
}

export function dashboardBootstrapDeviceSyncPolicyEntries(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): NonNullable<NonNullable<DashboardBootstrap["device_sync_policies"]>["entries"]> {
  return bootstrap?.device_sync_policies?.entries ?? [];
}

export function dashboardBootstrapRuntimeDeployment(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["runtime_deployment"] | null {
  return bootstrap?.runtime_deployment ?? null;
}

export function dashboardBootstrapRuntimeStatusPanel(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): NonNullable<DashboardBootstrap["runtime_deployment"]>["runtime_status_panel"] | null {
  return runtimeDeploymentStatusPanel(dashboardBootstrapRuntimeDeployment(bootstrap));
}

export function dashboardBootstrapRuntimeStatusViews(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): NonNullable<DashboardBootstrap["runtime_deployment"]>["runtime_status_views"] | null {
  return runtimeDeploymentStatusViews(dashboardBootstrapRuntimeDeployment(bootstrap));
}

export function dashboardBootstrapRuntimeUpdates(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["runtime_updates"] | null {
  return bootstrap?.runtime_updates ?? null;
}

export function dashboardBootstrapRuntimeUpdatesPanel(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): NonNullable<DashboardBootstrap["runtime_updates"]>["panel"] | null {
  return runtimeUpdatesPanel(dashboardBootstrapRuntimeUpdates(bootstrap));
}

export function dashboardBootstrapRuntimeBackups(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["runtime_backups"] | null {
  return bootstrap?.runtime_backups ?? null;
}

export function dashboardBootstrapRuntimeRestoreDrills(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["runtime_restore_drills"] | null {
  return bootstrap?.runtime_restore_drills ?? null;
}

export function dashboardBootstrapSupportAccess(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["support_access"] | null {
  return bootstrap?.support_access ?? null;
}

export function dashboardBootstrapSupportAccessHistory(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): NonNullable<DashboardBootstrap["support_access_history"]> {
  return bootstrap?.support_access_history ?? [];
}

export function dashboardBootstrapTaskRuntimeSummary(
  bootstrap?: DashboardBootstrapRuntimeSupportCarrier,
): DashboardBootstrap["task_runtime_summary"] | null {
  return bootstrap?.task_runtime_summary ?? null;
}

export function dashboardBootstrapOperationalRuntimeState(
  bootstrap?: DashboardBootstrapOperationalRuntimeCarrier,
): DashboardBootstrapOperationalRuntimeState {
  const messages = dashboardBootstrapMessages(bootstrap);
  const runtimeDeployment = dashboardBootstrapRuntimeDeployment(bootstrap);
  const runtimeUpdates = dashboardBootstrapRuntimeUpdates(bootstrap);
  return {
    conversationAttentionSummary: dashboardBootstrapConversationAttentionSummary(bootstrap),
    workflowRuntimeSummary: bootstrap?.workflow_runtime_summary ?? null,
    browserRuntimeSummary: bootstrap?.browser_runtime_summary ?? null,
    taskRuntimeSummary: dashboardBootstrapTaskRuntimeSummary(bootstrap),
    calendarRuntimeSummary: dashboardBootstrapCalendarRuntimeSummary(bootstrap),
    deviceSyncRuntimeSummary: dashboardBootstrapDeviceSyncRuntimeSummary(bootstrap),
    simulatorRuntimeSummary: dashboardBootstrapSimulatorRuntimeSummary(bootstrap),
    fileRuntimeSummary: bootstrap?.file_runtime_summary ?? null,
    inboxRuntimeSummary: bootstrap?.inbox_runtime_summary ?? null,
    trustRuntimeSummary: bootstrap?.trust_runtime_summary ?? null,
    runtimeStatus: runtimeDeploymentStatus(runtimeDeployment, runtimeUpdates),
    runtimeFramework: runtimeDeploymentFramework(runtimeDeployment, runtimeUpdates),
    runtimeDeployment,
    runtimeMonitor: runtimeDeploymentMonitor(runtimeDeployment),
    runtimeUpdates,
    runtimeUpdatesPanel: dashboardBootstrapRuntimeUpdatesPanel(bootstrap),
    supportAccess: dashboardBootstrapSupportAccess(bootstrap),
    messages,
    browserTaskMessages: messages.filter((message) => message.type === "browser_task"),
    workflowRuntimeMessages: messages.filter((message) =>
      message.type.includes("workflow")
      || message.type.includes("run")
      || message.type.includes("blueprint")
    ),
    continuityBriefTitle: dashboardBootstrapContinuityBriefTitle(bootstrap),
  };
}
