// @locs-version: 1.0
import type { AgentTriggerKind } from "./agentTriggerKindPresentation";

export type AgentTriggerObjectiveSuggestion = {
  kind?: AgentTriggerKind;
  cron?: string;
  intervalMinutes?: string;
};

export function inferAgentTriggerObjectiveSuggestion(text: string): AgentTriggerObjectiveSuggestion {
  const lowered = text.toLowerCase();
  const suggestion: AgentTriggerObjectiveSuggestion = {};

  if (/\b8\s*(am|o'clock)/.test(lowered) || /\bmorning\b/.test(lowered)) {
    suggestion.cron = "0 8 * * 1-5";
  } else if (/\b9\s*(am)/.test(lowered)) {
    suggestion.cron = "0 9 * * 1-5";
  } else if (/\b6\s*(pm)/.test(lowered) || /\bevening\b/.test(lowered)) {
    suggestion.cron = "0 18 * * 1-5";
  } else if (/\b(noon|midday|12\s*pm)/.test(lowered)) {
    suggestion.cron = "0 12 * * 1-5";
  }

  if (/\bweekly\b|\bevery\s+monday\b/.test(lowered)) {
    suggestion.cron = "0 9 * * 1";
  } else if (/\bdaily\b|\bevery\s+day\b/.test(lowered)) {
    suggestion.cron = "0 8 * * *";
  } else if (/\bhourly\b/.test(lowered)) {
    suggestion.kind = "interval";
    suggestion.intervalMinutes = "60";
  }

  if (/\bwebhook\b|\bhttp\b|\bon\s+request\b/.test(lowered)) {
    suggestion.kind = "webhook";
  } else if (/\bon\s+(message|email|inbox)\b/.test(lowered)) {
    suggestion.kind = "message";
  }

  return suggestion;
}
