// @locs-version: 1.0
import { surfaceShortDateLabel } from "./surfaceTimestampPresentation";

export type DashboardFeedActivitySpark = {
  totals: number[];
  max: number;
  labels: string[];
};

export function buildDashboardFeedActivitySpark(
  messages: Array<{ timestamp?: string }>,
  today: Date = new Date(),
): DashboardFeedActivitySpark | null {
  if (messages.length === 0) return null;
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const totals: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const message of messages) {
    if (!message.timestamp) continue;
    const messageDay = new Date(message.timestamp);
    if (Number.isNaN(messageDay.getTime())) continue;
    messageDay.setHours(0, 0, 0, 0);
    const age = Math.floor((dayStart.getTime() - messageDay.getTime()) / 86400000);
    if (age >= 0 && age < 7) totals[6 - age] += 1;
  }
  if (totals.every((count) => count === 0)) return null;
  const max = Math.max(1, ...totals);
  const labels = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(dayStart.getTime() - (6 - index) * 86400000);
    return surfaceShortDateLabel(day.toISOString());
  });
  return { totals, max, labels };
}
