import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_VENDOR_STYLE_MATCH_MINIMUM,
  weddingVendorStyleMatchAvailable,
  weddingVendorStyleMatchDisclosure,
} from "../src/lib/weddingVendorStyleCoverageState.ts";

test("style matching stays hidden below fifty populated listings", () => {
  assert.equal(WEDDING_VENDOR_STYLE_MATCH_MINIMUM, 50);
  assert.equal(weddingVendorStyleMatchAvailable({ category: "florists", listedVendors: 80, vendorsWithStyleTags: 49 }), false);
  assert.equal(weddingVendorStyleMatchDisclosure({ category: "florists", listedVendors: 80, vendorsWithStyleTags: 49 }), null);
});

test("style matching becomes available at the evidence threshold", () => {
  const coverage = { category: "photographers", listedVendors: 109, vendorsWithStyleTags: 93 };
  assert.equal(weddingVendorStyleMatchAvailable(coverage), true);
  assert.match(weddingVendorStyleMatchDisclosure(coverage) ?? "", /93 listings have style evidence/);
});
