import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingVendorContactProjectionRequests,
  weddingVendorReplyInputsFromAfpMessages,
  weddingVendorReplyProjectionRequests,
} from "../src/lib/weddingVendorContactProjectionState.ts";

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

test("weddingVendorReplyProjectionRequests records direct vendor replies and clears follow-up due date", () => {
  const requests = weddingVendorReplyProjectionRequests({
    nowIso: "2026-09-20T00:00:00.000Z",
    replies: [{
      vendorId: "vendor:harbour-hall",
      threadId: "thread:venue",
      responseReceivedAt: "2026-09-19T22:00:00.000Z",
      messageSubject: "Re: Wedding availability",
      messageSnippet: "We are available and attached the updated package.",
      sourceLabel: "Gmail vendor reply",
    }],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.vendorId, "vendor:harbour-hall");
  assert.equal(requests[0]?.body.contact_method, "other");
  assert.equal(requests[0]?.body.response_received_at, "2026-09-19T22:00:00.000Z");
  assert.equal(requests[0]?.body.follow_up_due_at, null);
  assert.equal(requests[0]?.body.thread_id, "thread:venue");
  assert.match(requests[0]?.body.notes ?? "", /Gmail vendor reply/);
  assert.match(requests[0]?.body.notes ?? "", /updated package/);
});

test("weddingVendorReplyInputsFromAfpMessages extracts connected email vendor replies", () => {
  const replies = weddingVendorReplyInputsFromAfpMessages({
    messages: [{
      id: "gmail:msg-1",
      thread_id: "gmail:thread-venue",
      from: "events@harbour.example",
      to: ["user@example.test"],
      timestamp: "2026-09-20T03:00:00.000Z",
      type: "email",
      kind: "message",
      subtype: "gmail_inbound",
      supertags: ["wedding", "vendor_reply"],
      content: {
        subject: "Re: Wedding availability",
        snippet: "We are available and can hold the date until Monday.",
      },
      metadata: {
        provider: "gmail",
        vendor_id: "vendor:harbour-hall",
        vendor_label: "Harbour Hall",
        gmail_thread_id: "gmail:thread-venue",
        gmail_message_id: "gmail:msg-1",
      },
      views: [],
      attachments: [],
    }, {
      id: "email:other",
      thread_id: "thread:other",
      from: "friend@example.test",
      to: ["user@example.test"],
      timestamp: "2026-09-20T04:00:00.000Z",
      type: "email",
      kind: "message",
      content: { subject: "Dinner", snippet: "See you tonight." },
      views: [],
      attachments: [],
    }],
  });

  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.vendorId, "vendor:harbour-hall");
  assert.equal(replies[0]?.vendorLabel, "Harbour Hall");
  assert.equal(replies[0]?.threadId, "gmail:thread-venue");
  assert.equal(replies[0]?.receiptRef, "gmail:msg-1");
  assert.equal(replies[0]?.responseReceivedAt, "2026-09-20T03:00:00.000Z");
  assert.match(replies[0]?.messageSnippet ?? "", /hold the date/i);
});

test("weddingVendorReplyInputsFromAfpMessages can match known contact threads without vendor metadata", () => {
  const replies = weddingVendorReplyInputsFromAfpMessages({
    knownContacts: [{
      vendorId: "vendor:photo-team",
      vendorName: "Photo Team",
      threadId: "gmail:thread-photo",
      receiptRef: "gmail:outbound-photo",
    }],
    messages: [{
      id: "gmail:reply-photo",
      thread_id: "gmail:thread-photo",
      from: "hello@photo.example",
      to: ["user@example.test"],
      timestamp: "2026-09-20T03:00:00.000Z",
      type: "email",
      kind: "message",
      subtype: "gmail_inbound",
      content: {
        subject: "Re: Photography quote",
        snippet: "Thanks, here is our updated quote.",
      },
      metadata: {
        provider: "gmail",
      },
      views: [],
      attachments: [],
    }],
  });

  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.vendorId, "vendor:photo-team");
  assert.equal(replies[0]?.vendorLabel, "Photo Team");
  assert.equal(replies[0]?.threadId, "gmail:thread-photo");
});

test("weddingVendorReplyProjectionRequests matches replies by thread receipt or vendor label", () => {
  const requests = weddingVendorReplyProjectionRequests({
    nowIso: "2026-09-20T00:00:00.000Z",
    knownContacts: [{
      vendorId: "vendor:photo-team",
      vendorName: "Photo Team",
      threadId: "thread:photo",
      receiptRef: "email:photo-1",
    }, {
      vendorId: "vendor:florist",
      vendorName: "Petal Studio",
      threadId: "thread:florist",
      receiptRef: "email:florist-1",
    }],
    replies: [{
      threadId: "thread:photo",
      messageSnippet: "Photo team reply.",
    }, {
      receiptRef: "email:florist-1",
      messageSnippet: "Florist reply.",
    }, {
      vendorLabel: "Photo Team",
      messageSnippet: "Duplicate reply from same vendor, different source.",
      responseReceivedAt: "2026-09-20T00:00:00.000Z",
    }, {
      vendorLabel: "Unknown Vendor",
      messageSnippet: "Should not match.",
    }],
  });

  assert.deepEqual(requests.map((request) => request.vendorId), [
    "vendor:photo-team",
    "vendor:florist",
    "vendor:photo-team",
  ]);
  assert.equal(requests[0]?.body.response_received_at, "2026-09-20T00:00:00.000Z");
  assert.equal(requests[1]?.body.receipt_ref, "email:florist-1");
});

test("weddingVendorReplyProjectionRequests dedupes the same reply projection", () => {
  const requests = weddingVendorReplyProjectionRequests({
    nowIso: "2026-09-20T00:00:00.000Z",
    replies: [{
      vendorId: "vendor:harbour-hall",
      threadId: "thread:venue",
      receiptRef: "email:venue-1",
      messageSnippet: "Reply once.",
    }, {
      vendorId: "vendor:harbour-hall",
      threadId: "thread:venue",
      receiptRef: "email:venue-1",
      messageSnippet: "Reply once duplicate.",
    }],
  });

  assert.equal(requests.length, 1);
});
