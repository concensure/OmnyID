// @locs-version: 1.0
type AgentTriggerSummaryLike = {
  trigger_type: string;
  config_json: Record<string, unknown>;
};

export function agentTriggerSummaryText(trigger: AgentTriggerSummaryLike): string {
  const config = trigger.config_json;
  const objective = typeof config.objective === "string" ? config.objective : "";

  if (trigger.trigger_type === "scheduled" && config.cron) {
    return `${objective} | cron: ${config.cron}`;
  }
  if (trigger.trigger_type === "interval" && config.interval_minutes) {
    return `${objective} | every ${config.interval_minutes} min`;
  }
  if (trigger.trigger_type === "webhook" && config.path) {
    return `${objective} | path: ${config.path}`;
  }

  return objective || trigger.trigger_type;
}
