// @locs-version: 1.0
import {
  groupAgentTriggerRecordsByKind,
  type AgentTriggerGroup,
} from "./agentTriggerResponseState";

type AgentTriggerGroupable = {
  trigger_type: string;
};

export type { AgentTriggerGroup };

export function groupAgentTriggersByKind<T extends AgentTriggerGroupable>(
  triggers: T[],
): AgentTriggerGroup<T>[] {
  return groupAgentTriggerRecordsByKind(triggers);
}
