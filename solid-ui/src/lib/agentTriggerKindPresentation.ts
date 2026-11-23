// @locs-version: 1.0
export const AGENT_TRIGGER_KINDS = [
  "scheduled",
  "interval",
  "webhook",
  "message",
  "one_time",
] as const;

export type AgentTriggerKind = (typeof AGENT_TRIGGER_KINDS)[number];

const AGENT_TRIGGER_KIND_LABELS: Record<AgentTriggerKind, string> = {
  scheduled: "Scheduled (cron)",
  interval: "Interval",
  webhook: "Webhook",
  message: "On message",
  one_time: "One-time",
};

const AGENT_TRIGGER_KIND_ICONS: Record<AgentTriggerKind, string> = {
  scheduled: "SC",
  interval: "IV",
  webhook: "WH",
  message: "MSG",
  one_time: "ONE",
};

export function agentTriggerKindLabel(kind: string): string {
  return kind in AGENT_TRIGGER_KIND_LABELS
    ? AGENT_TRIGGER_KIND_LABELS[kind as AgentTriggerKind]
    : kind;
}

export function agentTriggerKindIcon(kind: string): string {
  return kind in AGENT_TRIGGER_KIND_ICONS
    ? AGENT_TRIGGER_KIND_ICONS[kind as AgentTriggerKind]
    : "TR";
}
