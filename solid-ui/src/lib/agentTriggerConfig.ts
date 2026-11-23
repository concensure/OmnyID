// @locs-version: 1.0
import type { AgentTriggerKind } from "./agentTriggerKindPresentation";

export function buildAgentTriggerConfig(args: {
  kind: AgentTriggerKind;
  objective: string;
  cron: string;
  intervalMinutes: string;
  webhookPath: string;
}): Record<string, unknown> {
  const objective = args.objective.trim();
  let config: Record<string, unknown> = { objective };

  if (args.kind === "scheduled") {
    config = { ...config, cron: args.cron };
  }
  if (args.kind === "interval") {
    config = {
      ...config,
      interval_minutes: parseInt(args.intervalMinutes, 10) || 60,
    };
  }
  if (args.kind === "webhook") {
    config = {
      ...config,
      path: args.webhookPath || "/hook/agent",
    };
  }

  return config;
}
