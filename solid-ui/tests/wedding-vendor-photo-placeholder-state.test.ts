import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorPhotoPlaceholder } from "../src/lib/weddingVendorPhotoPlaceholderState.ts";

test("same vendor name always produces the same tone", () => {
  const first = weddingVendorPhotoPlaceholder({ vendorName: "Chloe's Florals", category: "Florist" });
  const second = weddingVendorPhotoPlaceholder({ vendorName: "Chloe's Florals", category: "Florist" });

  assert.equal(first.toneClass, second.toneClass);
  assert.equal(first.initials, "CF");
  assert.equal(first.label, "Florist");
});

test("different vendor names distribute across the tone array", () => {
  const names = ["Alpha Weddings", "Bright Blooms", "Chapel Sounds", "Delta Catering", "Echo Studio", "Foxglove Films"];
  const tones = new Set(names.map((vendorName) => weddingVendorPhotoPlaceholder({ vendorName }).toneClass));

  assert.ok(tones.size > 1, "expected vendor names to spread across more than one tone");
});

test("empty vendor name is handled without throwing", () => {
  const placeholder = weddingVendorPhotoPlaceholder({ vendorName: "", category: null });

  assert.equal(placeholder.initials, "?");
  assert.equal(placeholder.label, "Vendor");
  assert.ok(placeholder.toneClass.length > 0);
});

test("two-word vendor name uses the first letter of each word", () => {
  const placeholder = weddingVendorPhotoPlaceholder({ vendorName: "Willow Creek Photography" });

  assert.equal(placeholder.initials, "WC");
});
