import assert from "node:assert/strict";
import test from "node:test";

import { safeWeddingVendorImageUrl, weddingVendorCardWithCurrentPhoto } from "../src/lib/weddingVendorCardMediaState.ts";

test("approved directory photo replaces stale comparison media by exact vendor id", () => {
  const card = { vendorId: "venue-1", choiceId: "choice-1", title: "A Very Long Waterfront Venue Name", imageUrl: null } as never;
  const photoUrl = "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fone&max_width_px=720";
  const directory = [{
    vendorId: "venue-1", vendorName: "Different display name", photos: [{ photoUrl, altText: "Waterfront terrace" }],
  }] as never;
  const result = weddingVendorCardWithCurrentPhoto(card, directory);
  assert.equal(result.imageUrl, photoUrl);
  assert.equal(result.imageAlt, "Waterfront terrace");
});

test("vendor card media rejects unapproved external and malformed proxy URLs", () => {
  assert.equal(safeWeddingVendorImageUrl("https://cdn.example/photo.jpg"), null);
  assert.equal(safeWeddingVendorImageUrl("/wedding/vendor-photo/google?name=places%2Fone&key=secret"), null);
});

test("vendor card media accepts the verified public owner-photo route", () => {
  assert.equal(
    safeWeddingVendorImageUrl("/api/public/wedding/vendor/photos/01ARZ3NDEKTSV4RRFFQ69G5FAV/medium"),
    "/api/public/wedding/vendor/photos/01ARZ3NDEKTSV4RRFFQ69G5FAV/medium",
  );
  assert.equal(safeWeddingVendorImageUrl("/api/public/wedding/vendor/photos/not-an-id/medium"), null);
});
