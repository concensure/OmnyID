// @locs-version: 1.0
import {
  fleetActiveCount,
  fleetIdleCount,
  fleetRecentTasks,
  isAgentFleetTaskActive,
  isAgentFleetTaskCancellable,
  isAgentFleetTaskCancelled,
  isAgentFleetTaskCompleted,
  isAgentFleetTaskFailed,
  isAgentFleetTaskPending,
  type AgentFleetDelegation,
  type AgentFleetResponse,
  type AgentFleetTask,
} from "./agentFleetResponseState";
import { surfaceShortDateLabel, surfaceTimeLabel } from "./surfaceTimestampPresentation";

export type AgentFleetSummaryState = {
  activeCount: number;
  idleCount: number;
  hasActiveWork: boolean;
  indicatorClass: string;
  statusLabel: string;
};

export type AgentFleetDelegationRowState = {
  id: string;
  scope: string;
  mask: string;
  expiresLabel: string;
  taskLabel: string;
};

export type AgentFleetTaskRowState = {
  id: string;
  label: string;
  status: string;
  statusClass: string;
  durationLabel: string | null;
  priority: string;
  createdLabel: string;
  canCancel: boolean;
};

function formatFleetDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function formatFleetDate(value: string | null | undefined): string {
  if (!value) return "";
  return surfaceShortDateLabel(value) || value;
}

function formatFleetTime(value: string | null | undefined): string {
  if (!value) return "";
  return surfaceTimeLabel(value) || value;
}

export function agentFleetSummaryState(fleet?: AgentFleetResponse | null): AgentFleetSummaryState {
  const activeCount = fleetActiveCount(fleet);
  const idleCount = fleetIdleCount(fleet);
  const hasActiveWork = activeCount > 0;
  return {
    activeCount,
    idleCount,
    hasActiveWork,
    indicatorClass: hasActiveWork ? "animate-pulse bg-blue-500" : "bg-green-400",
    statusLabel: `${activeCount} active | ${idleCount} pending`,
  };
}

export function agentFleetDelegationRowState(
  delegation: AgentFleetDelegation,
): AgentFleetDelegationRowState {
  return {
    id: delegation.id,
    scope: delegation.scope,
    mask: delegation.mask,
    expiresLabel: formatFleetTime(delegation.expires_at),
    taskLabel: delegation.task_id ?? "-",
  };
}

export function agentFleetDelegationRowStates(
  fleet?: AgentFleetResponse | null,
): AgentFleetDelegationRowState[] {
  return (fleet?.active_delegations ?? []).map(agentFleetDelegationRowState);
}

export function agentFleetTaskStatusClass(status: string): string {
  return isAgentFleetTaskCompleted({ status })
    ? "text-green-600"
    : isAgentFleetTaskFailed({ status })
      ? "text-red-500"
      : isAgentFleetTaskCancelled({ status })
        ? "text-on-surface-variant"
        : isAgentFleetTaskActive({ status })
          ? "text-blue-500"
          : "text-yellow-600";
}

export function agentFleetTaskRowState(
  task: AgentFleetTask,
  options?: { nowMs?: number; cancelingId?: string | null },
): AgentFleetTaskRowState {
  const nowMs = options?.nowMs ?? Date.now();
  const durationLabel =
    ((!isAgentFleetTaskActive(task) && !isAgentFleetTaskPending(task)) || !task.started_at)
      ? null
      : formatFleetDuration(Math.max(0, nowMs - new Date(task.started_at).getTime()));
  return {
    id: task.id,
    label: task.intent ?? task.content ?? task.id,
    status: task.status,
    statusClass: agentFleetTaskStatusClass(task.status),
    durationLabel,
    priority: task.priority,
    createdLabel: formatFleetDate(task.created_at),
    canCancel: isAgentFleetTaskCancellable(task) && options?.cancelingId !== task.id,
  };
}

export function agentFleetTaskRowStates(
  fleet?: AgentFleetResponse | null,
  options?: { nowMs?: number; cancelingId?: string | null },
): AgentFleetTaskRowState[] {
  return fleetRecentTasks(fleet).map((task) => agentFleetTaskRowState(task, options));
}
