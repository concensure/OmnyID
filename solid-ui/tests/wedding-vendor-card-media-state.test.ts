import assert from "node:assert/strict";
import test from "node:test";

import { safeWeddingVendorImageUrl } from "../src/lib/weddingVendorCardMediaState.ts";

test("vendor comparison cards keep approved first-party and proxied photos", () => {
  const approved = [
    "/wedding/assets/venue-photos/harbour-room.webp",
    "/wedding/assets/images/vendors/florist.jpg",
    "/api/wedding/vendor-photos/google/places%2Fexample",
    "/api/public/wedding/vendor/photos/01ARZ3NDEKTSV4RRFFQ69G5FAV/full",
    "https://omnyid.com/wedding/assets/venue-photos/mackay-family-estate-1.png",
    "https://images.unsplash.com/photo-example",
  ];
  for (const url of approved) assert.equal(safeWeddingVendorImageUrl(url), url);
});

test("vendor comparison cards reject arbitrary remote media", () => {
  assert.equal(safeWeddingVendorImageUrl("https://tracker.example/vendor.jpg"), null);
  assert.equal(safeWeddingVendorImageUrl("javascript:alert(1)"), null);
});
