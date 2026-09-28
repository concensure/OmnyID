// @locs-version: 1.0
import type {
  DecisionActionTarget,
  DecisionApprovalPlan,
  DecisionDelegatePlan,
  DecisionDismissPlan,
  DecisionSnoozePlan,
} from "./decisionOsDecisionActionPlan";

export type DecisionOsActionExecutionOption = {
  id: string;
  label: string;
  wakeAt: number;
};

export type DecisionOsActionExecutionDecision = DecisionActionTarget;

export type DecisionOsActionExecution =
  | {
      kind: "approve";
      decision: DecisionOsActionExecutionDecision | null;
      approval: DecisionApprovalPlan;
    }
  | {
      kind: "dismiss";
      decision: DecisionOsActionExecutionDecision | null;
      dismiss: DecisionDismissPlan;
    }
  | {
      kind: "snooze";
      decision: DecisionOsActionExecutionDecision | null;
      option: DecisionOsActionExecutionOption | null;
      snoozeLabel: string;
      snooze: DecisionSnoozePlan;
    }
  | {
      kind: "delegate";
      decision: DecisionOsActionExecutionDecision | null;
      delegate: DecisionDelegatePlan;
    };

export declare function decisionOsActionExecution(args: {
  decisions: readonly DecisionOsActionExecutionDecision[];
  decisionId: string;
  action: "approve" | "snooze" | "delegate" | "dismiss";
  snoozeId?: string;
  approvalNote?: string | null;
  snoozeOptions?: readonly DecisionOsActionExecutionOption[];
  now?: Date;
}): DecisionOsActionExecution;
