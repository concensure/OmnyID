import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingRsvpCoupleCsv,
  buildWeddingRsvpVendorExportPreview,
  weddingRsvpExportCorrectionToAfpSendInput,
  weddingRsvpExportReceiptToAfpSendInput,
  weddingRsvpExportReceiptsFromAfpMessages,
  weddingRsvpExportRevocationToAfpSendInput,
} from "../src/lib/weddingRsvpExportState";
import type { AfpMessage } from "../src/lib/api";
import type { WeddingGuestTrackingState } from "../src/lib/weddingGuestTrackingState";

const guestTracking = {
  guestRows: [{ id: "guest:one", personId: "person:one", householdId: "household:one", displayName: "=Alex", householdLabel: "Rivera", rsvpStatus: "Attending", contactLabel: "alex@example.test", mealPreference: "Vegetarian", dietaryNote: "allergy: nuts", accessibilityNote: "Step-free access", mealRequired: true, sourceLabel: "Guest list", eventResponses: [{ invitationId: "invite:one", eventId: "event:wedding", attendance: "Attending", responseSource: "guest", viewedAt: null, respondedAt: "2027-09-01", lockedAt: null, changed: false, revision: 1 }] }],
} as unknown as WeddingGuestTrackingState;

test("couple CSV includes provenance and neutralises spreadsheet formulas", () => {
  const csv = buildWeddingRsvpCoupleCsv(guestTracking, "event:wedding");
  assert.match(csv, /response_source/);
  assert.match(csv, /"'=Alex"/);
  assert.match(csv, /alex@example\.test/);
});

test("caterer preview is minimum necessary and records exact approval fields", () => {
  const preview = buildWeddingRsvpVendorExportPreview({ guestTracking, eventId: "event:wedding", audience: "caterer" });
  assert.equal(preview.rowCount, 1);
  assert.equal(preview.rows[0]?.dietary_category, "Allergy");
  assert.equal(preview.rows[0]?.contact, undefined);
  assert.equal(preview.rows[0]?.accessibility_note, undefined);
  assert.ok(preview.excludedFieldLabels.includes("Accessibility details"));
  const receipt = weddingRsvpExportReceiptToAfpSendInput({ preview, recipientLabel: "Example Caterer", approvedBy: "couple", metadata: { weddingPlanId: "plan:one", responseWorkspaceId: "workspace:one" }, nowIso: "2027-09-01T00:00:00Z" });
  assert.deepEqual((receipt.content as Record<string, unknown>).approved_fields, preview.fieldLabels);
  assert.equal((receipt.metadata as Record<string, unknown>).external_delivery, false);
});

test("unstructured dietary text is held for review instead of inferred", () => {
  const input = structuredClone(guestTracking) as WeddingGuestTrackingState;
  input.guestRows![0]!.dietaryNote = "No mushrooms please";
  const preview = buildWeddingRsvpVendorExportPreview({ guestTracking: input, eventId: "event:wedding", audience: "caterer" });
  assert.equal(preview.rows[0]?.dietary_category, "Unclassified — couple review required");
  assert.match(preview.warningLabels.join(" "), /couple to label/i);
});

test("corrections and future-use revocations remain linked to the original receipt", () => {
  const preview = buildWeddingRsvpVendorExportPreview({ guestTracking, eventId: "event:wedding", audience: "caterer" });
  const original = weddingRsvpExportReceiptToAfpSendInput({
    preview,
    recipientLabel: "Sample Caterer",
    approvedBy: "couple",
    nowIso: "2027-09-01T10:00:00Z",
  });
  const originalMessage = { ...original, timestamp: "2027-09-01T10:00:00Z" } as AfpMessage;
  const [originalReceipt] = weddingRsvpExportReceiptsFromAfpMessages([originalMessage]);
  assert.ok(originalReceipt);

  const correction = weddingRsvpExportCorrectionToAfpSendInput({
    previousReceipt: originalReceipt!,
    preview,
    approvedBy: "couple",
    nowIso: "2027-09-02T10:00:00Z",
  });
  assert.equal(correction.content.corrects_receipt_id, originalReceipt?.receiptId);
  assert.equal(correction.content.delivery_status, "downloaded_for_manual_handoff");

  const revocation = weddingRsvpExportRevocationToAfpSendInput({
    receipt: originalReceipt!,
    revokedBy: "couple",
    nowIso: "2027-09-03T10:00:00Z",
  });
  assert.equal(revocation.content.effect, "future_use_only_downloaded_file_cannot_be_recalled");
  const history = weddingRsvpExportReceiptsFromAfpMessages([
    originalMessage,
    { ...correction, timestamp: "2027-09-02T10:00:00Z" } as AfpMessage,
    { ...revocation, timestamp: "2027-09-03T10:00:00Z" } as AfpMessage,
  ]);
  assert.equal(history.length, 2);
  assert.equal(history[0]?.correctsReceiptId, originalReceipt?.receiptId);
  assert.equal(history.find((receipt) => receipt.receiptId === originalReceipt?.receiptId)?.revokedAt, "2027-09-03T10:00:00Z");
});
