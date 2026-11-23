import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api";
import {
  projectWeddingVendorLifecycle,
  mergeWeddingVendorLifecycleCandidates,
  weddingVendorFollowUpDismissalToAfpSendInput,
  weddingVendorLifecycleMatches,
  weddingVendorReminderToAfpSendInput,
} from "../src/lib/weddingVendorLifecycleState";
import { weddingVendorQuoteAcceptanceToAfpSendInput } from "../src/lib/weddingVendorQuoteAcceptanceState";

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
    const records = projectWeddingVendorLifecycle([
      message("select", "wedding_vendor_contact_reference", "2026-01-01T00:00:00Z", { option_label: "Harbour House", selected_for_follow_up: true }),
      message("sent", "wedding_vendor_outreach_sent", "2026-01-02T00:00:00Z", { vendor_id: "vendor-1", vendor_label: "Harbour House" }),
      message("quote", "wedding_vendor_quote_received", "2026-01-03T00:00:00Z", { quote: { vendorName: "Harbour House" } }),
      message("book", "wedding_vendor_booking_confirmed", "2026-01-04T00:00:00Z", {
        vendor_id: "vendor-1",
        vendor_name: "Harbour House",
        evidence_message_id: "vendor-acceptance-1",
        payment_executed: false,
      }),
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

test("closing a follow-up is a durable AFP lifecycle state", () => {
    const dismissal = weddingVendorFollowUpDismissalToAfpSendInput({ metadata, vendorId: "vendor-1", vendorName: "Harbour House" });
    const records = projectWeddingVendorLifecycle([
      message("sent", "wedding_vendor_outreach_sent", "2026-01-02T00:00:00Z", { vendor_id: "vendor-1", vendor_label: "Harbour House" }),
      message("dismiss", dismissal.kind ?? "", dismissal.timestamp ?? "2026-01-03T00:00:00Z", dismissal.content),
    ]);
    assert.equal(dismissal.kind, "wedding_vendor_follow_up_dismissed");
    assert.equal(records[0].followUpDismissed, true);
    assert.ok(records[0].followUpDismissedAt);
});

test("only an evidence-backed confirmation event marks a vendor booked", () => {
    const record = projectWeddingVendorLifecycle([
      message("accepted", "wedding_vendor_quote_accepted", "2026-01-03T00:00:00Z", {
        vendor_id: "vendor-1", vendor_name: "Harbour House",
      }),
      message("request", "wedding_vendor_booking_requested", "2026-01-04T00:00:00Z", {
        vendor_id: "vendor-1", vendor_name: "Harbour House",
      }),
    ])[0];
    assert.equal(record.quoteAccepted, true);
    assert.equal(record.booked, false);
});

test("vendor lifecycle recognises tagged enquiry and quote variants", () => {
  const tagged = message("quote", "message", "2026-01-03T00:00:00Z", { vendor_name: "Harbour House" });
  tagged.supertags = ["wedding_vendor_enquiry_sent", "wedding_vendor_quote_attached"];
  const records = projectWeddingVendorLifecycle([tagged]);
  assert.equal(records[0]?.enquired, true);
  assert.equal(records[0]?.quoteReceived, true);
});

test("current comparison favourites appear before the AFP refresh returns", () => {
  const records = mergeWeddingVendorLifecycleCandidates([], [{ vendorId: "vendor-1", vendorName: "Harbour House", favourited: true }]);
  assert.equal(records.length, 1);
  assert.equal(weddingVendorLifecycleMatches(records[0], "favourited"), true);
});

test("quote acceptance is one budget decision and does not imply booking or payment", () => {
  const accepted = weddingVendorQuoteAcceptanceToAfpSendInput({
    metadata,
    sourceId: "quote-1",
    quote: {
      kind: "quote", vendorName: "Harbour House", vendorCategory: "Venue", amount: 8500, amountLabel: "$8,500", currency: "AUD",
      budgetDeltaAmount: null, budgetDeltaLabel: null, inclusions: [], validUntil: "2027-01-31",
      dateHoldExpiresAt: "2027-01-14T23:59:00+11:00", attachmentUrl: null,
    },
  });
  const acceptedMessage = message("accepted", accepted.kind ?? "note", accepted.timestamp ?? "2026-01-05T00:00:00Z", accepted.content);
  acceptedMessage.subtype = accepted.subtype;
  acceptedMessage.supertags = accepted.supertags;
  acceptedMessage.metadata = accepted.metadata;
  const record = projectWeddingVendorLifecycle([acceptedMessage])[0];

  assert.equal(accepted.subtype, "wedding_decision_selection");
  assert.equal(accepted.content.budget_decision, true);
  assert.equal(accepted.supertags?.includes("wedding_vendor_quote_accepted"), true);
  assert.equal(accepted.content.venue_choice_status, "chosen");
  assert.equal(accepted.content.date_hold_expires_at, "2027-01-14T23:59:00+11:00");
  assert.equal(accepted.content.successor_task_creation_policy, "materialize_once_by_stable_task_id");
  assert.deepEqual(
    (accepted.content.successor_tasks as Array<{ id: string }>).map((task) => task.id),
    [
      "wedding_task:venue-choice:response_workspace:workspace-1:contract",
      "wedding_task:venue-choice:response_workspace:workspace-1:caterer",
      "wedding_task:venue-choice:response_workspace:workspace-1:photographer",
    ],
  );
  assert.deepEqual(accepted.metadata?.dependency_releases, ["caterer", "photographer"]);
  assert.equal(record.quoteAccepted, true);
  assert.equal(record.booked, false);
});

test("non-venue quote acceptance does not release venue-dependent tasks", () => {
  const accepted = weddingVendorQuoteAcceptanceToAfpSendInput({
    metadata,
    sourceId: "quote-photo",
    quote: {
      kind: "quote", vendorName: "Harbour Photos", vendorCategory: "Photographer", amount: 5000,
      amountLabel: "$5,000", currency: "AUD", budgetDeltaAmount: null, budgetDeltaLabel: null,
      inclusions: [], validUntil: null, attachmentUrl: null,
    },
  });
  assert.deepEqual(accepted.content.successor_tasks, []);
  assert.deepEqual(accepted.metadata?.dependency_releases, []);
});
