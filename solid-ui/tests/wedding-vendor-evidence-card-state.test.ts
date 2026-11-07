import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { buildWeddingVendorSpecialEvidenceCardState } from "../src/lib/weddingVendorSpecialEvidenceCardState.ts";
import {
  projectWeddingVendorShortlistPreferences,
  weddingVendorShortlistPreferenceToAfpSendInput,
} from "../src/lib/weddingVendorShortlistPreferenceState.ts";
import { projectWeddingVendorLifecycle } from "../src/lib/weddingVendorLifecycleState.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");
const marker = {
  vendorId: "venue-a", vendorName: "Harbour Garden", category: "Venue", locality: "Mosman", address: "1 Harbour Road",
  description: null, latitude: -33.8, longitude: 151.2, photoUrl: "/photo.webp", photoAlt: "Garden reception",
  styleTags: ["garden"], rating: 4.8, reviewCount: 30, availableOnDate: "2027-11-20", availableDates: ["2027-11-20"],
  lastConfirmedAt: "2026-11-06T00:00:00Z", confirmationExpiresAt: "2026-11-20T00:00:00Z", indicativeOnly: true as const, distanceKm: 8,
};
const detail = {
  vendorId: "venue-a", offerId: "offer-a", slotId: "slot-a", slotRevision: 2, rank: 1, specialDate: "2027-11-20",
  title: "Reception package", summary: "Five-hour reception", spaceLabel: "Garden room", sessionLabel: null, maximumCapacity: 120,
  currency: "AUD", minimumSpendCents: 2_000_000, indicativePerHeadCents: 21_000, indicativeTotalCents: 2_100_000,
  budgetFitEligible: true, unknownCosts: false, inclusions: ["Reception", "Catering"], exclusions: ["Ceremony"], publicConditions: null,
  reasonLabels: ["Fits your guest count and includes a wet-weather space"], indicativeOnly: true as const,
};

test("special evidence card exposes basis certainty freshness and keeps unknown separate from failure", () => {
  const state = buildWeddingVendorSpecialEvidenceCardState({ marker, detail, guestCount: 100, now: Date.parse("2026-11-08T00:00:00Z") });
  assert.equal(state.identityLabel, "Harbour Garden — Mosman");
  assert.equal(state.coverageLabel, "Up to 120 guests");
  assert.match(state.priceLabel, /\$21,000/);
  assert.match(state.priceBasisLabel, /\$210 per head × 100 guests/);
  assert.match(state.availabilityLabel, /calendar shows this date open/i);
  assert.match(state.availabilityEvidenceLabel, /updated 2 days ago/i);
  assert.match(state.fitReason, /wet-weather space/);
  assert.deepEqual(state.unknownLabels, []);

  const unknown = buildWeddingVendorSpecialEvidenceCardState({ marker, detail: null, guestCount: null });
  assert.deepEqual(unknown.unknownLabels, ["Capacity unknown", "Comparable price unknown"]);
  assert.doesNotMatch(unknown.unknownLabels.join(" "), /does not meet|failed/i);
});

test("shared shortlist preference is one account-scoped AFP projection with bounded concern text", () => {
  const input = weddingVendorShortlistPreferenceToAfpSendInput({
    metadata: { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1" } as never,
    vendorId: "venue-a", vendorName: "Harbour Garden", preference: "concerned", reason: "Ceremony fee is unclear",
  });
  assert.equal(input.kind, "wedding_vendor_shortlist_preference");
  assert.equal(input.store_in_relational, true);
  const projected = projectWeddingVendorShortlistPreferences([{ id: "message-1", ...input } as never]);
  assert.equal(projected.get("venue-a")?.preference, "concerned");
  assert.equal(projected.get("venue-a")?.reason, "Ceremony fee is unclear");

  const favourite = weddingVendorShortlistPreferenceToAfpSendInput({
    metadata: { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1" } as never,
    vendorId: "venue-a", vendorName: "Harbour Garden", preference: "favourite",
  });
  assert.equal(projectWeddingVendorLifecycle([{ id: "message-2", ...favourite } as never])[0]?.favourited, true);
});

test("Limited Specials and quote comparison expose decision-useful source-backed actions", async () => {
  const [card, comparison, lifecycle, map] = await Promise.all([
    read("solid-ui/src/components/WeddingLimitedSpecialVenueCard.tsx"),
    read("solid-ui/src/components/WeddingQuoteEvidenceComparison.tsx"),
    read("solid-ui/src/components/WeddingVendorLifecycleDetailPanel.tsx"),
    read("solid-ui/src/components/WeddingLimitedSpecialsMap.tsx"),
  ]);
  for (const label of ["Capacity or coverage", "Price", "Availability", "Why it may suit you", "View details", "Save"]) assert.match(card, new RegExp(label));
  for (const state of ["Calendar open", "Vendor confirmed", "Temporary hold", "Confirmed booking"]) assert.match(card, new RegExp(state));
  for (const preference of ["Interested", "Favourite", "Concerned", "Need more information"]) assert.match(card, new RegExp(preference));
  assert.match(card, /Unknown means the vendor has not supplied enough evidence/);
  assert.match(comparison, /A lower estimate with exclusions is not treated as equivalent/);
  assert.match(comparison, /View source or correct/);
  assert.match(lifecycle, /WeddingQuoteEvidenceComparison/);
  assert.match(lifecycle, /WeddingNormalizedQuoteSummary/);
  assert.match(map, /Show all vendor categories/);
});
