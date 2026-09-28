// @locs-version: 1.0
import { agentTriggerRunCount as triggerRunCountFromState } from "./agentTriggerResponseState";

export type AgentTriggerRunCountSource = {
  recent_runs?: Array<unknown>;
  run_count?: number;
};

export function agentTriggerRunCount(source: AgentTriggerRunCountSource) {
  if (typeof source.run_count === "number" && Number.isFinite(source.run_count)) {
    return source.run_count;
  }
  if (Array.isArray(source.recent_runs)) {
    return source.recent_runs.length;
  }
  return triggerRunCountFromState(source);
}

export function agentTriggerRunCountLabel(count: number) {
  return count === 0 ? "Never run" : `${count} run${count !== 1 ? "s" : ""}`;
}

export function agentTriggerRunCountClass(count: number) {
  if (count === 0) {
    return "border-white/20 bg-white/20 text-on-surface-variant/50";
  }
  if (count > 100) {
    return "border-amber-300/60 bg-amber-50/80 text-amber-800";
  }
  return "border-white/25 bg-white/40 text-on-surface-variant";
}
