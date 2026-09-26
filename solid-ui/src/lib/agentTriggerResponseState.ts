// @locs-version: 1.0
import { isRecord } from "./eventDetail";

export type AgentTriggerRecentRun = {
  status: string;
  ran_at?: string;
  created_at?: string;
};

export type AgentTriggerRecord = {
  id: string;
  trigger_type: string;
  config_json: Record<string, unknown>;
  enabled: boolean;
  created_at?: string;
  recent_runs?: AgentTriggerRecentRun[];
  next_run_at?: string | null;
  cron_expression?: string | null;
};

export type AgentTriggerRuntimeField = "last_run_at" | "next_run_at";

export type AgentTriggerGroup<T> = {
  kind: string;
  items: T[];
};

function optionalTriggerString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

export function normalizeAgentTriggerRecentRun(value: unknown): AgentTriggerRecentRun | null {
  if (!isRecord(value) || typeof value.status !== "string") return null;
  return {
    status: value.status,
    ran_at: typeof value.ran_at === "string" ? value.ran_at : undefined,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
  };
}

export function normalizeAgentTriggerRecord(value: unknown): AgentTriggerRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.trigger_type !== "string") {
    return null;
  }
  return {
    id: value.id,
    trigger_type: value.trigger_type,
    config_json: isRecord(value.config_json) ? value.config_json : {},
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    recent_runs: Array.isArray(value.recent_runs)
      ? value.recent_runs.flatMap((run): AgentTriggerRecentRun[] => {
          const normalized = normalizeAgentTriggerRecentRun(run);
          return normalized ? [normalized] : [];
        })
      : undefined,
    next_run_at: optionalTriggerString(value.next_run_at),
    cron_expression: optionalTriggerString(value.cron_expression),
  };
}

export function normalizeAgentTriggersResponse(payload: unknown): { triggers: AgentTriggerRecord[] } {
  if (!isRecord(payload) || !Array.isArray(payload.triggers)) return { triggers: [] };
  return {
    triggers: payload.triggers.flatMap((trigger): AgentTriggerRecord[] => {
      const normalized = normalizeAgentTriggerRecord(trigger);
      return normalized ? [normalized] : [];
    }),
  };
}

export function agentTriggerRecentRuns(
  trigger: { recent_runs?: Array<AgentTriggerRecentRun | unknown> },
): AgentTriggerRecentRun[] {
  return Array.isArray(trigger.recent_runs)
    ? trigger.recent_runs.flatMap((run): AgentTriggerRecentRun[] => {
        const normalized = normalizeAgentTriggerRecentRun(run);
        return normalized ? [normalized] : [];
      })
    : [];
}

export function agentTriggerRunCount(trigger: { recent_runs?: Array<AgentTriggerRecentRun | unknown> }): number {
  return agentTriggerRecentRuns(trigger).length;
}

export function agentTriggerHasRecentRuns(trigger: { recent_runs?: Array<AgentTriggerRecentRun | unknown> }): boolean {
  return agentTriggerRunCount(trigger) > 0;
}

export function agentTriggerIsEnabled(trigger: AgentTriggerRecord): boolean {
  return trigger.enabled !== false;
}

export function agentTriggerCronExpression(trigger: AgentTriggerRecord): string | null {
  return typeof trigger.cron_expression === "string" ? trigger.cron_expression : null;
}

export function agentTriggerLastRunAt(trigger: AgentTriggerRecord): string | null {
  return agentTriggerRuntimeTimestamp(trigger, "last_run_at");
}

export function agentTriggerNextRunAt(trigger: AgentTriggerRecord): string | null {
  return agentTriggerRuntimeTimestamp(trigger, "next_run_at");
}

export function groupAgentTriggerRecordsByKind<T extends { trigger_type: string }>(
  triggers: T[],
): AgentTriggerGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const trigger of triggers) {
    const kind = trigger.trigger_type;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(trigger);
  }
  return [...groups.entries()].map(([kind, items]) => ({ kind, items }));
}

export function agentTriggerRuntimeTimestamp(
  trigger: AgentTriggerRecord,
  field: AgentTriggerRuntimeField,
): string | null {
  const directValue = field === "next_run_at" ? trigger.next_run_at : undefined;
  if (typeof directValue === "string" || directValue === null) {
    return directValue;
  }

  const value = trigger.config_json[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
