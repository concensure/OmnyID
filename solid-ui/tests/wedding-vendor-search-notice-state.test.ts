import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingVendorSearchExecutionNoticeState,
  buildWeddingVendorSearchNoticeState,
} from "../src/lib/weddingVendorSearchNoticeState.ts";

test("vendor search notice appends bounded provider failure details", () => {
  const notice = buildWeddingVendorSearchNoticeState({
    ok: false,
    message: "No live vendor sources were returned.",
    receiptMetadata: {
      failed_messages: [
        "Google Places returned 403: API key is not authorized for Places API.",
        "Brave Search returned 429: quota exceeded.",
      ],
    },
  });

  assert.match(notice, /No live vendor sources were returned/);
  assert.match(notice, /Provider detail:/);
  assert.match(notice, /Google Places returned 403/);
  assert.match(notice, /Brave Search returned 429/);
});

test("vendor search notice does not duplicate failure already in message", () => {
  const notice = buildWeddingVendorSearchNoticeState({
    ok: false,
    message: "No live vendor sources were returned. Google Places returned 403: disabled.",
    receiptMetadata: {
      failed_messages: ["Google Places returned 403: disabled."],
    },
  });

  assert.equal(
    notice,
    "No live vendor sources were returned. Google Places returned 403: disabled.",
  );
});

test("vendor search notice hides provider failures when fallback returned usable sources", () => {
  const notice = buildWeddingVendorSearchNoticeState({
    ok: true,
    message: "Vendor search completed with 3 sources.",
    sourceCount: 3,
    providerLabel: "Brave Search",
    receiptMetadata: {
      failed_messages: ["Google Places returned 403: disabled."],
    },
  });

  assert.equal(notice, "Vendor search completed with 3 sources.");
});

test("vendor search notice treats successful zero-source responses as actionable", () => {
  const notice = buildWeddingVendorSearchNoticeState({
    ok: true,
    message: "",
    sourceCount: 0,
    providerLabel: "Google Places",
    receiptMetadata: {
      failed_messages: ["Google Places returned zero candidate venues for the requested area."],
    },
  });

  assert.match(notice, /No live vendor sources were returned/);
  assert.match(notice, /zero candidate venues/i);
});

test("vendor search notice bounds noisy provider diagnostics", () => {
  const noisy = Array.from({ length: 80 }, (_, index) => `provider-detail-${index}`).join(" ");
  const notice = buildWeddingVendorSearchNoticeState({
    ok: false,
    message: "",
    receiptMetadata: {
      failed_messages: [noisy],
    },
  });

  assert.ok(notice.length <= 280);
  assert.match(notice, /No live vendor sources were returned/);
});

test("vendor search execution notice gives component failures a non-empty fallback", () => {
  const notice = buildWeddingVendorSearchExecutionNoticeState({
    status: "failed",
    message: "",
    sourceCount: 0,
    providerLabel: "Admin wedding search stack",
    receiptMetadata: {
      failed_messages: ["Live provider-specific vendor-search executor is not connected."],
    },
  });

  assert.match(notice, /No live vendor sources were returned/);
  assert.match(notice, /executor is not connected/i);
});

test("vendor search execution notice treats executed zero-source results as not ready", () => {
  const notice = buildWeddingVendorSearchExecutionNoticeState({
    status: "executed",
    message: "",
    sourceCount: 0,
    providerLabel: "Admin wedding search stack",
    receiptMetadata: {},
  });

  assert.match(notice, /No live vendor sources were returned/);
});
