import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorDirectorySearchPlans } from "@/lib/weddingVendorDirectorySearchPlanState";

test("directory-only search retains an internal query when paid providers are disabled", () => {
  const plans = weddingVendorDirectorySearchPlans({ providerPlans: [], category: "Venue", location: "Sydney" });
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.queries[0]!.query, "Venue Sydney");
  assert.equal(plans[0]!.queries[0]!.category, "venue");
});
