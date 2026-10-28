import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { addWeddingResearchTasks, weddingJourneyGroups, weddingJourneyStageId, WEDDING_JOURNEY_STAGES } from "@/lib/weddingJourneyStageState";
import { weddingCustomTaskToAfpMessage } from "@/lib/weddingCustomTaskState";
import { weddingTaskVisualStatus } from "@/lib/weddingTaskVisualStatusState";

const task = (id: string, title: string, dueAt?: string): WeddingPlanningTaskItem => ({ id, title, dueAt, kind: "other" });

test("journey uses the six research-backed labels and classifies existing tasks", () => {
  assert.deepEqual(WEDDING_JOURNEY_STAGES.map((stage) => stage.label), [
    "Plan & budget", "Venue & date", "Celebrant & suppliers", "Details & invites", "Final prep", "Wedding & after",
  ]);
  assert.equal(weddingJourneyStageId(task("venue", "Choose wedding venue")), "venue_date");
  assert.equal(weddingJourneyStageId(task("rsvp", "Send invitations and collect RSVPs")), "details_invites");
  assert.equal(weddingJourneyStageId(task("thanks", "Send thank-you messages after wedding")), "wedding_after");
});

test("research tasks are de-duplicated and ordered chronologically within categories", () => {
  const tasks = addWeddingResearchTasks([task("existing", "Send save-the-dates", "2027-03-01T09:00:00.000Z"), task("prebuilt-seating", "Complete seating plan", "2027-11-19T09:00:00.000Z")], "2027-11-20");
  assert.equal(tasks.filter((item) => /save-the-dates/i.test(item.title)).length, 1);
  assert.ok(tasks.some((item) => item.title === "Hold ceremony rehearsal" && item.dueAt?.startsWith("2027-11-13")));
  assert.ok(tasks.some((item) => item.id === "prebuilt-seating" && item.dueAt?.startsWith("2027-10-23")));
  assert.ok(tasks.some((item) => item.id === "wedding-research:run-sheet-initial-vendor-draft" && item.dueAt?.startsWith("2027-10-09")));
  assert.ok(tasks.some((item) => item.id === "wedding-research:run-sheet-finalise-logistics" && item.dueAt?.startsWith("2027-10-30")));
  assert.ok(tasks.some((item) => item.id === "wedding-research:run-sheet-master-signoff" && item.dueAt?.startsWith("2027-11-10")));
  assert.ok(tasks.some((item) => item.id === "wedding-research:run-sheet-vip-version" && item.dueAt?.startsWith("2027-11-15")));
  assert.ok(tasks.some((item) => item.id === "wedding-research:run-sheet-day-of-copies" && item.dueAt?.startsWith("2027-11-20")));
  const final = weddingJourneyGroups(tasks, "final_prep").flatMap((group) => group.tasks);
  assert.ok(final.length > 0);
  assert.ok(Date.parse(final[0]!.dueAt ?? "") <= Date.parse(final.at(-1)!.dueAt ?? ""));
});

test("custom tasks persist stage and deadline through AFP", () => {
  const message = weddingCustomTaskToAfpMessage({ title: "Book the MC", stage: "details_invites", dueDate: "2027-08-01", assignee: "Sam", weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", nowIso: "2026-10-25T00:00:00.000Z" });
  assert.equal(message?.subtype, "wedding_task");
  assert.equal((message?.content as Record<string, unknown>).wedding_journey_stage, "details_invites");
  assert.equal((message?.content as Record<string, unknown>).due_at, "2027-08-01T09:00:00.000Z");
  assert.equal((message?.content as Record<string, unknown>).assignee, "Sam");
});

test("task visual status never relies on colour alone", () => {
  assert.equal(weddingTaskVisualStatus(task("pending", "Confirm transport")).label, "Pending");
  assert.equal(weddingTaskVisualStatus({ ...task("active", "Confirm transport"), metadata: { status: "in_progress" } }).label, "In progress");
  assert.equal(weddingTaskVisualStatus(task("done", "Confirm transport"), true).label, "Completed");
});
