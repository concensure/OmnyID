// @locs-version: 1.0
import { isRecord } from "./eventDetail";

export type AgentFleetDelegation = {
  id: string;
  scope: string;
  mask: string;
  expires_at: string;
  revoked_at?: string | null;
  task_id?: string | null;
};

export type AgentFleetTask = {
  id: string;
  intent?: string;
  content?: string;
  status: string;
  priority: string;
  created_at: string;
  started_at?: string | null;
  thread_id?: string;
  estimated_end_at?: string | null;
  estimated_progress?: number | null;
  terminal_state?: string | null;
};

export type AgentFleetInstance = {
  id?: string;
  soul_md?: string;
  lora_confidence_score?: number;
  lora_genome_active?: boolean;
  is_master?: boolean;
};

export type AgentFleetResponse = {
  master_instance?: AgentFleetInstance;
  instance?: AgentFleetInstance;
  active_delegations?: AgentFleetDelegation[];
  recent_tasks?: AgentFleetTask[];
  active_count?: number;
  idle_count?: number;
  active_agents?: string[];
  error_count?: number;
  healthy?: boolean;
};

export type AgentFleetStatusSummary = {
  active_count: number;
  idle_count: number;
  active_agents: string[];
  error_count: number;
  healthy: boolean;
};

const ACTIVE_TASK_STATUSES = new Set(["executing", "planning", "running", "in_progress"]);
const IDLE_TASK_STATUSES = new Set(["pending", "queued"]);
const COMPLETED_TASK_STATUSES = new Set(["completed"]);
const FAILED_TASK_STATUSES = new Set(["failed"]);
const CANCELLED_TASK_STATUSES = new Set(["cancelled"]);

function fleetString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function fleetNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fleetStringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

export function normalizeAgentFleetInstance(value: unknown): AgentFleetInstance | undefined {
  if (!isRecord(value)) return undefined;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    soul_md: typeof value.soul_md === "string" ? value.soul_md : undefined,
    lora_confidence_score: fleetNumber(value.lora_confidence_score),
    lora_genome_active: typeof value.lora_genome_active === "boolean" ? value.lora_genome_active : undefined,
    is_master: typeof value.is_master === "boolean" ? value.is_master : undefined,
  };
}

export function normalizeAgentFleetDelegation(value: unknown): AgentFleetDelegation | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    scope: fleetString(value.scope),
    mask: fleetString(value.mask, "private"),
    expires_at: fleetString(value.expires_at),
    revoked_at: typeof value.revoked_at === "string" || value.revoked_at === null ? value.revoked_at : undefined,
    task_id: typeof value.task_id === "string" || value.task_id === null ? value.task_id : undefined,
  };
}

export function normalizeAgentFleetTask(value: unknown): AgentFleetTask | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    intent: typeof value.intent === "string" ? value.intent : undefined,
    content: typeof value.content === "string" ? value.content : undefined,
    status: fleetString(value.status, "pending"),
    priority: fleetString(value.priority, "normal"),
    created_at: fleetString(value.created_at),
    started_at: typeof value.started_at === "string" || value.started_at === null ? value.started_at : undefined,
    thread_id: typeof value.thread_id === "string" ? value.thread_id : undefined,
    estimated_end_at: typeof value.estimated_end_at === "string" || value.estimated_end_at === null
      ? value.estimated_end_at
      : undefined,
    estimated_progress: fleetNumber(value.estimated_progress),
    terminal_state: typeof value.terminal_state === "string" || value.terminal_state === null
      ? value.terminal_state
      : undefined,
  };
}

export function normalizeAgentFleetResponse(payload: unknown): AgentFleetResponse {
  if (!isRecord(payload)) return {};
  return {
    master_instance: normalizeAgentFleetInstance(payload.master_instance),
    instance: normalizeAgentFleetInstance(payload.instance),
    active_delegations: Array.isArray(payload.active_delegations)
      ? payload.active_delegations.flatMap((delegation): AgentFleetDelegation[] => {
          const normalized = normalizeAgentFleetDelegation(delegation);
          return normalized ? [normalized] : [];
        })
      : undefined,
    recent_tasks: Array.isArray(payload.recent_tasks)
      ? payload.recent_tasks.flatMap((task): AgentFleetTask[] => {
          const normalized = normalizeAgentFleetTask(task);
          return normalized ? [normalized] : [];
        })
      : undefined,
    active_count: fleetNumber(payload.active_count),
    idle_count: fleetNumber(payload.idle_count),
    active_agents: fleetStringList(payload.active_agents),
    error_count: fleetNumber(payload.error_count),
    healthy: typeof payload.healthy === "boolean" ? payload.healthy : undefined,
  };
}

export function fleetMasterInstance(fleet?: AgentFleetResponse | null): AgentFleetInstance | null {
  return fleet?.master_instance ?? null;
}

export function fleetMasterInstanceId(fleet?: AgentFleetResponse | null): string | null {
  const instanceId = fleetMasterInstance(fleet)?.id;
  return instanceId === undefined || instanceId === null ? null : String(instanceId);
}

export function fleetRecentTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleet?.recent_tasks ?? [];
}

export function isAgentFleetTaskActive(task: Pick<AgentFleetTask, "status">): boolean {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

export function isAgentFleetTaskPending(task: Pick<AgentFleetTask, "status">): boolean {
  return IDLE_TASK_STATUSES.has(task.status);
}

export function isAgentFleetTaskCompleted(task: Pick<AgentFleetTask, "status">): boolean {
  return COMPLETED_TASK_STATUSES.has(task.status);
}

export function isAgentFleetTaskFailed(task: Pick<AgentFleetTask, "status">): boolean {
  return FAILED_TASK_STATUSES.has(task.status) || task.status === "error";
}

export function isAgentFleetTaskCancelled(task: Pick<AgentFleetTask, "status">): boolean {
  return CANCELLED_TASK_STATUSES.has(task.status);
}

export function isAgentFleetTaskCancellable(task: Pick<AgentFleetTask, "status">): boolean {
  return isAgentFleetTaskActive(task) || isAgentFleetTaskPending(task);
}

export function fleetActiveTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleetRecentTasks(fleet).filter((task) => isAgentFleetTaskActive(task));
}

export function fleetPendingTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleetRecentTasks(fleet).filter((task) => isAgentFleetTaskPending(task));
}

export function fleetActiveOrPendingTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleetRecentTasks(fleet).filter((task) => isAgentFleetTaskCancellable(task));
}

export function fleetCompletedTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleetRecentTasks(fleet).filter((task) => isAgentFleetTaskCompleted(task));
}

export function fleetFailedTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleetRecentTasks(fleet).filter((task) => isAgentFleetTaskFailed(task));
}

export function fleetCancelledTasks(fleet?: AgentFleetResponse | null): AgentFleetTask[] {
  return fleetRecentTasks(fleet).filter((task) => isAgentFleetTaskCancelled(task));
}

export function fleetActiveCount(fleet?: AgentFleetResponse | null): number {
  return fleetStatusSummary(fleet).active_count;
}

export function fleetIdleCount(fleet?: AgentFleetResponse | null): number {
  return fleetStatusSummary(fleet).idle_count;
}

export function fleetStatusSummary(fleet?: AgentFleetResponse | null): AgentFleetStatusSummary {
  const recentTasks = fleetRecentTasks(fleet);
  const activeCount =
    fleet?.active_count
    ?? recentTasks.filter((task) => isAgentFleetTaskActive(task)).length;
  const idleCount =
    fleet?.idle_count
    ?? recentTasks.filter((task) => isAgentFleetTaskPending(task)).length;

  return {
    active_count: activeCount,
    idle_count: idleCount,
    active_agents: fleet?.active_agents ?? [],
    error_count: fleet?.error_count ?? 0,
    healthy: fleet?.healthy !== false,
  };
}
