import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { normalizeWeddingVendorSpecialDiscovery } from "../src/lib/weddingVendorSpecialDiscoveryApi.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("limited-special discovery drops malformed markers and normalises safe exact-date evidence", () => {
  const result = normalizeWeddingVendorSpecialDiscovery({
    selected_date: "2027-11-20",
    category: "Venue",
    markers: [
      {
        vendor_id: "venue-a", vendor_name: "Harbour House", category: "Venue",
        locality: "Sydney", latitude: -33.86, longitude: 151.2,
        distance_km: 3.2,
        style_tags: ["waterfront", "modern"], rating: 4.8, review_count: 42,
        available_on_date: "2027-11-20", last_confirmed_at: "2026-11-07T00:00:00Z",
        available_dates: ["2027-11-20", "2027-11-27"],
        confirmation_expires_at: "2026-11-21T00:00:00Z", indicative_only: true,
      },
      { vendor_id: "missing-coordinates", vendor_name: "Unsafe" },
    ],
    top_choices: [{
      vendor_id: "venue-a", offer_id: "offer-a", slot_id: "slot-a", slot_revision: 3,
      rank: 1, title: "Quiet Saturday package", summary: "Approved guidance",
      currency: "AUD", minimum_spend_cents: 1_400_000, indicative_per_head_cents: 18_000,
      indicative_total_cents: 1_590_000, budget_fit_eligible: true, unknown_costs: false,
      inclusions: ["Room hire", "Staffing"], exclusions: [], reason_labels: ["Date confirmed"], indicative_only: true,
    }],
  });
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].vendorName, "Harbour House");
  assert.deepEqual(result.markers[0].styleTags, ["waterfront", "modern"]);
  assert.equal(result.markers[0].availableOnDate, "2027-11-20");
  assert.deepEqual(result.markers[0].availableDates, ["2027-11-20", "2027-11-27"]);
  assert.equal(result.markers[0].distanceKm, 3.2);
  assert.equal(result.topChoices.length, 1);
  assert.equal(result.topChoices[0].indicativeTotalCents, 1_590_000);
  assert.deepEqual(result.topChoices[0].inclusions, ["Room hire", "Staffing"]);
});

test("Limited Specials uses a third mode, full marker name and one synchronized detail card", async () => {
  const [home, map, card, api, server, caddy, deploy] = await Promise.all([
    read("solid-ui/src/components/WeddingVendorSearchHomeSections.tsx"),
    read("solid-ui/src/components/WeddingLimitedSpecialsMap.tsx"),
    read("solid-ui/src/components/WeddingLimitedSpecialVenueCard.tsx"),
    read("solid-ui/src/lib/weddingVendorSpecialDiscoveryApi.ts"),
    read("src/server/wedding_vendor_special_offer_routes/discovery.rs"),
    read("Caddyfile"),
    read("scripts/deploy-oracle.ps1"),
  ]);
  assert.match(home, /Limited Specials/);
  assert.match(map, /hoveredName/);
  assert.match(map, /wedding-special-map-tooltip/);
  assert.match(map, /wedding-special-map-cluster/);
  assert.match(map, /radiusKm/);
  assert.match(map, /guestCount/);
  assert.match(map, /selectedDetail/);
  assert.match(card, /availableDays/);
  assert.match(card, /Commercial terms shown only for a current top-three match|priceCertaintyLabel/);
  assert.match(map, /Availability is indicative and subject to vendor confirmation/);
  assert.match(map, /onPrepareEnquiry\(item, selectedDetail\(\)\)/);
  assert.match(card, /aria-label={`Availability for/);
  assert.match(api, /wedding\/vendor-specials\/discovery/);
  assert.match(api, /method: "POST"/);
  assert.match(api, /bodyJson:/);
  assert.doesNotMatch(api, /body: JSON\.stringify/);
  assert.doesNotMatch(api, /URLSearchParams/);
  const markerContract = server.match(/struct DiscoveryMarker \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(markerContract);
  for (const forbidden of ["minimum_spend", "per_head", "inclusions", "offer_id", "slot_id"]) assert.doesNotMatch(markerContract, new RegExp(forbidden));
  assert.match(server, /photo_licence_id IS NOT NULL/);
  assert.match(server, /slot\.local_date BETWEEN \$1 AND \$2/);
  assert.match(server, /rank_top_three/);
  assert.match(server, /MAX_RANKING_CANDIDATES/);
  assert.match(server, /approved_date_price_estimate/);
  assert.match(caddy, /handle \/wedding\/vendor-specials\/\*/);
  assert.match(caddy, /handle \/wedding\/vendor\/special-offers\*/);
  assert.match(deploy, /staged Caddyfile is missing the Limited Specials/);
  assert.match(deploy, /running Caddyfile is missing the Limited Specials/);
});

test("Limited Specials keeps an enquiry path when discovery is empty or unavailable", async () => {
  const [map, home] = await Promise.all([
    read("solid-ui/src/components/WeddingLimitedSpecialsMap.tsx"),
    read("solid-ui/src/components/WeddingVendorSearchHomeSections.tsx"),
  ]);
  assert.match(map, /query\.error \? null : query\(\)/);
  assert.match(map, /Enquire about this date anyway/);
  assert.match(map, /Prepare date enquiry/);
  assert.match(map, /onPrepareDateEnquiry/);
  assert.match(map, /normalizedVendorCategory/);
  assert.match(map, /includes\("celebrant"\).*return "Celebrant"/);
  assert.match(home, /prepareDirectoryDateEnquiry/);
  assert.match(home, /availability for/);
});

test("claimed and link-only vendors can maintain bounded date terms while enquiries reuse approval", async () => {
  const [claimed, linked, api, owner, afp, server, capability, migration, admin] = await Promise.all([
    read("solid-ui/src/components/vendor/VendorSpecialOffersPanel.tsx"),
    read("solid-ui/src/components/vendor/VendorSpecialManagementFlow.tsx"),
    read("solid-ui/src/lib/vendorSpecialsApi.ts"),
    read("solid-ui/src/lib/useWeddingVendorOutreachOwner.ts"),
    read("solid-ui/src/lib/weddingVendorOutreachAfpState.ts"),
    read("src/server/wedding_vendor_special_offer_routes/enquiry.rs"),
    read("src/server/wedding_vendor_special_offer_routes/capability.rs"),
    read("postgres/migrations/0151_wedding_vendor_special_offer_updates.sql"),
    read("solid-ui/src/components/UsageAdminWeddingSpecialsPanel.tsx"),
  ]);
  assert.match(claimed, /Edit draft/);
  assert.match(claimed, /Maximum capacity/);
  assert.match(linked, /Edit date and terms/);
  assert.match(api, /offer_edit/);
  assert.match(capability, /CapabilityOperation::OfferEdit/);
  assert.match(owner, /recheckWeddingVendorSpecialEnquiry/);
  assert.match(owner, /linkWeddingVendorSpecialEnquiry/);
  assert.match(owner, /linkSpecialEnquiryWithRetry/);
  assert.match(afp, /wedding_vendor_special_offer/);
  assert.match(afp, /limited_special_slot_revision/);
  assert.match(server, /wedding_vendor_outreach_sent/);
  assert.match(server, /owner_user_id=\$1/);
  assert.match(server, /FOR UPDATE OF slot/);
  assert.match(claimed, /Hold 48 hours/);
  assert.match(claimed, /Create staff link/);
  assert.match(claimed, /mandatory charges/);
  assert.match(claimed, /Reopen cancelled booking/);
  assert.match(linked, /Confirmed until/);
  assert.match(api, /slot_reopen_cancelled_booking/);
  assert.match(capability, /SlotReopenCancelledBooking/);
  assert.match(migration, /wedding_vendor_special_offer_outcome_projection/);
  assert.match(migration, /wedding_vendor_quote_received/);
  assert.match(admin, /Limited Special outcomes/);
});
