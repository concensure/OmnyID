import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionApprovalPlan,
  decisionBulkDismissPlan,
  decisionDelegatePlan,
  decisionDismissPlan,
  decisionSnoozePlan,
} from "../src/lib/decisionOsDecisionActionPlan.ts";

test("decision approval plan produces a note-aware toast and diary entry", () => {
  const now = new Date("2026-06-27T10:00:00.000Z");
  const plan = decisionApprovalPlan({
    decision: {
      id: "decision-1",
      title: "Approve Q3 budget",
      effort: "10 min",
    },
    decisionId: "decision-1",
    approvalNote: "Finance already reviewed this.",
    now,
  });

  assert.equal(plan.toastMessage, "Decision approved. Note saved with the record.");
  assert.equal(plan.diaryEntry.title, "Approve Q3 budget");
  assert.equal(plan.diaryEntry.note, "Finance already reviewed this.");
  assert.equal(plan.diaryEntry.outcomeCheckAt, "2026-06-30T10:00:00.000Z");
  assert.deepEqual(plan.outcomeCheck, {
    id: "decision-1",
    title: "Approve Q3 budget",
    checkAt: "2026-06-30T10:00:00.000Z",
  });
});

test("decision approval plan falls back cleanly when the decision is missing", () => {
  const now = new Date("2026-06-27T10:00:00.000Z");
  const plan = decisionApprovalPlan({
    decision: null,
    decisionId: "decision-unknown",
    now,
  });

  assert.equal(plan.toastMessage, "Decision approved.");
  assert.equal(plan.diaryEntry.title, "decision-unknown");
  assert.equal(plan.diaryEntry.outcomeCheckAt, undefined);
  assert.equal(plan.outcomeCheck, null);
});

test("decision snooze plan produces consistent toast and diary metadata", () => {
  const now = new Date("2026-06-27T10:00:00.000Z");
  const plan = decisionSnoozePlan({
    decision: {
      id: "decision-2",
      title: "Reply to investor",
    },
    decisionId: "decision-2",
    snoozeLabel: "Tomorrow morning",
    now,
  });

  assert.equal(plan.toastMessage, "Snoozed until Tomorrow morning.");
  assert.equal(plan.diaryEntry.title, "Reply to investor");
  assert.equal(plan.diaryEntry.meta, "snoozed until Tomorrow morning");
});

test("decision delegate plan produces action-chip payload and toast text", () => {
  const plan = decisionDelegatePlan({
    decision: {
      id: "decision-3",
      title: "Draft customer response",
    },
    decisionId: "decision-3",
  });

  assert.equal(plan.toastMessage, "Delegated to your agent.");
  assert.deepEqual(plan.actionChip, {
    id: "delegate-decision-3",
    label: "Delegate: Draft customer response",
  });
});

test("decision dismiss plan produces consistent toast text", () => {
  const plan = decisionDismissPlan({
    decision: {
      id: "decision-4",
      title: "Close the loop",
    },
    decisionId: "decision-4",
  });

  assert.equal(plan.toastMessage, "Decision dismissed.");
});

test("decision bulk dismiss plan pluralizes low-impact dismissal text", () => {
  assert.equal(
    decisionBulkDismissPlan({ dismissedCount: 1 }).toastMessage,
    "1 low-impact decision dismissed.",
  );
  assert.equal(
    decisionBulkDismissPlan({ dismissedCount: 3 }).toastMessage,
    "3 low-impact decisions dismissed.",
  );
});
