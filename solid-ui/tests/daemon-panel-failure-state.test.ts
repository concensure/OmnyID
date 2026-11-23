import test from "node:test";
import assert from "node:assert/strict";
import { buildDaemonPanelFailureReceipt } from "../src/lib/daemonPanelFailureState.ts";

test("buildDaemonPanelFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildDaemonPanelFailureReceipt("Load daemons", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildDaemonPanelFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildDaemonPanelFailureReceipt("Load heartbeat", "network error while fetching heartbeat");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
