import test from "node:test";
import assert from "node:assert/strict";

import {
  BILLING_UPGRADE_EMAIL,
  buildBillingUpgradeMailtoHref,
  buildBillingUpgradeRequestBody,
} from "../src/lib/billingUpgradeState.ts";

test("buildBillingUpgradeRequestBody includes account and storage context", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "free",
      status: "active",
      storage_used_bytes: 4 * 1024 * 1024 * 1024,
      storage_quota_bytes: 5 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 1 * 1024 * 1024 * 1024,
      quota_state: "ok",
    },
    "owner@example.com",
  );

  assert.match(body, /Account email: owner@example\.com/);
  assert.match(body, /Current plan: Free/);
  assert.match(body, /Suggested next upgrade: Paid - 15 GB for \$20\/mo/);
  assert.match(body, /Storage used: 4\.0 GB/);
  assert.match(body, /Storage remaining: 1\.0 GB of 5\.0 GB/);
});

test("buildBillingUpgradeMailtoHref targets the support inbox and encodes the body", () => {
  const href = buildBillingUpgradeMailtoHref(
    {
      plan: "paid",
      status: "past_due",
      storage_used_bytes: 16 * 1024 * 1024 * 1024,
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
      quota_state: "exceeded",
    },
    "ops@example.com",
  );

  assert.match(href, new RegExp(`^mailto:${BILLING_UPGRADE_EMAIL}\\?subject=`));
  assert.match(decodeURIComponent(href), /Account email: ops@example\.com/);
  assert.match(decodeURIComponent(href), /Suggested next upgrade: Additional storage - \+10 GB for \$10\/mo/);
});

test("buildBillingUpgradeRequestBody does not echo unsupported billing classification strings", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "free",
      status: "trialing_internal",
      quota_state: "warning",
    },
    "owner@example.com",
  );

  assert.match(body, /Current billing status: unavailable/);
  assert.match(body, /Quota state: unavailable/);
  assert.doesNotMatch(body, /trialing_internal/);
  assert.doesNotMatch(body, /warning/);
});

test("buildBillingUpgradeRequestBody does not infer a concrete upgrade path from unsupported plan metadata", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "enterprise_custom",
      status: "active",
    },
    "owner@example.com",
  );

  assert.match(body, /Current plan: Plan metadata unavailable/);
  assert.match(body, /Suggested next upgrade: Retry billing status to confirm a supported plan id before inferring the next storage upgrade path\./);
  assert.doesNotMatch(body, /Enterprise Custom/);
  assert.doesNotMatch(body, /Additional storage - \+10 GB for \$10\/mo/);
});

test("buildBillingUpgradeRequestBody does not treat blank plan metadata as a confirmed free tier", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "   ",
      status: "active",
    },
    "owner@example.com",
  );

  assert.match(body, /Current plan: Plan metadata unavailable/);
  assert.match(body, /Suggested next upgrade: Retry billing status to confirm a supported plan id before inferring the next storage upgrade path\./);
  assert.doesNotMatch(body, /Current plan: Free/);
  assert.doesNotMatch(body, /Suggested next upgrade: Paid - 15 GB for \$20\/mo/);
});

test("buildBillingUpgradeRequestBody does not invent fallback storage capacity from unsupported plan metadata", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "enterprise_custom",
      status: "active",
      storage_used_bytes: 3 * 1024 * 1024 * 1024,
    },
    "owner@example.com",
  );

  assert.match(body, /Storage used: 3\.0 GB/);
  assert.match(body, /Storage remaining: Retry billing status to confirm live storage quota and remaining capacity\./);
  assert.doesNotMatch(body, /of 15\.0 GB/);
});

test("buildBillingUpgradeRequestBody does not invent zero storage usage from partial billing data", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "paid",
      status: "active",
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      quota_state: "ok",
    },
    "owner@example.com",
  );

  assert.match(body, /Storage used: unavailable/);
  assert.match(body, /Storage remaining: Retry billing status to confirm current storage usage, live storage quota, and remaining capacity\./);
  assert.doesNotMatch(body, /Storage used: 0 B/);
  assert.doesNotMatch(body, /Storage remaining: 12\.0 GB of 15\.0 GB/);
});

test("buildBillingUpgradeRequestBody does not invent remaining capacity from quota minus usage", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "paid",
      status: "active",
      storage_used_bytes: 3 * 1024 * 1024 * 1024,
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
      quota_state: "ok",
    },
    "owner@example.com",
  );

  assert.match(body, /Storage used: 3\.0 GB/);
  assert.match(body, /Storage remaining: Retry billing status to confirm live remaining capacity\./);
  assert.doesNotMatch(body, /Storage remaining: 12\.0 GB of 15\.0 GB/);
});

test("buildBillingUpgradeRequestBody does not invent total quota from plan fallback", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "paid",
      status: "active",
      storage_used_bytes: 3 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      quota_state: "ok",
    },
    "owner@example.com",
  );

  assert.match(body, /Storage used: 3\.0 GB/);
  assert.match(body, /Storage remaining: Retry billing status to confirm live storage quota\./);
  assert.doesNotMatch(body, /Storage remaining: 12\.0 GB of 15\.0 GB/);
});

test("buildBillingUpgradeRequestBody does not trust non-finite mounted storage numbers", () => {
  const body = buildBillingUpgradeRequestBody(
    {
      plan: "paid",
      status: "active",
      storage_used_bytes: Number.NaN,
      storage_quota_bytes: 15 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 12 * 1024 * 1024 * 1024,
      quota_state: "ok",
    },
    "owner@example.com",
  );

  assert.match(body, /Storage used: unavailable/);
  assert.match(body, /Storage remaining: Retry billing status to confirm current storage usage, live storage quota, and remaining capacity\./);
  assert.doesNotMatch(body, /Storage remaining: 12\.0 GB of 15\.0 GB/);
});
