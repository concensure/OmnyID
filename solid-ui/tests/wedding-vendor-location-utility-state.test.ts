import test from "node:test";
import assert from "node:assert/strict";
import { weddingTravelToleranceScale, weddingVendorDistanceUtility, weddingVendorLocationUtility } from "../src/lib/weddingVendorLocationUtilityState.ts";

test("location utility follows distance steps and travel tolerance", () => {
  assert.deepEqual([10, 25, 40, 70, 100].map((distance) => weddingVendorDistanceUtility(distance)), [1, 0.8, 0.55, 0.3, 0.1]);
  assert.equal(weddingTravelToleranceScale("Happy to travel within an hour"), 1.5);
  assert.equal(weddingVendorDistanceUtility(40, 1.5), 0.8);
});
test("service radius veto is decisive only for non-venues and confident evidence", () => {
  const base = { plan: { latitude: -33.86, longitude: 151.21 }, vendor: { latitude: -34.2, longitude: 151.21 }, serviceAreaRadiusKm: 20 };
  assert.equal(weddingVendorLocationUtility({ ...base, category: "photographer", serviceAreaConfidence: 0.9 }).excluded, true);
  assert.equal(weddingVendorLocationUtility({ ...base, category: "venue", serviceAreaConfidence: 0.9 }).excluded, false);
  assert.equal(weddingVendorLocationUtility({ ...base, category: "photographer", serviceAreaConfidence: 0.4 }).excluded, false);
  assert.equal(weddingVendorLocationUtility({ tokenMatch: 0.8 }).confidence, 0.3);
});
