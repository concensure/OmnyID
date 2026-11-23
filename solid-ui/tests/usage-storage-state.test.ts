import test from "node:test";
import assert from "node:assert/strict";

import { readUsageStorageDetail, readUsageStorageTierLabel } from "../src/lib/usageStorageState.ts";

test("readUsageStorageDetail does not invent upload limits from plan fallback", () => {
  assert.equal(
    readUsageStorageDetail({
      plan: "paid",
      storage_used_bytes: 3 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
    }),
    "Retry billing status to confirm storage quota, remaining capacity, and upload limits.",
  );
});

test("readUsageStorageDetail does not invent quota from plan fallback", () => {
  assert.equal(
    readUsageStorageDetail({
      plan: "paid",
      storage_used_bytes: 3 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      max_single_upload_bytes: 100 * 1024 * 1024,
    }),
    "Retry billing status to confirm storage quota, remaining capacity, and upload limits.",
  );
});

test("readUsageStorageDetail renders confirmed storage details when all live signals are present", () => {
  assert.equal(
    readUsageStorageDetail({
      plan: "paid",
      storage_used_bytes: 3 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
      max_single_upload_bytes: 100 * 1024 * 1024,
    }),
    "12 GB remaining of 15 GB. Max single upload 100 MB.",
  );
});

test("readUsageStorageTierLabel does not invent quota from plan fallback", () => {
  assert.equal(
    readUsageStorageTierLabel({
      plan: "paid",
    }),
    "Retry billing status to confirm live storage quota before trusting this tier summary.",
  );
});

test("readUsageStorageTierLabel renders confirmed tier summary from live quota", () => {
  assert.equal(
    readUsageStorageTierLabel({
      plan: "paid",
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
    }),
    "Paid | 15 GB plan",
  );
});

test("readUsageStorageDetail does not trust non-finite mounted storage numbers", () => {
  assert.equal(
    readUsageStorageDetail({
      plan: "paid",
      storage_used_bytes: Number.NaN,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
      max_single_upload_bytes: 100 * 1024 * 1024,
    }),
    "Retry billing status to confirm current storage usage, remaining capacity, and upload limits.",
  );
});

test("readUsageStorageTierLabel does not trust non-finite quota values", () => {
  assert.equal(
    readUsageStorageTierLabel({
      plan: "paid",
      storage_quota_bytes: Number.POSITIVE_INFINITY,
    }),
    "Retry billing status to confirm live storage quota before trusting this tier summary.",
  );
});
