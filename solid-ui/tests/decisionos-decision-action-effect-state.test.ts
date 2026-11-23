import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsActionExecution } from "../src/lib/decisionOsDecisionActionExecutionState.js";
import { decisionOsActionEffectPlan } from "../src/lib/decisionOsDecisionActionEffectState.js";

const decisions = [
  { id: "a", title: "Approve Q3 budget", effort: "10 min" },
  { id: "b", title: "Reply to investor", effort: "5 min" },
] as const;

test("decision action effect state derives approval toast timing and timeout payloads", () => {
  const execution = decisionOsActionExecution({
    decisions,
    decisionId: "a",
    action: "approve",
    approvalNote: "Finance already reviewed this.",
    now: new Date("2026-06-27T10:00:00.000Z"),
  });
  const plan = decisionOsActionEffectPlan(execution);
  assert.equal(plan.kind, "approve");
  assert.equal(plan.toastOptions?.actionLabel, "Undo •");
  assert.equal(plan.toastOptions?.durationMs, 3000);
  assert.equal(plan.timeoutDiaryEntry.note, "Finance already reviewed this.");
  assert.equal(plan.timeoutOutcomeCheck?.id, "a");
});

test("decision action effect state derives immediate diary or action-chip effects", () => {
  const snoozeExecution = decisionOsActionExecution({
    decisions,
    decisionId: "b",
    action: "snooze",
    snoozeOptions: [{ id: "tomorrow", label: "Tomorrow morning", wakeAt: 1 }],
    snoozeId: "tomorrow",
    now: new Date("2026-06-27T10:00:00.000Z"),
  });
  const snoozePlan = decisionOsActionEffectPlan(snoozeExecution);
  assert.equal(snoozePlan.kind, "snooze");
  assert.equal(snoozePlan.immediateDiaryEntry.meta, "snoozed until Tomorrow morning");

  const delegateExecution = decisionOsActionExecution({
    decisions,
    decisionId: "b",
    action: "delegate",
  });
  const delegatePlan = decisionOsActionEffectPlan(delegateExecution);
  assert.equal(delegatePlan.kind, "delegate");
  assert.equal(delegatePlan.actionChip.label, "Delegate: Reply to investor");
});
