// @locs-version: 1.0
import { getFleetStatusSummary } from "@/lib/api";
import { type AgentFleetStatusSummary } from "@/lib/agentFleetResponseState";
import {
  buildAgentPulseFailureReceipt,
  type AgentPulseFailureReceipt,
} from "@/lib/agentPulseFailureState";

export type AgentPulseLoadState = {
  summary: AgentFleetStatusSummary;
  error: AgentPulseFailureReceipt | null;
  hasLoaded: boolean;
};

export function createDefaultAgentPulseSummary(): AgentFleetStatusSummary {
  return {
    active_count: 0,
    idle_count: 0,
    active_agents: [],
    error_count: 0,
    healthy: true,
  };
}

function readPulseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load agent pulse.";
}

export async function loadAgentPulseState(
  previousSummary: AgentFleetStatusSummary,
  previousHasLoaded: boolean,
  deps: {
    loadSummary?: typeof getFleetStatusSummary;
  } = {},
): Promise<AgentPulseLoadState> {
  const loadSummary = deps.loadSummary ?? getFleetStatusSummary;
  try {
    return {
      summary: await loadSummary(),
      error: null,
      hasLoaded: true,
    };
  } catch (error) {
    return {
      summary: previousSummary,
      error: buildAgentPulseFailureReceipt(readPulseErrorMessage(error)),
      hasLoaded: previousHasLoaded,
    };
  }
}
