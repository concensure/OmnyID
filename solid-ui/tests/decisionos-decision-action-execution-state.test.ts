import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsActionExecution } from "../src/lib/decisionOsDecisionActionExecutionState.js";

const decisions = [
  { id: "a", title: "Approve Q3 budget", effort: "10 min" },
  { id: "b", title: "Reply to investor", effort: "5 min" },
] as const;

test("decision action execution resolves approval payloads from the visible decision", () => {
  const execution = decisionOsActionExecution({
    decisions,
    decisionId: "a",
    action: "approve",
    approvalNote: "Finance already reviewed this.",
    now: new Date("2026-06-27T10:00:00.000Z"),
  });

  assert.equal(execution.kind, "approve");
  assert.equal(execution.decision?.title, "Approve Q3 budget");
  assert.equal(execution.approval.diaryEntry.note, "Finance already reviewed this.");
});

test("decision action execution resolves snooze options and fallback labels", () => {
  const resolved = decisionOsActionExecution({
    decisions,
    decisionId: "b",
    action: "snooze",
    snoozeId: "tomorrow",
    snoozeOptions: [{ id: "tomorrow", label: "Tomorrow morning", wakeAt: 1 }],
    now: new Date("2026-06-27T10:00:00.000Z"),
  });
  assert.equal(resolved.kind, "snooze");
  assert.equal(resolved.option?.id, "tomorrow");
  assert.equal(resolved.snooze.toastMessage, "Snoozed until Tomorrow morning.");

  const fallback = decisionOsActionExecution({
    decisions,
    decisionId: "b",
    action: "snooze",
    snoozeId: "missing",
    snoozeOptions: [],
    now: new Date("2026-06-27T10:00:00.000Z"),
  });
  assert.equal(fallback.kind, "snooze");
  assert.equal(fallback.option, null);
  assert.equal(fallback.snoozeLabel, "later");
});

test("decision action execution resolves dismiss and delegate payloads", () => {
  const dismiss = decisionOsActionExecution({
    decisions,
    decisionId: "a",
    action: "dismiss",
  });
  assert.equal(dismiss.kind, "dismiss");
  assert.equal(dismiss.dismiss.toastMessage, "Decision dismissed.");

  const delegate = decisionOsActionExecution({
    decisions,
    decisionId: "b",
    action: "delegate",
  });
  assert.equal(delegate.kind, "delegate");
  assert.equal(delegate.delegate.actionChip.label, "Delegate: Reply to investor");
});
