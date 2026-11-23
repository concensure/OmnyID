import assert from "node:assert/strict";
import test from "node:test";

import { readUsageViewBillingMountedSectionProps } from "../src/lib/usageViewBillingMountedState.ts";

test("readUsageViewBillingMountedSectionProps assembles the mounted billing section contract", () => {
  const onCopyOperationalCommand = () => {};
  const onToggleArchiveOnlyMode = (_enabled: boolean) => {};
  const onStartCheckout = () => {};
  const onCopyUpgradeRequest = () => {};
  const onOpenBillingPortal = () => {};

  const props = readUsageViewBillingMountedSectionProps({
    billing: {
      plan: "free",
      status: "active",
      checkout_available: true,
      billing_portal_available: false,
      archive_only_enabled: false,
      storage_used_bytes: 1024,
      storage_quota_bytes: 2048,
      quota_state: "ok",
      stripe_customer_id: "cus_1234567890",
      stripe_subscription_id: null,
      current_period_end: "2026-09-30T00:00:00.000Z",
    },
    billingLoading: false,
    billingError: null,
    sessionEmail: "user@example.com",
    modeSaving: false,
    billingActionBusy: null,
    modeError: null,
    billingActionError: null,
    upgradeActionNotice: "Upgrade request copied.",
    operationalCommandNotice: "Cleanup command copied.",
    onCopyOperationalCommand,
    onToggleArchiveOnlyMode,
    onStartCheckout,
    onCopyUpgradeRequest,
    onOpenBillingPortal,
    formatArtifactSummary: ({ artifactUpdatedLabel, source }) =>
      artifactUpdatedLabel || source ? `${artifactUpdatedLabel ?? "unknown"} | ${source ?? "unknown"}` : null,
  });

  assert.equal(props.onCopyOperationalCommand, onCopyOperationalCommand);
  assert.equal(props.storagePolicy.onToggle instanceof Function, true);
  assert.equal(props.paymentSetup.onStartCheckout, onStartCheckout);
  assert.equal(props.paymentSetup.onCopyUpgradeRequest, onCopyUpgradeRequest);
  assert.equal(props.paymentSetup.onOpenBillingPortal, onOpenBillingPortal);
  assert.equal(props.summaryCards[0]?.value, "Free");
  assert.equal(props.paymentSetup.checkoutButtonLabel, "Start checkout");
  assert.equal(props.operationalCommandNotice?.summary, "Cleanup command copied.");
  assert.equal(props.upgradeNotice?.summary, "Upgrade request copied.");
});

test("readUsageViewBillingMountedSectionProps exposes mounted billing warnings and disables actions conservatively", () => {
  const props = readUsageViewBillingMountedSectionProps({
    billing: null,
    billingLoading: false,
    billingError: new Error("down"),
    sessionEmail: null,
    modeSaving: true,
    billingActionBusy: "portal",
    modeError: {
      tone: "danger",
      title: "Archive mode failed",
      summary: "Could not update archive-only mode.",
      nextStep: "Retry from the same usage view.",
    },
    billingActionError: {
      tone: "warning",
      title: "Portal unavailable",
      summary: "The billing request did not complete successfully.",
      nextStep: "Retry later.",
    },
    upgradeActionNotice: null,
    operationalCommandNotice: null,
    onCopyOperationalCommand: () => {},
    onToggleArchiveOnlyMode: (_enabled: boolean) => {},
    onStartCheckout: () => {},
    onCopyUpgradeRequest: () => {},
    onOpenBillingPortal: () => {},
    formatArtifactSummary: () => null,
  });

  assert.equal(props.billingLoadWarning?.summary, "Unable to load billing status right now. Billing controls are mounted, but the status endpoint returned an error.");
  assert.equal(props.modeError?.title, "Archive mode failed");
  assert.equal(props.billingActionError?.title, "Portal unavailable");
  assert.equal(props.storagePolicy.toggleDisabled, true);
  assert.equal(props.paymentSetup.actionsDisabled, true);
  assert.equal(props.paymentSetup.portalButtonLabel, "Opening portal...");
});
