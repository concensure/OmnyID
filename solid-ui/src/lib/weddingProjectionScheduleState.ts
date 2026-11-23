// @locs-version: 2.0
import {
  buildWeddingTaskAlertReminderScheduleItems,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";

export type WeddingProjectionScheduleState = {
  scheduleItems: WeddingPlanningScheduleItem[];
  taskAlertReminderScheduleItems: WeddingPlanningScheduleItem[];
  totalCount: number;
  reminderCount: number;
};

export function buildWeddingProjectionScheduleState(input: {
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
}): WeddingProjectionScheduleState {
  const scheduleItems = [...(input.scheduleItems ?? [])];
  const taskAlertReminderScheduleItems = buildWeddingTaskAlertReminderScheduleItems({
    taskItems: input.taskItems,
    existingScheduleItems: scheduleItems,
  });
  const projectedScheduleItems = [
    ...scheduleItems,
    ...taskAlertReminderScheduleItems,
  ];

  return {
    scheduleItems: projectedScheduleItems,
    taskAlertReminderScheduleItems,
    totalCount: projectedScheduleItems.length,
    reminderCount: taskAlertReminderScheduleItems.length,
  };
}
