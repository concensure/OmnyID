import test from "node:test";
import assert from "node:assert/strict";
import { projectWeddingVendorOutreachFlows } from "../src/lib/weddingVendorOutreachProjectionState.ts";

const message = (kind: string, timestamp: string, content: Record<string, unknown>) => ({
  id: `${kind}:${timestamp}`, thread_id: "01KTHREAD00000000000000000", from: "agent://wedding-planning", to: ["user://couple"],
  timestamp, type: "email", kind, subtype: kind, content, views: [], attachments: [], references: [], supertags: [], metadata: {},
});

test("outreach projection rebuilds a persisted draft then its delivery receipt", () => {
  const projected = projectWeddingVendorOutreachFlows([
    message("wedding_vendor_outreach_sent", "2026-10-06T10:01:00Z", { choice_id: "choice-1", vendor_label: "Harbour House", sent_at: "2026-10-06T10:01:00Z", client_message_id: "receipt-1" }),
    message("wedding_vendor_outreach_draft", "2026-10-06T10:00:00Z", { choice_id: "choice-1", vendor_label: "Harbour House", to: "hello@example.com", subject: "Availability", text: "Hello", grounded_on: ["Date"] }),
  ] as never);
  assert.equal(projected.length, 1);
  assert.equal(projected[0]?.stage, "sent");
  assert.equal(projected[0]?.bodyMarkdown, "Hello");
  assert.equal(projected[0]?.receiptRef, "receipt-1");
});

test("outreach projection keeps a saved draft editable after reload", () => {
  const [flow] = projectWeddingVendorOutreachFlows([
    message("wedding_vendor_outreach_draft", "2026-10-06T10:00:00Z", { choice_id: "choice-2", vendor_label: "Garden Rooms", to: "garden@example.com", subject: "Quote", text: "Please send a quote" }),
  ] as never);
  assert.equal(flow?.stage, "draft_ready");
  assert.equal(flow?.recipientEmail, "garden@example.com");
});
