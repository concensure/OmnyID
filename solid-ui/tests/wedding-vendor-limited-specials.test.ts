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
        confirmation_expires_at: "2026-11-21T00:00:00Z", indicative_only: true,
      },
      { vendor_id: "missing-coordinates", vendor_name: "Unsafe" },
    ],
  });
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].vendorName, "Harbour House");
  assert.deepEqual(result.markers[0].styleTags, ["waterfront", "modern"]);
  assert.equal(result.markers[0].availableOnDate, "2027-11-20");
  assert.equal(result.markers[0].distanceKm, 3.2);
});

test("Limited Specials uses a third mode, full marker name and one synchronized detail card", async () => {
  const [home, map, api, server] = await Promise.all([
    read("solid-ui/src/components/WeddingVendorSearchHomeSections.tsx"),
    read("solid-ui/src/components/WeddingLimitedSpecialsMap.tsx"),
    read("solid-ui/src/lib/weddingVendorSpecialDiscoveryApi.ts"),
    read("src/server/wedding_vendor_special_offer_routes/discovery.rs"),
  ]);
  assert.match(home, /Limited Specials/);
  assert.match(map, /hoveredName/);
  assert.match(map, /wedding-special-map-tooltip/);
  assert.match(map, /wedding-special-map-cluster/);
  assert.match(map, /radiusKm/);
  assert.match(map, /guestCount/);
  assert.match(map, /Availability is indicative and subject to vendor confirmation/);
  assert.match(map, /onPrepareEnquiry\(item\)/);
  assert.match(map, /aria-label={`Availability for/);
  assert.match(api, /wedding\/vendor-specials\/discovery/);
  for (const forbidden of ["minimum_spend", "per_head", "inclusions", "offer_id", "slot_id"]) {
    assert.doesNotMatch(server, new RegExp(`DiscoveryMarker[\\s\\S]{0,800}${forbidden}`));
  }
  assert.match(server, /photo_licence_id IS NOT NULL/);
  assert.match(server, /slot\.local_date=\$1/);
});
