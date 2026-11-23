// @locs-version: 1.0
import type { DecisionOsActionExecution } from "./decisionOsDecisionActionExecutionState";
import type { DecisionActionDiaryEntry } from "./decisionOsDecisionActionPlan";
import type { PendingOutcomeCheck } from "./decisionOsHomeState";

export type DecisionOsActionEffectPlan =
  | {
      kind: "approve";
      toastMessage: string;
      toastOptions: {
        actionLabel: string;
        durationMs: number;
      };
      timeoutDiaryEntry: DecisionActionDiaryEntry;
      timeoutOutcomeCheck: PendingOutcomeCheck | null;
    }
  | {
      kind: "dismiss";
      toastMessage: string;
      toastOptions: null;
    }
  | {
      kind: "snooze";
      toastMessage: string;
      toastOptions: null;
      immediateDiaryEntry: DecisionActionDiaryEntry;
    }
  | {
      kind: "delegate";
      toastMessage: string;
      toastOptions: null;
      actionChip: {
        id: string;
        label: string;
      };
    };

export declare function decisionOsActionEffectPlan(
  execution: DecisionOsActionExecution,
): DecisionOsActionEffectPlan;
