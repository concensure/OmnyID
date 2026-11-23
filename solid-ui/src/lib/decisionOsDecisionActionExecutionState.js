import {
  decisionApprovalPlan,
  decisionDelegatePlan,
  decisionDismissPlan,
  decisionSnoozePlan,
} from "./decisionOsDecisionActionPlan.ts";
import { decisionOsActionTarget } from "./decisionOsDecisionActionState.ts";

export function decisionOsActionExecution(args) {
  const decision = decisionOsActionTarget(args.decisions, args.decisionId);

  if (args.action === "approve") {
    return {
      kind: "approve",
      decision,
      approval: decisionApprovalPlan({
        decision,
        decisionId: args.decisionId,
        approvalNote: args.approvalNote,
        now: args.now,
      }),
    };
  }

  if (args.action === "dismiss") {
    return {
      kind: "dismiss",
      decision,
      dismiss: decisionDismissPlan({
        decision,
        decisionId: args.decisionId,
      }),
    };
  }

  if (args.action === "snooze") {
    const option =
      args.snoozeOptions?.find((candidate) => candidate.id === args.snoozeId) ??
      null;
    const snoozeLabel = option?.label ?? "later";
    return {
      kind: "snooze",
      decision,
      option,
      snoozeLabel,
      snooze: decisionSnoozePlan({
        decision,
        decisionId: args.decisionId,
        snoozeLabel,
        now: args.now,
      }),
    };
  }

  return {
    kind: "delegate",
    decision,
    delegate: decisionDelegatePlan({
      decision,
      decisionId: args.decisionId,
    }),
  };
}
