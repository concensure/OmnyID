import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProjectionScheduleState } from "@/lib/weddingProjectionScheduleState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";

const metadata = {
  weddingPlanId: "wedding_plan:schedule",
  responseWorkspaceId: "response_workspace:schedule",
  sourceResponseId: "response:schedule",
};

const ceremony: WeddingPlanningScheduleItem = {
  id: "ceremony",
  title: "Ceremony",
  kind: "ceremony",
  startAt: "2027-07-20T12:00:00.000Z",
  metadata,
};

const cakeTask: WeddingPlanningTaskItem = {
  id: "prep-cake",
  title: "Book cake baker",
  kind: "cake",
  dueAt: "2027-07-20T10:00:00.000Z",
  dueLabel: "6-9 months out",
  priority: "high",
  metadata: {
    ...metadata,
    preparation_checklist: true,
    preparation_checklist_item: "cake",
    alert_offset_days: [60, 30],
    alert_dates: ["2027-05-21", "2027-06-20"],
  },
};

test("buildWeddingProjectionScheduleState appends task alert reminders to schedule items", () => {
  const state = buildWeddingProjectionScheduleState({
    scheduleItems: [ceremony],
    taskItems: [cakeTask],
  });

  assert.equal(state.totalCount, 3);
  assert.equal(state.reminderCount, 2);
  assert.deepEqual(state.scheduleItems.map((item) => item.kind), ["ceremony", "task_reminder", "task_reminder"]);
  assert.deepEqual(state.taskAlertReminderScheduleItems.map((item) => item.startAt), [
    "2027-05-21T09:00:00.000Z",
    "2027-06-20T09:00:00.000Z",
  ]);
});

test("buildWeddingProjectionScheduleState does not duplicate existing task reminders", () => {
  const state = buildWeddingProjectionScheduleState({
    scheduleItems: [
      ceremony,
      {
        id: "existing-cake-reminder",
        title: "Reminder: Book cake baker",
        kind: "task_reminder",
        startAt: "2027-05-21T09:00:00.000Z",
        metadata: {
          ...metadata,
          alert_reminder_for_task_id: "prep-cake",
          alert_date: "2027-05-21",
        },
      },
    ],
    taskItems: [cakeTask],
  });

  assert.equal(state.totalCount, 3);
  assert.equal(state.reminderCount, 1);
  assert.deepEqual(state.taskAlertReminderScheduleItems.map((item) => item.startAt), ["2027-06-20T09:00:00.000Z"]);
});
