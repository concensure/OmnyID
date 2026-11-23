import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import { weddingBoundaryLedgerObjectToAfpMessage } from "../src/lib/weddingBoundaryLedgerState.ts";
import { buildWeddingGuestBoundaryDraftObjects } from "../src/lib/weddingGuestBoundaryDraftState.ts";
import {
  projectWeddingPlanningDatabaseRecords,
  weddingPlanningDatabaseTableColumns,
  weddingPlanningDatabaseTableLabel,
} from "../src/lib/weddingPlanningDatabaseProjectionState.ts";

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
  assert.deepEqual([...new Set(rows.map((row) => row.table))], [
    "budget", "timeline", "guest_list", "rsvp", "seating", "run_sheet", "selected_vendors",
  ]);
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
  assert.equal(rows.find((row) => row.id.includes("selected-vendors:summary"))?.data.vendor, "No selected vendors yet");
  assert.equal(weddingPlanningDatabaseTableLabel("selected_vendors"), "Selected vendors");
  assert.equal(weddingPlanningDatabaseTableColumns("rsvp")?.length, 9);
});

test("Wedding database projects canonical RSVP facts and the latest selected vendor", () => {
  const metadata = {
    wedding_plan_id: "wedding_plan:plan-2027",
    response_workspace_id: "response_workspace:workspace-2027",
    source_response_id: "afp:source",
  };
  const boundaryMessages = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Alex Lee",
    householdLabel: "Lee household",
    rsvpStatus: "Attending",
    contactLabel: "alex@example.test",
    mealPreference: "Fish",
    dietaryNote: "Nut allergy",
    accessibilityNote: "Step-free access",
  }, metadata, "2026-11-11T00:00:00Z").map((object) =>
    weddingBoundaryLedgerObjectToAfpMessage(object, metadata, "2026-11-11T00:00:00Z"),
  );
  const decision = (id: string, vendor: string, createdAt: string): AfpMessage => ({
    id,
    thread_id: "wedding_decision:response_workspace:workspace-2027",
    from: "user://couple",
    timestamp: createdAt,
    type: "decision",
    kind: "decision",
    subtype: "wedding_decision_selection",
    supertags: ["template:wedding_planning"],
    content: {
      decision_id: id,
      artifact_id: "artifact:venue-shortlist",
      artifact_title: "Venue shortlist",
      artifact_kind: "vendor_table",
      selected_option: {
        id: vendor.toLowerCase().replace(/\s+/g, "-"),
        label: vendor,
        detail: "Private room and step-free entry",
        cells: [vendor, "A$5,000", "A$1,000", "hello@example.test"],
        column_cells: [
          { key: "price", label: "Quote", kind: "currency", value: "A$5,000" },
          { key: "deposit", label: "Deposit", kind: "currency", value: "A$1,000" },
          { key: "contact", label: "Contact", kind: "text", value: "hello@example.test" },
        ],
      },
      source_labels: ["Couple-approved venue comparison"],
      source_provider_labels: ["Wedding workspace"],
      source: "vendor_search_comparison",
      created_at: createdAt,
      wedding_plan_id: metadata.wedding_plan_id,
      response_workspace_id: metadata.response_workspace_id,
    },
    metadata: metadata,
    views: [],
    attachments: [],
  });
  const rows = projectWeddingPlanningDatabaseRecords([
    task(), ...boundaryMessages,
    decision("decision-old", "Old Venue", "2026-11-11T01:00:00Z"),
    decision("decision-new", "Harbour Room", "2026-11-11T02:00:00Z"),
  ]);
  const rsvp = rows.find((row) => row.table === "rsvp" && row.data.guest === "Alex Lee");
  assert.equal(rsvp?.data.status, "Attending");
  assert.equal(rsvp?.data.meal, "Fish");
  assert.equal(rsvp?.data.dietary, "Nut allergy");
  assert.equal(rsvp?.data.access, "Step-free access");
  const vendors = rows.filter((row) => row.table === "selected_vendors" && !row.id.endsWith(":summary"));
  assert.equal(vendors.length, 1);
  assert.equal(vendors[0]?.data.category, "Venue");
  assert.equal(vendors[0]?.data.vendor, "Harbour Room");
  assert.equal(vendors[0]?.data.quote, "A$5,000");
  assert.equal(vendors[0]?.data.deposit, "A$1,000");
  assert.equal(vendors[0]?.data.contact, "hello@example.test");
});

test("Wedding database does not truncate a 200-person guest list", () => {
  const markdown = [
    "| Name | Household | RSVP |",
    "| --- | --- | --- |",
    ...Array.from({ length: 200 }, (_, index) => `| Guest ${index + 1} | Household ${Math.floor(index / 2) + 1} | Pending |`),
  ].join("\n");
  const guestArtifact: AfpMessage = {
    id: "artifact-guests",
    thread_id: "wedding_context:response_workspace:workspace-2027",
    from: "system://wedding-planning",
    timestamp: "2026-11-11T00:00:00Z",
    type: "artifact",
    kind: "artifact",
    subtype: "wedding_artifact",
    supertags: ["template:wedding_planning"],
    content: {
      artifact_id: "artifact-guests",
      artifact_kind: "guest_list",
      title: "Guest list",
      markdown,
      wedding_plan_id: "wedding_plan:plan-2027",
      response_workspace_id: "response_workspace:workspace-2027",
    },
    metadata: {
      weddingPlanId: "wedding_plan:plan-2027",
      responseWorkspaceId: "response_workspace:workspace-2027",
    },
    views: [],
    attachments: [],
  };
  const rows = projectWeddingPlanningDatabaseRecords([task(), guestArtifact]);
  assert.equal(rows.filter((row) => row.table === "guest_list" && !row.id.endsWith(":summary")).length, 200);
  assert.equal(rows.filter((row) => row.table === "rsvp" && !row.id.endsWith(":summary")).length, 200);
});
