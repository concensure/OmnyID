import test from "node:test";
import assert from "node:assert/strict";

import {
  hasRecognizedPlanMetadata,
  STORAGE_PLANS,
  formatAudOneOff,
  nextStorageUpgradeLabel,
  normalizePlanId,
} from "../src/lib/pricing.ts";

test("normalizePlanId maps blank and trial-like plans to free", () => {
  assert.equal(normalizePlanId(undefined), "free");
  assert.equal(normalizePlanId(""), "free");
  assert.equal(normalizePlanId("trial"), "free");
  assert.equal(normalizePlanId("starter_free"), "free");
});

test("normalizePlanId maps non-free plans to paid", () => {
  assert.equal(normalizePlanId("paid"), "paid");
  assert.equal(normalizePlanId("pro"), "paid");
});

test("hasRecognizedPlanMetadata only accepts supported plan ids", () => {
  assert.equal(hasRecognizedPlanMetadata("free"), true);
  assert.equal(hasRecognizedPlanMetadata("trial"), true);
  assert.equal(hasRecognizedPlanMetadata("starter_free"), true);
  assert.equal(hasRecognizedPlanMetadata("paid"), true);
  assert.equal(hasRecognizedPlanMetadata("pro"), false);
  assert.equal(hasRecognizedPlanMetadata("enterprise_custom"), false);
});

test("formatAudOneOff renders the Wedding one-off price", () => {
  assert.equal(formatAudOneOff(STORAGE_PLANS.paid.priceAud), "AUD 39 one-off");
});

test("nextStorageUpgradeLabel reflects the free-to-paid upgrade path", () => {
  assert.equal(
    nextStorageUpgradeLabel("free"),
    "OmnyID Wedding - 100 MB for AUD 39 once",
  );
});

test("nextStorageUpgradeLabel reflects the paid storage add-on path", () => {
  assert.equal(
    nextStorageUpgradeLabel("paid"),
    "Your OmnyID Wedding upgrade is active (100 MB storage).",
  );
});
