import assert from "node:assert/strict";
import test from "node:test";

import {
  readBillingActionButtonLabel,
  readBillingPlanLabel,
  readBillingPortalState,
  readBillingStatusLabel,
  readCheckoutAvailabilityLabel,
  readPaymentSetupDetail,
  readPaymentSetupIdentityCardModels,
  readQuotaStateLabel,
  readRenewalSummary,
  readStripeCustomerLabel,
  readStripeSubscriptionLabel,
  readUpgradePathState,
} from "../src/lib/usageBillingSummaryState.ts";

test("readBillingPlanLabel gates missing and unsupported plan metadata", () => {
  assert.equal(readBillingPlanLabel({ hasBillingSnapshot: false, plan: "paid" }), "Unavailable");
  assert.equal(readBillingPlanLabel({ hasBillingSnapshot: true, plan: "" }), "Plan unavailable");
  assert.equal(readBillingPlanLabel({ hasBillingSnapshot: true, plan: "legacy_enterprise" }), "Plan metadata unavailable");
  assert.equal(readBillingPlanLabel({ hasBillingSnapshot: true, plan: "paid" }), "Paid");
});

test("readBillingStatusLabel respects loading and recognized statuses only", () => {
  assert.equal(readBillingStatusLabel({ loading: true, hasBillingSnapshot: false, status: null }), "Loading...");
  assert.equal(readBillingStatusLabel({ loading: false, hasBillingSnapshot: false, status: "active" }), "Unavailable");
  assert.equal(readBillingStatusLabel({ loading: false, hasBillingSnapshot: true, status: "mystery" }), "Status unavailable");
  assert.equal(readBillingStatusLabel({ loading: false, hasBillingSnapshot: true, status: "ACTIVE" }), "active");
});

test("readCheckoutAvailabilityLabel does not trust incomplete checkout signals", () => {
  assert.equal(
    readCheckoutAvailabilityLabel({
      hasBillingSnapshot: true,
      plan: "paid",
      checkoutAvailableKnown: false,
      checkoutAvailable: true,
    }),
    "unavailable",
  );
  assert.equal(
    readCheckoutAvailabilityLabel({
      hasBillingSnapshot: true,
      plan: "free",
      checkoutAvailableKnown: true,
      checkoutAvailable: false,
    }),
    "not configured",
  );
});

test("readQuotaStateLabel only returns recognized quota states", () => {
  assert.equal(readQuotaStateLabel({ hasBillingSnapshot: false, quotaState: "ok" }), "unavailable");
  assert.equal(readQuotaStateLabel({ hasBillingSnapshot: true, quotaState: "unknown" }), "unavailable");
  assert.equal(readQuotaStateLabel({ hasBillingSnapshot: true, quotaState: "EXCEEDED" }), "exceeded");
});

test("readRenewalSummary distinguishes free, paid, and missing renewal signals", () => {
  assert.deepEqual(
    readRenewalSummary({
      hasBillingSnapshot: true,
      plan: "free",
      renewalDateLabel: null,
    }),
    {
      label: "No renewal",
      detail: "Free workspaces do not have a paid subscription renewal date.",
    },
  );
  assert.deepEqual(
    readRenewalSummary({
      hasBillingSnapshot: true,
      plan: "paid",
      renewalDateLabel: null,
    }),
    {
      label: "Renewal unavailable",
      detail: "Retry billing status to confirm the Stripe subscription renewal date for this paid workspace.",
    },
  );
  assert.deepEqual(
    readRenewalSummary({
      hasBillingSnapshot: true,
      plan: "paid",
      renewalDateLabel: "8/30/2026",
    }),
    {
      label: "8/30/2026",
      detail: "Shown when Stripe subscription timing is present.",
    },
  );
});

test("readUpgradePathState returns the correct checkout and fallback messaging", () => {
  assert.deepEqual(
    readUpgradePathState({
      hasBillingSnapshot: true,
      plan: "free",
      checkoutAvailableKnown: true,
      checkoutAvailable: true,
    }),
    {
      headline: "Self-serve checkout is configured",
      detail: "Start a Stripe-hosted subscription checkout directly from the workspace. If Stripe is not configured for this deployment, the manual upgrade request fallback remains available.",
      manualRequestLabel: "Request upgrade",
      checkoutEligible: true,
    },
  );
  assert.deepEqual(
    readUpgradePathState({
      hasBillingSnapshot: true,
      plan: "paid",
      checkoutAvailableKnown: true,
      checkoutAvailable: false,
    }),
    {
      headline: "Manual fallback remains mounted",
      detail: "This deployment does not have self-serve Stripe checkout configured, so the prefilled workspace upgrade request remains the available path.",
      manualRequestLabel: "Request billing help",
      checkoutEligible: false,
    },
  );
});

test("readBillingPortalState returns configured and unavailable portal messaging", () => {
  assert.deepEqual(
    readBillingPortalState({
      hasBillingSnapshot: true,
      billingPortalAvailableKnown: true,
      billingPortalAvailable: true,
    }),
    {
      headline: "Self-serve portal path is configured",
      detail: "Open the Stripe-hosted customer portal to manage payment details and subscription state when a Stripe customer is already linked.",
    },
  );
  assert.deepEqual(
    readBillingPortalState({
      hasBillingSnapshot: true,
      billingPortalAvailableKnown: false,
      billingPortalAvailable: null,
    }),
    {
      headline: "Billing portal capability unavailable",
      detail: "Retry billing status to confirm whether this workspace has Stripe-hosted billing portal access.",
    },
  );
});

test("payment setup labels and identity cards stay centralized", () => {
  assert.equal(
    readStripeCustomerLabel({
      hasBillingSnapshot: true,
      customerIdLabel: "cus_1234",
    }),
    "cus_1234",
  );
  assert.equal(
    readStripeCustomerLabel({
      hasBillingSnapshot: false,
      customerIdLabel: "cus_1234",
    }),
    "Billing status unavailable",
  );
  assert.equal(
    readStripeSubscriptionLabel({
      hasBillingSnapshot: true,
      subscriptionIdLabel: "",
    }),
    "Stripe subscription unavailable",
  );
  assert.deepEqual(
    readPaymentSetupIdentityCardModels({
      stripeCustomerLabel: "cus_1234",
      stripeSubscriptionLabel: "sub_5678",
    }),
    [
      { title: "Stripe customer", value: "cus_1234" },
      { title: "Subscription", value: "sub_5678" },
    ],
  );
});

test("readPaymentSetupDetail summarizes Stripe readiness conservatively", () => {
  assert.equal(
    readPaymentSetupDetail({
      hasBillingSnapshot: false,
      checkoutAvailableKnown: false,
      billingPortalAvailableKnown: false,
      hasStripeCustomerSignal: false,
      hasStripeSubscriptionSignal: false,
    }),
    "Retry billing status to confirm whether Stripe-backed checkout, customer-portal handoff, billing-state storage, and webhook-driven subscription sync are available for this workspace.",
  );
  assert.equal(
    readPaymentSetupDetail({
      hasBillingSnapshot: true,
      checkoutAvailableKnown: true,
      billingPortalAvailableKnown: false,
      hasStripeCustomerSignal: true,
      hasStripeSubscriptionSignal: true,
    }),
    "Billing status is mounted, but some Stripe capability and linkage signals are still incomplete. Retry billing status to confirm checkout, portal access, and subscription sync state.",
  );
  assert.equal(
    readPaymentSetupDetail({
      hasBillingSnapshot: true,
      checkoutAvailableKnown: true,
      billingPortalAvailableKnown: true,
      hasStripeCustomerSignal: true,
      hasStripeSubscriptionSignal: true,
    }),
    "Billing status confirms the current Stripe-backed checkout, customer-portal handoff, billing-state storage, and webhook-driven subscription sync signals for this workspace.",
  );
});

test("readBillingActionButtonLabel reflects busy state for payment actions", () => {
  assert.equal(readBillingActionButtonLabel("checkout", "checkout"), "Opening checkout...");
  assert.equal(readBillingActionButtonLabel("checkout", null), "Start checkout");
  assert.equal(readBillingActionButtonLabel("copy", "copy"), "Copying...");
  assert.equal(readBillingActionButtonLabel("copy", null), "Copy request details");
  assert.equal(readBillingActionButtonLabel("portal", "portal"), "Opening portal...");
  assert.equal(readBillingActionButtonLabel("portal", null), "Open billing portal");
});
