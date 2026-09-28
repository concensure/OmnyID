import assert from "node:assert/strict";
import test from "node:test";

import {
  readBillingDerivedState,
  readBillingPaymentSetupModel,
  readBillingSummaryCards,
  readBillingStatusMessage,
  readBillingStoragePolicyModel,
  readBillingUsageSectionModel,
  readWorkspaceOperationalGuidanceCardModel,
} from "../src/lib/billingUsageSectionState.ts";

test("billing derived state centralizes plan, storage, and payment labels", () => {
  const derived = readBillingDerivedState({
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
    sessionEmail: "user@example.com",
  });

  assert.equal(derived.hasBillingSnapshot, true);
  assert.equal(derived.hasCheckoutAvailabilitySignal, true);
  assert.equal(derived.hasArchiveOnlyModeSignal, true);
  assert.equal(derived.canStartSelfServeCheckout, true);
  assert.equal(derived.planLabel, "Free");
  assert.equal(derived.billingStatusLabel, "active");
  assert.equal(derived.checkoutAvailabilityLabel, "available");
  assert.equal(derived.storageUsageLabel, "1.0 KB");
  assert.equal(derived.quotaStateLabel, "ok");
  assert.equal(derived.nextUpgradeLabel, "Paid - 15 GB for $20/mo");
  assert.equal(derived.upgradePathHeadline, "Self-serve checkout is configured");
  assert.equal(derived.manualRequestLabel, "Request upgrade");
  assert.equal(derived.billingPortalHeadline, "Not configured on this deployment");
  assert.equal(derived.billingPortalAvailable, false);
  assert.deepEqual(derived.paymentSetupIdentityCards, [{
    title: "Stripe customer",
    value: "cus_...7890",
  }, {
    title: "Subscription",
    value: "Not connected",
  }]);
  assert.match(derived.storageUsageDetail, /Retry billing status to confirm storage quota/i);
  assert.match(derived.paymentSetupDetail, /Stripe-backed checkout/i);
  assert.match(derived.upgradeMailtoHref, /^mailto:hello@omnyid\.com\?/);

  assert.equal(
    readBillingDerivedState({
      billing: null,
      billingLoading: false,
      sessionEmail: null,
    }).storageUsageLabel,
    "Billing status unavailable",
  );
});

test("billing summary cards and workspace guidance stay centralized", () => {
  assert.deepEqual(
    readBillingSummaryCards({
      planLabel: "Pro",
      billingStatusLabel: "active",
      checkoutAvailabilityLabel: "enabled",
      storageUsageLabel: "2.4 GB",
      storageUsageDetail: "Within quota.",
      renewalLabel: "9/30/2026",
      renewalDetail: "Renews monthly.",
    }),
    [{
      title: "Current plan",
      value: "Pro",
      detailLines: ["Status: active", "Self-serve checkout: enabled"],
    }, {
      title: "Storage usage",
      value: "2.4 GB",
      detailLines: ["Within quota."],
    }, {
      title: "Renewal",
      value: "9/30/2026",
      detailLines: ["Renews monthly."],
    }],
  );

  assert.deepEqual(
    readWorkspaceOperationalGuidanceCardModel({
      tone: "warning",
      title: "Storage pressure detected",
      detail: "Archive-only mode is available.",
      artifactSummary: "Updated 8/31/2026, 8:00:00 PM | daemon_heartbeats",
      command: "./cleanup.ps1",
    }),
    {
      tone: "warning",
      title: "Storage pressure detected",
      detail: "Archive-only mode is available.",
      artifactSummary: "Updated 8/31/2026, 8:00:00 PM | daemon_heartbeats",
      command: "./cleanup.ps1",
      copyButtonLabel: "Copy cleanup command",
    },
  );
  assert.equal(
    readWorkspaceOperationalGuidanceCardModel({
      tone: null,
      title: null,
      detail: null,
      artifactSummary: null,
      command: null,
    }),
    null,
  );
  assert.deepEqual(
    readBillingStatusMessage({
      tone: "warning",
      title: "Billing sync issue",
      summary: " Billing status endpoint failed. ",
      detail: " Retry later. ",
    }),
    {
      tone: "warning",
      title: "Billing sync issue",
      summary: "Billing status endpoint failed.",
      detail: "Retry later.",
    },
  );
  assert.equal(
    readBillingStatusMessage({
      tone: "info",
      summary: "   ",
    }),
    null,
  );
  assert.deepEqual(
    readBillingStoragePolicyModel({
      storageTierLabel: "Standard",
      quotaStateLabel: "within quota",
      nextUpgradeLabel: "Next upgrade: Pro+",
      archiveOnlyToggleLabel: "Enable archive-only mode",
      archiveOnlyActiveLabel: "Archive-only mode inactive",
      archiveOnlyWarningText: null,
      showWarning: true,
      toggleDisabled: false,
      onToggle: () => {},
    }).storageTierLabel,
    "Standard",
  );
  assert.deepEqual(
    readBillingPaymentSetupModel({
      detail: "Stripe customer and subscription are mounted.",
      identityCards: [{
        title: "Stripe customer",
        value: "cus_1234",
      }],
      upgradePathHeadline: "Self-serve checkout available",
      upgradePathDetail: "Upgrade can proceed through Stripe checkout.",
      manualRequestLabel: "Request enterprise plan",
      canStartSelfServeCheckout: true,
      hasCheckoutAvailabilitySignal: true,
      upgradeMailtoHref: "mailto:test@example.com",
      checkoutButtonLabel: "Upgrade with Stripe",
      copyButtonLabel: "Copy upgrade request",
      billingPortalHeadline: "Billing portal available",
      billingPortalDetail: "Manage subscription in Stripe.",
      billingPortalAvailable: true,
      portalButtonLabel: "Open billing portal",
      actionsDisabled: false,
      onStartCheckout: () => {},
      onCopyUpgradeRequest: () => {},
      onOpenBillingPortal: () => {},
    }).upgradePathHeadline,
    "Self-serve checkout available",
  );
});

test("billing usage section builder preserves the mounted section contract", () => {
  const onCopyOperationalCommand = () => {};
  const onToggle = () => {};
  const onStartCheckout = () => {};
  const onCopyUpgradeRequest = () => {};
  const onOpenBillingPortal = () => {};

  const model = readBillingUsageSectionModel({
      summaryCards: [{
        title: "Current plan",
        value: "Pro",
        detailLines: ["Status: active", "Self-serve checkout: enabled"],
      }],
      billingLoadWarning: null,
      operationalGuidance: {
        tone: "warning",
        title: "Storage pressure detected",
        detail: "Archive-only mode is available.",
        artifactSummary: "Updated 8/31/2026, 8:00:00 PM | daemon_heartbeats",
        command: "./cleanup.ps1",
        copyButtonLabel: "Copy cleanup command",
      },
      onCopyOperationalCommand,
      modeError: null,
      billingActionError: null,
      upgradeNotice: {
        tone: "info",
        summary: "Upgrade request copied.",
      },
      operationalCommandNotice: {
        tone: "info",
        summary: "Cleanup command copied.",
      },
      storagePolicy: {
        storageTierLabel: "Standard",
        quotaStateLabel: "within quota",
        nextUpgradeLabel: "Next upgrade: Pro+",
        archiveOnlyToggleLabel: "Enable archive-only mode",
        archiveOnlyActiveLabel: "Archive-only mode inactive",
        archiveOnlyWarningText: null,
        showWarning: true,
        toggleDisabled: false,
        onToggle,
      },
      paymentSetup: {
        detail: "Stripe customer and subscription are mounted.",
        identityCards: [{
          title: "Stripe customer",
          value: "cus_1234",
        }],
        upgradePathHeadline: "Self-serve checkout available",
        upgradePathDetail: "Upgrade can proceed through Stripe checkout.",
        manualRequestLabel: "Request enterprise plan",
        canStartSelfServeCheckout: true,
        hasCheckoutAvailabilitySignal: true,
        upgradeMailtoHref: "mailto:test@example.com",
        checkoutButtonLabel: "Upgrade with Stripe",
        copyButtonLabel: "Copy upgrade request",
        billingPortalHeadline: "Billing portal available",
        billingPortalDetail: "Manage subscription in Stripe.",
        billingPortalAvailable: true,
        portalButtonLabel: "Open billing portal",
        actionsDisabled: false,
        onStartCheckout,
        onCopyUpgradeRequest,
        onOpenBillingPortal,
      },
    });

  assert.equal(model.onCopyOperationalCommand, onCopyOperationalCommand);
  assert.equal(model.storagePolicy.onToggle, onToggle);
  assert.equal(model.paymentSetup.onStartCheckout, onStartCheckout);
  assert.equal(model.paymentSetup.onCopyUpgradeRequest, onCopyUpgradeRequest);
  assert.equal(model.paymentSetup.onOpenBillingPortal, onOpenBillingPortal);

  assert.deepEqual(
    {
      ...model,
      onCopyOperationalCommand: null,
      storagePolicy: {
        ...model.storagePolicy,
        onToggle: null,
      },
      paymentSetup: {
        ...model.paymentSetup,
        onStartCheckout: null,
        onCopyUpgradeRequest: null,
        onOpenBillingPortal: null,
      },
    },
    {
      summaryCards: [{
        title: "Current plan",
        value: "Pro",
        detailLines: ["Status: active", "Self-serve checkout: enabled"],
      }],
      billingLoadWarning: null,
      operationalGuidance: {
        tone: "warning",
        title: "Storage pressure detected",
        detail: "Archive-only mode is available.",
        artifactSummary: "Updated 8/31/2026, 8:00:00 PM | daemon_heartbeats",
        command: "./cleanup.ps1",
        copyButtonLabel: "Copy cleanup command",
      },
      onCopyOperationalCommand: null,
      modeError: null,
      billingActionError: null,
      upgradeNotice: {
        tone: "info",
        summary: "Upgrade request copied.",
      },
      operationalCommandNotice: {
        tone: "info",
        summary: "Cleanup command copied.",
      },
      storagePolicy: {
        storageTierLabel: "Standard",
        quotaStateLabel: "within quota",
        nextUpgradeLabel: "Next upgrade: Pro+",
        archiveOnlyToggleLabel: "Enable archive-only mode",
        archiveOnlyActiveLabel: "Archive-only mode inactive",
        archiveOnlyWarningText: null,
        showWarning: true,
        toggleDisabled: false,
        onToggle: null,
      },
      paymentSetup: {
        detail: "Stripe customer and subscription are mounted.",
        identityCards: [{
          title: "Stripe customer",
          value: "cus_1234",
        }],
        upgradePathHeadline: "Self-serve checkout available",
        upgradePathDetail: "Upgrade can proceed through Stripe checkout.",
        manualRequestLabel: "Request enterprise plan",
        canStartSelfServeCheckout: true,
        hasCheckoutAvailabilitySignal: true,
        upgradeMailtoHref: "mailto:test@example.com",
        checkoutButtonLabel: "Upgrade with Stripe",
        copyButtonLabel: "Copy upgrade request",
        billingPortalHeadline: "Billing portal available",
        billingPortalDetail: "Manage subscription in Stripe.",
        billingPortalAvailable: true,
        portalButtonLabel: "Open billing portal",
        actionsDisabled: false,
        onStartCheckout: null,
        onCopyUpgradeRequest: null,
        onOpenBillingPortal: null,
      },
    },
  );
});
