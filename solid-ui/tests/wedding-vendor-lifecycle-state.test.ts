import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api";
import {
  projectWeddingVendorLifecycle,
  weddingVendorBookingToAfpSendInput,
  weddingVendorLifecycleMatches,
  weddingVendorReminderToAfpSendInput,
} from "../src/lib/weddingVendorLifecycleState";

const message = (id: string, kind: string, timestamp: string, content: Record<string, unknown>): AfpMessage => ({
  id, thread_id: "wedding:1", from: "test", timestamp, type: kind, kind, subtype: kind,
  content, views: [], attachments: [],
});

const metadata = {
  template: "wedding_planning" as const,
  weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", sourceResponseId: null,
  artifactKind: null, supertags: ["wedding"], privacyScope: "private" as const, approvalState: "draft" as const,
};

test("vendor lifecycle merges favourite, enquiry, quote and booking events", () => {
    const booking = weddingVendorBookingToAfpSendInput({ metadata, vendorId: "vendor-1", vendorName: "Harbour House" });
    const records = projectWeddingVendorLifecycle([
      message("select", "wedding_vendor_contact_reference", "2026-01-01T00:00:00Z", { option_label: "Harbour House", selected_for_follow_up: true }),
      message("sent", "wedding_vendor_outreach_sent", "2026-01-02T00:00:00Z", { vendor_id: "vendor-1", vendor_label: "Harbour House" }),
      message("quote", "wedding_vendor_quote_received", "2026-01-03T00:00:00Z", { quote: { vendorName: "Harbour House" } }),
      message("book", booking.kind ?? "", booking.timestamp ?? "2026-01-04T00:00:00Z", booking.content),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual({ vendorId: records[0].vendorId, favourited: records[0].favourited, enquired: records[0].enquired, quoteReceived: records[0].quoteReceived, booked: records[0].booked }, { vendorId: "vendor-1", favourited: true, enquired: true, quoteReceived: true, booked: true });
    assert.equal(weddingVendorLifecycleMatches(records[0], "booked"), true);
});

test("vendor lifecycle keeps the latest AFP follow-up reminder", () => {
    const first = weddingVendorReminderToAfpSendInput({ metadata, vendorId: "vendor-1", vendorName: "Harbour House", reminderAt: "2027-02-01T12:00:00Z" });
    const second = weddingVendorReminderToAfpSendInput({ metadata, vendorId: "vendor-1", vendorName: "Harbour House", reminderAt: "2027-02-03T12:00:00Z" });
    const records = projectWeddingVendorLifecycle([
      message("sent", "wedding_vendor_outreach_sent", "2026-01-02T00:00:00Z", { vendor_id: "vendor-1", vendor_label: "Harbour House" }),
      message("reminder-1", first.kind ?? "", "2026-01-03T00:00:00Z", first.content),
      message("reminder-2", second.kind ?? "", "2026-01-04T00:00:00Z", second.content),
    ]);
    assert.equal(records[0].reminderAt, "2027-02-03T12:00:00Z");
});

test("vendor booking records a decision without pretending to pay", () => {
    const input = weddingVendorBookingToAfpSendInput({ metadata, vendorName: "Harbour House" });
    assert.equal(input.kind, "wedding_vendor_booking_confirmed");
    assert.equal(input.content.payment_executed, false);
    assert.equal(input.store_in_relational, true);
});
