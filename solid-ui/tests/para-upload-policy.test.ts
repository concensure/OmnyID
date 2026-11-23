import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateParaUploadPreflight,
  hasMountedParaStorageSummary,
  hasMountedParaUploadPolicy,
  paraUploadStorageSummary,
  readMountedWarningText,
} from "../src/lib/paraUploadPolicy.ts";

test("readMountedWarningText rejects blank warning copy", () => {
  assert.equal(readMountedWarningText("   "), null);
  assert.equal(readMountedWarningText("\n  quota exceeded \t"), "quota exceeded");
});

test("hasMountedParaUploadPolicy only trusts complete upload policy snapshots", () => {
  assert.equal(hasMountedParaUploadPolicy(null), false);
  assert.equal(
    hasMountedParaUploadPolicy({
      plan: "free",
      status: "active",
      quota_state: "ok",
      max_single_upload_bytes: 25 * 1024 * 1024,
    }),
    false,
  );
  assert.equal(
    hasMountedParaUploadPolicy({
      plan: "free",
      status: "active",
      archive_only_enabled: false,
      quota_state: "ok",
      max_single_upload_bytes: 25 * 1024 * 1024,
    }),
    true,
  );
});

test("para upload preflight blocks uploads when quota is exceeded", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "paid",
      status: "active",
      archive_only_enabled: false,
      max_single_upload_bytes: 100 * 1024 * 1024,
      quota_state: "exceeded",
      archive_only_warning: "Quota exceeded. Upgrade or switch to archive-only mode.",
    },
    [{ name: "notes.pdf", size: 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason: "Quota exceeded. Upgrade or switch to archive-only mode.",
  });
});

test("para upload preflight blocks uploads when archive-only mode is active", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "paid",
      status: "active",
      archive_only_enabled: true,
      max_single_upload_bytes: 100 * 1024 * 1024,
      quota_state: "ok",
      archive_only_warning: "Archive-only mode is active. Uploads stay blocked until the mode is disabled.",
    },
    [{ name: "notes.pdf", size: 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason: "Archive-only mode is active. Uploads stay blocked until the mode is disabled.",
  });
});

test("para upload preflight does not trust whitespace-only archive-only warnings", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "paid",
      status: "active",
      archive_only_enabled: true,
      max_single_upload_bytes: 100 * 1024 * 1024,
      quota_state: "ok",
      archive_only_warning: "   ",
    },
    [{ name: "notes.pdf", size: 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason:
      "Archive-only mode is active. Stored material remains accessible, but uploads stay blocked until archive-only mode is disabled or storage headroom is restored.",
  });
});

test("para upload preflight blocks files above the account upload limit", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "free",
      status: "active",
      archive_only_enabled: false,
      max_single_upload_bytes: 25 * 1024 * 1024,
      quota_state: "ok",
    },
    [{ name: "large-video.mov", size: 26 * 1024 * 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason: "large-video.mov exceeds the current single-upload limit of 25 MB for this account.",
  });
});

test("para upload preflight does not trust whitespace-only quota warnings", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "paid",
      status: "active",
      archive_only_enabled: false,
      max_single_upload_bytes: 100 * 1024 * 1024,
      quota_state: "exceeded",
      archive_only_warning: "   ",
    },
    [{ name: "notes.pdf", size: 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason: "Storage quota exceeded. Upgrade storage or switch to archive-only mode before uploading more files.",
  });
});

test("para upload preflight allows in-policy uploads", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "paid",
      status: "active",
      archive_only_enabled: false,
      max_single_upload_bytes: 100 * 1024 * 1024,
      quota_state: "ok",
    },
    [
      { name: "brief.md", size: 32 * 1024 },
      { name: "deck.pdf", size: 12 * 1024 * 1024 },
    ],
  );

  assert.deepEqual(result, { allowed: true });
});

test("para upload storage summary reflects live billing values", () => {
  assert.equal(
    paraUploadStorageSummary({
      plan: "paid",
      status: "active",
      storage_used_bytes: 9 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 6 * 1024 * 1024 * 1024,
      max_single_upload_bytes: 100 * 1024 * 1024,
    }),
    "9.0 GB used | 6.0 GB remaining | max single upload 100 MB",
  );
});

test("hasMountedParaStorageSummary only trusts complete mounted storage usage snapshots", () => {
  assert.equal(hasMountedParaStorageSummary(null), false);
  assert.equal(
    hasMountedParaStorageSummary({
      plan: "paid",
      status: "active",
      storage_used_bytes: 9 * 1024 * 1024 * 1024,
      max_single_upload_bytes: 100 * 1024 * 1024,
    }),
    false,
  );
  assert.equal(
    hasMountedParaStorageSummary({
      plan: "paid",
      status: "active",
      storage_used_bytes: 9 * 1024 * 1024 * 1024,
      storage_remaining_bytes: 6 * 1024 * 1024 * 1024,
      max_single_upload_bytes: 100 * 1024 * 1024,
    }),
    true,
  );
});

test("para upload storage summary does not invent zero values from partial billing data", () => {
  assert.equal(
    paraUploadStorageSummary({
      plan: "paid",
      status: "active",
      storage_used_bytes: 9 * 1024 * 1024 * 1024,
    }),
    "Uploads are still allowed under the confirmed storage policy, but storage usage data is incomplete. Use Retry storage policy for fully trusted storage usage data, remaining capacity, and max upload size.",
  );
});

test("para upload storage summary does not trust non-finite mounted storage values", () => {
  assert.equal(
    paraUploadStorageSummary({
      plan: "paid",
      status: "active",
      storage_used_bytes: Number.NaN,
      storage_remaining_bytes: 6 * 1024 * 1024 * 1024,
      max_single_upload_bytes: Number.POSITIVE_INFINITY,
    }),
    "Uploads are still allowed under the confirmed storage policy, but storage usage data is incomplete. Use Retry storage policy for fully trusted storage usage data, remaining capacity, and max upload size.",
  );
});

test("para upload preflight blocks uploads until storage policy is mounted", () => {
  const result = evaluateParaUploadPreflight(
    null,
    [{ name: "large-video.mov", size: 26 * 1024 * 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason:
      "Use Retry storage policy before importing files so PARA upload eligibility and single-upload limits are trusted.",
  });
});

test("para upload preflight blocks uploads when archive-only mode signal is missing", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "free",
      status: "active",
      quota_state: "ok",
      max_single_upload_bytes: 25 * 1024 * 1024,
    },
    [{ name: "large-video.mov", size: 26 * 1024 * 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason:
      "Use Retry storage policy before importing files so PARA upload eligibility and single-upload limits are trusted.",
  });
});

test("para upload preflight blocks uploads when quota state is unsupported", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "free",
      status: "active",
      archive_only_enabled: false,
      quota_state: "degraded",
      max_single_upload_bytes: 25 * 1024 * 1024,
    },
    [{ name: "large-video.mov", size: 26 * 1024 * 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason:
      "Use Retry storage policy before importing files so PARA upload eligibility and single-upload limits are trusted.",
  });
});

test("para upload preflight blocks uploads when mounted upload limit is non-finite", () => {
  const result = evaluateParaUploadPreflight(
    {
      plan: "free",
      status: "active",
      archive_only_enabled: false,
      quota_state: "ok",
      max_single_upload_bytes: Number.POSITIVE_INFINITY,
    },
    [{ name: "large-video.mov", size: 26 * 1024 * 1024 }],
  );

  assert.deepEqual(result, {
    allowed: false,
    reason:
      "Use Retry storage policy before importing files so PARA upload eligibility and single-upload limits are trusted.",
  });
});
