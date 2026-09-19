import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorContactProjectionRequests } from "../src/lib/weddingVendorContactProjectionState.ts";

test("weddingVendorContactProjectionRequests records saved vendor outreach task contacts", () => {
  const requests = weddingVendorContactProjectionRequests({
    nowIso: "2026-09-14T00:00:00.000Z",
    receipt: {
      title: "Wedding outputs save result",
      summaryLabel: "1 saved",
      savedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      savedItems: [{
        itemId: "task:wedding-task:outreach-escalation:wedding:photo-team",
        sourceId: "wedding-task:outreach-escalation:wedding:photo-team",
        kind: "task",
        title: "Review one follow-up to Photo Team",
        status: "saved",
        messageId: "afp:task-photo-team",
        error: null,
      }],
      failedItems: [],
      skippedItems: [],
      items: [],
      retryItemIds: [],
      canRetry: false,
    },
    sendInputs: [{
      thread_id: "wedding_task:wedding-task:outreach-escalation:wedding:photo-team",
      from: "system://wedding-planning",
      to: ["agent://tasks"],
      timestamp: "2026-09-14T00:00:00.000Z",
      type: "task",
      kind: "task",
      subtype: "wedding_task",
      content: {
        title: "Review one follow-up to Photo Team",
      },
      metadata: {
        wedding_task_item_id: "wedding-task:outreach-escalation:wedding:photo-team",
        outreach_escalation_stage: "follow_up_due",
        vendor_id: "vendor:photo-team",
        vendor_contact_method: "agent_email_draft",
        vendor_contact_receipt_ref: "email:photo-team-1",
        vendor_contact_thread_id: "thread:photo-team",
      },
      store_in_relational: true,
    }],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.vendorId, "vendor:photo-team");
  assert.equal(requests[0]?.body.contact_method, "agent_email_draft");
  assert.equal(requests[0]?.body.follow_up_due_at, "2026-09-16T00:00:00.000Z");
  assert.equal(requests[0]?.body.thread_id, "thread:photo-team");
  assert.equal(requests[0]?.body.receipt_ref, "email:photo-team-1");
});

test("weddingVendorContactProjectionRequests ignores failed or non-outreach task projections", () => {
  const requests = weddingVendorContactProjectionRequests({
    nowIso: "2026-09-14T00:00:00.000Z",
    receipt: {
      title: "Some wedding outputs were not saved",
      summaryLabel: "1 failed",
      savedCount: 0,
      failedCount: 1,
      skippedCount: 0,
      savedItems: [],
      failedItems: [{
        itemId: "task:failed",
        sourceId: "task:failed",
        kind: "task",
        title: "Review one follow-up to Photo Team",
        status: "failed",
        messageId: null,
        error: "No durable receipt.",
      }],
      skippedItems: [],
      items: [],
      retryItemIds: ["task:failed"],
      canRetry: true,
    },
    sendInputs: [{
      thread_id: "wedding_task:failed",
      from: "system://wedding-planning",
      to: ["agent://tasks"],
      timestamp: "2026-09-14T00:00:00.000Z",
      type: "task",
      kind: "task",
      subtype: "wedding_task",
      content: { title: "Review one follow-up to Photo Team" },
      metadata: {
        wedding_task_item_id: "task:failed",
        outreach_escalation_stage: "follow_up_due",
        vendor_id: "vendor:photo-team",
      },
      store_in_relational: true,
    }],
  });

  assert.deepEqual(requests, []);
});

test("weddingVendorContactProjectionRequests falls back to saved AFP task id as contact receipt", () => {
  const requests = weddingVendorContactProjectionRequests({
    nowIso: "2026-09-14T00:00:00.000Z",
    receipt: {
      title: "Wedding outputs save result",
      summaryLabel: "1 saved",
      savedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      savedItems: [{
        itemId: "task:wedding-task:outreach-escalation:wedding:venue",
        sourceId: "wedding-task:outreach-escalation:wedding:venue",
        kind: "task",
        title: "Review initial outreach to Harbour Hall",
        status: "saved",
        messageId: "afp:task-harbour-hall",
        error: null,
      }],
      failedItems: [],
      skippedItems: [],
      items: [],
      retryItemIds: [],
      canRetry: false,
    },
    sendInputs: [{
      thread_id: "wedding_task:wedding-task:outreach-escalation:wedding:venue",
      from: "system://wedding-planning",
      to: ["agent://tasks"],
      timestamp: "2026-09-14T00:00:00.000Z",
      type: "task",
      kind: "task",
      subtype: "wedding_task",
      content: { title: "Review initial outreach to Harbour Hall" },
      metadata: {
        wedding_task_item_id: "wedding-task:outreach-escalation:wedding:venue",
        outreach_escalation_stage: "initial_outreach",
        vendor_id: "vendor:harbour-hall",
        vendor_contact_method: "master_agent",
      },
      store_in_relational: true,
    }],
  });

  assert.equal(requests[0]?.body.follow_up_due_at, "2026-09-19T00:00:00.000Z");
  assert.equal(requests[0]?.body.receipt_ref, "afp:task-harbour-hall");
  assert.equal(requests[0]?.body.thread_id, "wedding_task:wedding-task:outreach-escalation:wedding:venue");
});
