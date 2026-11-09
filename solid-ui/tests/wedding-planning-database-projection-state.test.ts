import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import { projectWeddingPlanningDatabaseRecords } from "../src/lib/weddingPlanningDatabaseProjectionState.ts";

function task(): AfpMessage {
  return {
    id: "task-venue", thread_id: "wedding-task:venue", from: "system://wedding-planning",
    timestamp: "2026-11-10T00:00:00Z", type: "task", kind: "task", subtype: "wedding_task",
    supertags: ["template:wedding_planning"],
    content: {
      kind: "task", title: "Research wedding venue", wedding_task_item_id: "venue-search",
      wedding_task_kind: "research", due_at: "2027-01-10", priority: "high",
      wedding_plan_id: "wedding_plan:plan-2027", response_workspace_id: "response_workspace:workspace-2027",
    },
    metadata: { weddingPlanId: "wedding_plan:plan-2027", responseWorkspaceId: "response_workspace:workspace-2027", wedding_journey_stage: "venue_date" },
    views: [], attachments: [],
  };
}

test("Wedding database projects budget timeline and seating from one ledger without writes", () => {
  const rows = projectWeddingPlanningDatabaseRecords([task()]);
  assert.deepEqual([...new Set(rows.map((row) => row.table))], ["budget", "timeline", "seating"]);
  const venueTask = rows.find((row) => row.id.includes("venue-search"));
  assert.equal(venueTask?.data.task, "Research wedding venue");
  assert.equal(venueTask?.data.stage, "Venue & date");
  assert.equal(venueTask?.data.status, "To do");
  assert.ok(rows.every((row) => row.databaseId === "database:wedding-plan:wedding_plan:plan-2027"));
});
