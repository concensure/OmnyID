import assert from "node:assert/strict";
import test from "node:test";

import {
  adminWeddingVendorDraftFromVendor,
  adminWeddingVendorSlugFromName,
  buildAdminWeddingVendorPayload,
  emptyAdminWeddingVendorDraft,
} from "../src/lib/adminWeddingVendorFormState.ts";
import type { WeddingVendor } from "../src/lib/api.ts";

test("adminWeddingVendorSlugFromName creates stable lowercase slugs", () => {
  assert.equal(adminWeddingVendorSlugFromName("  Harbour House & Co.  "), "harbour-house-co");
});

test("buildAdminWeddingVendorPayload creates conservative editable vendor payloads", () => {
  const draft = {
    ...emptyAdminWeddingVendorDraft(),
    vendorName: "Harbour House",
    category: "Venue",
    serviceArea: "Sydney, NSW",
    address: "1 Harbour St, Sydney NSW",
    websiteUrl: "https://venue.example.test",
    sourceUrl: "https://source.example.test/venue",
    sourceCheckedAt: "2026-09-19",
    caveatLabels: "Request quote\nConfirm availability",
    photo1Url: "https://cdn.example.test/venue.jpg",
    photo1Alt: "Harbour ballroom",
    photo1SourceUrl: "https://source.example.test/photo",
    photo1RetrievedAt: "2026-09-20",
    photo1LicenceMetadata: '{"use":"editorial"}',
  };

  const result = buildAdminWeddingVendorPayload(draft);

  assert.deepEqual(result.errors, []);
  assert.equal(result.payload?.vendor_slug, "harbour-house");
  assert.equal(result.payload?.address, "1 Harbour St, Sydney NSW");
  assert.equal(result.payload?.source_checked_at, "2026-09-19");
  assert.deepEqual(result.payload?.caveat_labels, ["Request quote", "Confirm availability"]);
  assert.equal(result.payload?.photos?.length, 1);
  assert.equal(result.payload?.photos?.[0]?.slot, 1);
  assert.equal(result.payload?.photos?.[0]?.source_url, "https://source.example.test/photo");
  assert.deepEqual(result.payload?.photos?.[0]?.licence_metadata, { use: "editorial" });
});

test("buildAdminWeddingVendorPayload blocks malformed operator input before API calls", () => {
  const result = buildAdminWeddingVendorPayload({
    ...emptyAdminWeddingVendorDraft(),
    vendorName: "Bad Venue",
    vendorSlug: "Bad Slug!",
    category: "",
    serviceArea: "",
    websiteUrl: "venue.example.test",
    sourceCheckedAt: "2026-99-99",
    photo1Url: "not-a-url",
    photo1LicenceMetadata: "not-json",
  });

  assert.equal(result.payload, null);
  assert.ok(result.errors.some((error) => /slug/i.test(error)));
  assert.ok(result.errors.some((error) => /Category/i.test(error)));
  assert.ok(result.errors.some((error) => /Service area/i.test(error)));
  assert.ok(result.errors.some((error) => /Website URL/i.test(error)));
  assert.ok(result.errors.some((error) => /Source checked date/i.test(error)));
  assert.ok(result.errors.some((error) => /Photo 1 URL/i.test(error)));
  assert.ok(result.errors.some((error) => /licence metadata/i.test(error)));
});

test("adminWeddingVendorDraftFromVendor preserves three photo slots for editing", () => {
  const vendor: WeddingVendor = {
    vendorId: "vendor_1",
    vendorSlug: "harbour-house",
    vendorName: "Harbour House",
    category: "Venue",
    serviceArea: "Sydney, NSW",
    address: null,
    websiteUrl: null,
    contactPhone: null,
    contactEmail: null,
    sourceUrl: null,
    sourceLabel: null,
    sourceCheckedAt: null,
    status: "active",
    notes: null,
    evidence: {},
    caveatLabels: [],
    createdAt: "2026-09-19T00:00:00Z",
    updatedAt: "2026-09-19T00:00:00Z",
    photos: [
      {
        photoId: "photo_2",
        vendorId: "vendor_1",
        slot: 2,
        photoUrl: "https://cdn.example.test/second.jpg",
        altText: "Second view",
        sourceLabel: null,
        sourceUrl: "https://source.example.test/second.jpg",
        retrievedAt: "2026-09-20T00:00:00Z",
        licenceMetadata: { use: "editorial" },
        createdAt: "2026-09-19T00:00:00Z",
      },
    ],
    userContact: null,
  };

  const draft = adminWeddingVendorDraftFromVendor(vendor);

  assert.equal(draft.photo1Url, "");
  assert.equal(draft.photo2Url, "https://cdn.example.test/second.jpg");
  assert.equal(draft.photo2Alt, "Second view");
  assert.equal(draft.photo2SourceUrl, "https://source.example.test/second.jpg");
  assert.equal(draft.photo2RetrievedAt, "2026-09-20");
  assert.equal(draft.photo2LicenceMetadata, '{"use":"editorial"}');
});
