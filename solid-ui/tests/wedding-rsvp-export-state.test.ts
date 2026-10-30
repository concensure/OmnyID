import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRsvpCoupleCsv, buildWeddingRsvpVendorExportPreview, weddingRsvpExportReceiptToAfpSendInput } from "../src/lib/weddingRsvpExportState";
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
