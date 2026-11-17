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

function vendorTiming(): AfpMessage {
  return {
    id: "message-photographer-arrival", thread_id: "vendor:photographer", from: "vendor://photographer",
    timestamp: "2026-11-10T01:00:00Z", type: "message", kind: "vendor_reply", subtype: "wedding_vendor_reply",
    supertags: ["template:wedding_planning"],
    content: {
      kind: "vendor_reply", subject: "Confirmed photography arrival",
      body: "Our photographer will arrive at 2:30 pm and is confirmed for the wedding day.",
      wedding_date: "2027-12-29", vendor_id: "vendor-photographer",
      wedding_plan_id: "wedding_plan:plan-2027", response_workspace_id: "response_workspace:workspace-2027",
    },
    metadata: { weddingPlanId: "wedding_plan:plan-2027", responseWorkspaceId: "response_workspace:workspace-2027" },
    views: [], attachments: [],
  };
}

test("Wedding database projects budget timeline and seating from one ledger without writes", () => {
  const rows = projectWeddingPlanningDatabaseRecords([task(), vendorTiming()]);
  assert.deepEqual([...new Set(rows.map((row) => row.table))], ["budget", "timeline", "guest_list", "seating", "run_sheet"]);
  assert.equal(rows.find((row) => row.id.includes("guest-list:summary"))?.data.rsvp, "0 attending · 0 pending · 0 not attending");
  const venueTask = rows.find((row) => row.id.includes("venue-search"));
  assert.equal(venueTask?.data.task, "Research wedding venue");
  assert.equal(venueTask?.data.stage, "Venue & date");
  assert.equal(venueTask?.data.status, "To do");
  const arrival = rows.find((row) => row.table === "run_sheet" && row.data.category === "photos");
  assert.equal(arrival?.data.status, "confirmed");
  assert.equal(arrival?.data.start_at, "2027-12-29T03:30:00.000Z");
  assert.deepEqual(arrival?.data.source_refs, [{ message_id: "message-photographer-arrival", kind: "vendor_reply" }]);
  assert.ok(rows.every((row) => row.databaseId === "database:wedding-plan:wedding_plan:plan-2027"));
});
