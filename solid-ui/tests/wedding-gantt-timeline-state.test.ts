import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingGanttTimelineState } from "@/lib/weddingGanttTimelineState";

test("buildWeddingGanttTimelineState maps legal vendor pricing and weather timelines into colored rows", () => {
  const state = buildWeddingGanttTimelineState({
    items: [
      { id: "noim", title: "NOIM latest-date check", dueDate: "2027-06-01", category: "legal" },
      { id: "venue", title: "Venue outreach and tour window", startAt: "2026-09-20", endAt: "2026-10-20", category: "venue" },
      { id: "price", title: "Refresh vendor pricing before deposit", dueDate: "2026-11-01", category: "budget" },
      { id: "weather", title: "Confirm weather backup plan", dueDate: "2027-06-20", category: "weather" },
    ],
  });

  assert.equal(state.blockerLabels.length, 0);
  assert.equal(state.rows.length, 4);
  assert.equal(state.rows[0]?.id, "venue");
  assert.ok(state.legend.some((entry) => entry.category === "legal"));
  assert.ok(state.legend.some((entry) => entry.category === "budget"));
  assert.ok(state.rows.every((row) => row.widthPercent >= 4));
});

test("buildWeddingGanttTimelineState allows category color overrides", () => {
  const state = buildWeddingGanttTimelineState({
    categoryColors: { legal: "#111111", vendor: "#222222", reminder: "#333333" },
    items: [
      { id: "legal", title: "Download NOIM", dueDate: "2027-01-01", category: "legal" },
      { id: "vendor", title: "Vendor pricing refresh", dueDate: "2027-01-03", category: "vendor" },
      { id: "reminder", title: "Reminder: Book cake baker", startAt: "2027-01-04", category: "task_reminder" },
    ],
  });

  assert.equal(state.rows.find((row) => row.category === "legal")?.color, "#111111");
  assert.equal(state.rows.find((row) => row.category === "vendor")?.color, "#222222");
  assert.equal(state.rows.find((row) => row.category === "reminder")?.color, "#333333");
});

test("buildWeddingGanttTimelineState gives task reminders a distinct timeline category", () => {
  const state = buildWeddingGanttTimelineState({
    items: [
      { id: "cake-alert", title: "Reminder: Book cake baker", startAt: "2027-05-21T09:00:00.000Z", category: "task_reminder" },
      { id: "text-alert", title: "Alert: confirm limousine pickup", dueDate: "2027-06-01", category: "other" },
    ],
  });

  assert.deepEqual(state.rows.map((row) => row.category), ["reminder", "reminder"]);
  assert.deepEqual(state.rows.map((row) => row.categoryLabel), ["Reminder", "Reminder"]);
  assert.ok(state.legend.some((entry) => entry.category === "reminder" && entry.label === "Reminder"));
});

test("buildWeddingGanttTimelineState blocks empty undated timelines", () => {
  const state = buildWeddingGanttTimelineState({
    items: [{ id: "anytime", title: "Choose vow style" }],
  });

  assert.equal(state.rows.length, 0);
  assert.equal(state.undatedItems.length, 1);
  assert.equal(state.undatedItems[0]?.category, "ceremony");
  assert.ok(state.riskLabels.some((risk) => /anytime\/no-date/i.test(risk.label)));
  assert.ok(state.blockerLabels.some((label) => /No dated wedding timeline/i.test(label)));
});

test("buildWeddingGanttTimelineState flags sequencing risks across preparation categories", () => {
  const state = buildWeddingGanttTimelineState({
    now: "2027-05-10",
    items: [
      { id: "vendor", title: "Photographer outreach", dueDate: "2027-05-15", category: "vendor" },
      { id: "outreach", title: "Venue quote follow-up", dueDate: "2027-05-18", category: "outreach" },
      { id: "venue", title: "Venue selection", dueDate: "2027-06-01", category: "venue" },
      { id: "run-sheet", title: "Draft run sheet", dueDate: "2027-06-10", category: "run_sheet" },
      { id: "guest", title: "Final RSVP count", dueDate: "2027-06-20", category: "guest" },
      { id: "weather", title: "Confirm rain backup", dueDate: "2027-06-25", category: "weather" },
      { id: "legal", title: "NOIM latest-date check", dueDate: "2027-05-25", category: "legal" },
    ],
  });

  assert.ok(state.riskLabels.some((risk) => risk.id === "vendor_before_venue" && risk.severity === "warning"));
  assert.ok(state.riskLabels.some((risk) => risk.id === "near_outreach_window"));
  assert.ok(state.riskLabels.some((risk) => risk.id === "guest_after_run_sheet" && risk.severity === "blocked"));
  assert.ok(state.riskLabels.some((risk) => risk.id === "weather_after_run_sheet"));
  assert.ok(state.riskLabels.some((risk) => risk.id === "legal_deadline_near" && risk.severity === "blocked"));
});
