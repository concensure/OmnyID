import test from "node:test";
import assert from "node:assert/strict";

import {
  copyUsageViewOperationalCommand,
  copyUsageViewUpgradeRequest,
  openUsageViewBillingPortal,
  startUsageViewCheckout,
  type UsageViewRequestCounter,
} from "../src/lib/usageViewBillingActionHandlers.ts";
import type { UsageViewFailureReceipt } from "../src/lib/usageViewFailureState.ts";

function createBillingSetters() {
  const calls: string[] = [];
  const modeErrors: Array<UsageViewFailureReceipt | null> = [];
  const upgradeNotices: Array<string | null> = [];
  const billingErrors: Array<UsageViewFailureReceipt | null> = [];
  const busyStates: Array<"checkout" | "portal" | "copy" | null> = [];
  return {
    calls,
    modeErrors,
    upgradeNotices,
    billingErrors,
    busyStates,
    setModeError: (value: UsageViewFailureReceipt | null) => {
      calls.push(`mode:${value ? value.title : "null"}`);
      modeErrors.push(value);
    },
    setUpgradeActionNotice: (value: string | null) => {
      calls.push(`notice:${value ?? "null"}`);
      upgradeNotices.push(value);
    },
    setBillingActionError: (value: UsageViewFailureReceipt | null) => {
      calls.push(`error:${value ? value.title : "null"}`);
      billingErrors.push(value);
    },
    setBillingActionBusy: (value: "checkout" | "portal" | "copy" | null) => {
      calls.push(`busy:${value ?? "null"}`);
      busyStates.push(value);
    },
  };
}

test("copyUsageViewUpgradeRequest applies clipboard unavailable and success states safely", async () => {
  const requestCounter: UsageViewRequestCounter = { current: 4 };
  const unavailable = createBillingSetters();
  await copyUsageViewUpgradeRequest({
    billing: null,
    sessionEmail: "user@example.com",
    guardState: { modeSaving: false, billingActionBusy: null },
    requestCounter,
    writeText: null,
    setModeError: unavailable.setModeError,
    setUpgradeActionNotice: unavailable.setUpgradeActionNotice,
    setBillingActionError: unavailable.setBillingActionError,
    setBillingActionBusy: unavailable.setBillingActionBusy,
  });
  assert.equal(requestCounter.current, 5);
  assert.deepEqual(unavailable.busyStates, ["copy", null]);
  assert.equal(unavailable.billingErrors.at(-1)?.title, "Copy upgrade request needs browser clipboard access");

  const success = createBillingSetters();
  const writes: string[] = [];
  await copyUsageViewUpgradeRequest({
    billing: null,
    sessionEmail: "user@example.com",
    guardState: { modeSaving: false, billingActionBusy: null },
    requestCounter,
    writeText: async (value) => {
      writes.push(value);
    },
    setModeError: success.setModeError,
    setUpgradeActionNotice: success.setUpgradeActionNotice,
    setBillingActionError: success.setBillingActionError,
    setBillingActionBusy: success.setBillingActionBusy,
  });
  assert.equal(requestCounter.current, 6);
  assert.equal(writes.length, 1);
  assert.equal(success.upgradeNotices.at(-1), "Upgrade request details copied.");
  assert.deepEqual(success.busyStates, ["copy", null]);
});

test("billing redirect handlers centralize busy-reset and failure behavior", async () => {
  const checkoutSetters = createBillingSetters();
  const checkoutCounter: UsageViewRequestCounter = { current: 10 };
  let redirectedTo: string | null = null;
  await startUsageViewCheckout({
    guardState: { modeSaving: false, billingActionBusy: null },
    requestCounter: checkoutCounter,
    createSession: async () => ({ url: "https://example.com/checkout" }),
    redirectTo: (url) => {
      redirectedTo = url;
    },
    setModeError: checkoutSetters.setModeError,
    setUpgradeActionNotice: checkoutSetters.setUpgradeActionNotice,
    setBillingActionError: checkoutSetters.setBillingActionError,
    setBillingActionBusy: checkoutSetters.setBillingActionBusy,
  });
  assert.equal(redirectedTo, "https://example.com/checkout");
  assert.deepEqual(checkoutSetters.busyStates, ["checkout", null]);

  const portalSetters = createBillingSetters();
  const portalCounter: UsageViewRequestCounter = { current: 12 };
  await openUsageViewBillingPortal({
    guardState: { modeSaving: false, billingActionBusy: null },
    requestCounter: portalCounter,
    createSession: async () => {
      throw new Error("portal down");
    },
    redirectTo: () => {
      throw new Error("should not redirect");
    },
    setModeError: portalSetters.setModeError,
    setUpgradeActionNotice: portalSetters.setUpgradeActionNotice,
    setBillingActionError: portalSetters.setBillingActionError,
    setBillingActionBusy: portalSetters.setBillingActionBusy,
  });
  assert.equal(portalSetters.billingErrors.at(-1)?.title, "Open billing portal failed");
  assert.deepEqual(portalSetters.busyStates, ["portal", null, null]);
});

test("copyUsageViewOperationalCommand preserves copy semantics and failures", async () => {
  const requestCounter: UsageViewRequestCounter = { current: 1 };
  const notices: Array<string | null> = [];
  const errors: Array<UsageViewFailureReceipt | null> = [];
  await copyUsageViewOperationalCommand({
    command: "   ./cleanup.ps1   ",
    label: "operator",
    guardState: { modeSaving: false, billingActionBusy: null },
    requestCounter,
    writeText: async () => {
      throw new Error("clipboard denied");
    },
    setOperationalCommandNotice: (value) => {
      notices.push(value);
    },
    setBillingActionError: (value) => {
      errors.push(value);
    },
  });
  assert.equal(requestCounter.current, 2);
  assert.equal(notices[0], null);
  assert.equal(errors.at(-1)?.title, "Copy cleanup command needs browser clipboard access");
});
