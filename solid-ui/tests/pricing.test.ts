import test from "node:test";
import assert from "node:assert/strict";

import {
  hasRecognizedPlanMetadata,
  STORAGE_ADDON,
  STORAGE_PLANS,
  formatUsdPerMonth,
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

test("formatUsdPerMonth renders whole-dollar monthly pricing", () => {
  assert.equal(formatUsdPerMonth(STORAGE_PLANS.paid.monthlyPriceUsd), "$20/mo");
  assert.equal(formatUsdPerMonth(STORAGE_ADDON.monthlyPriceUsd), "$10/mo");
});

test("nextStorageUpgradeLabel reflects the free-to-paid upgrade path", () => {
  assert.equal(
    nextStorageUpgradeLabel("free"),
    "Paid - 15 GB for $20/mo",
  );
});

test("nextStorageUpgradeLabel reflects the paid storage add-on path", () => {
  assert.equal(
    nextStorageUpgradeLabel("paid"),
    "Additional storage - +10 GB for $10/mo",
  );
});
