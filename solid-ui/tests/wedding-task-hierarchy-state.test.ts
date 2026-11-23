import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingTaskHierarchyState, isWeddingHierarchyTask } from "@/lib/weddingTaskHierarchyState";

const now = new Date("2026-09-12T00:00:00.000Z");

test("wedding task hierarchy puts anytime tasks before dated preparation stages", () => {
  const state = buildWeddingTaskHierarchyState([
    {
      task_id: "afp-wedding-task:anytime",
      title: "Choose invitation wording",
      status: "pending",
      priority: "normal",
      wedding_task_kind: "decision",
    },
    {
      task_id: "afp-wedding-task:urgent",
      title: "Confirm celebrant documents",
      status: "pending",
      priority: "high",
      due_date: "2026-09-15T00:00:00.000Z",
      due_label: "NOIM check",
      wedding_task_kind: "legal",
    },
    {
      task_id: "afp-wedding-task:later",
      title: "Book menu tasting",
      status: "pending",
      priority: "normal",
      due_date: "2026-12-20T00:00:00.000Z",
      wedding_task_kind: "vendor_follow_up",
    },
  ], now);

  assert.equal(state.hasWeddingTasks, true);
  assert.equal(state.totalCount, 3);
  assert.equal(state.openCount, 3);
  assert.deepEqual(state.stages.map((stage) => stage.id), ["anytime", "urgent", "early"]);
  assert.equal(state.stages[0]?.items[0]?.title, "Choose invitation wording");
  assert.equal(state.stages[0]?.items[0]?.dueText, "Anytime");
  assert.equal(state.stages[1]?.items[0]?.dueText, "NOIM check in 3 days");
});

test("wedding task hierarchy separates completed tasks for reversible tick state", () => {
  const state = buildWeddingTaskHierarchyState([
    {
      task_id: "afp-wedding-task:done",
      title: "Download NOIM",
      status: "done",
      priority: "normal",
      due_label: "Legal setup",
      wedding_task_kind: "legal",
    },
  ], now);

  assert.equal(state.completedCount, 1);
  assert.equal(state.openCount, 0);
  assert.equal(state.stages[0]?.id, "done");
  assert.equal(state.stages[0]?.items[0]?.completed, true);
  assert.match(state.stages[0]?.items[0]?.checkboxLabel ?? "", /not complete/);
});

test("wedding task hierarchy keeps rough wedding-day task labels visible without a separate view", () => {
  const state = buildWeddingTaskHierarchyState([
    {
      task_id: "afp-wedding-task:day-of-delay",
      title: "Prepare day-of vendor delay decision playbook",
      status: "pending",
      priority: "high",
      due_label: "Wedding day / live run sheet",
      wedding_task_kind: "run_sheet",
      second_order_loop: "guest_logistics",
    },
    {
      task_id: "afp-wedding-task:day-of-payment",
      title: "Prepare final payment receipt verification",
      status: "pending",
      priority: "high",
      due_label: "Before final payment / wedding day",
      wedding_task_kind: "budget_review",
      second_order_loop: "commitment_timing",
    },
  ], now);

  assert.equal(state.stages[0]?.id, "anytime");
  assert.deepEqual(state.stages[0]?.items.map((item) => item.dueText), [
    "Wedding day / live run sheet",
    "Before final payment / wedding day",
  ]);
  assert.deepEqual(state.stages[0]?.items.map((item) => item.loopLabel), [
    "Guest logistics loop",
    "Legal/deposit loop",
  ]);
  assert.match(state.stages[0]?.items[0]?.checkboxLabel ?? "", /complete/);
});

test("wedding task hierarchy exposes second-order loop context", () => {
  const state = buildWeddingTaskHierarchyState([
    {
      task_id: "afp-wedding-task:second-order-weather",
      title: "Confirm wet-weather backup",
      status: "pending",
      priority: "high",
      due_label: "Before deposit",
      wedding_task_kind: "vendor_follow_up",
      second_order_loop: "weather_backup",
      second_order_evidence_labels: ["weather-exposed plan", "selected scope: venue: Harbour Hall", "no backup task", "extra"],
    },
  ], now);

  const item = state.stages[0]?.items[0];
  assert.equal(item?.loopLabel, "Weather backup loop");
  assert.deepEqual(item?.evidenceLabels, ["weather-exposed plan", "selected scope: venue: Harbour Hall", "no backup task"]);
});

test("wedding task hierarchy exposes preparation checklist alert context", () => {
  const state = buildWeddingTaskHierarchyState([
    {
      task_id: "afp-wedding-task:cake",
      title: "Book cake baker",
      status: "pending",
      priority: "normal",
      due_date: "2027-04-12T00:00:00.000Z",
      due_label: "6 months before wedding",
      wedding_task_kind: "cake",
      preparation_checklist: true,
      preparation_checklist_item: "cake",
      alert_offset_days: [60, 30, 14],
      alert_dates: ["2027-02-11", "2027-03-13", "2027-03-29"],
      schedule_basis: "wedding_date",
    },
  ], now);

  const item = state.stages[0]?.items[0];
  assert.deepEqual(item?.preparationLabels, [
    "Preparation: Cake",
    "Alerts: 60d, 30d, 14d",
    "Reminder dates: 2027-02-11, 2027-03-13, 2027-03-29",
    "Scheduled from wedding date",
  ]);
});

test("wedding task hierarchy ignores ordinary tasks", () => {
  assert.equal(isWeddingHierarchyTask({
    task_id: "task:ordinary",
    title: "Pay bill",
    status: "pending",
  }), false);

  const state = buildWeddingTaskHierarchyState([
    { task_id: "task:ordinary", title: "Pay bill", status: "pending" },
  ], now);

  assert.equal(state.hasWeddingTasks, false);
  assert.deepEqual(state.stages, []);
});
