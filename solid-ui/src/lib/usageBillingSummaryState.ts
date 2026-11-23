// @locs-version: 1.0
import { hasRecognizedPlanMetadata, normalizePlanId } from "./pricing";
import { hasRecognizedBillingStatus, hasRecognizedQuotaState } from "./billingStateMetadata";

function formatPlan(plan: string | undefined) {
  const raw = String(plan || "free").trim();
  if (!raw) return "Free";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasMountedText(value: string | null | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

function normalizeMountedText(value: string | null | undefined): string | null {
  return hasMountedText(value) ? String(value).trim() : null;
}

export function readBillingPlanLabel(args: {
  hasBillingSnapshot: boolean;
  plan: string | null | undefined;
}): string {
  if (!args.hasBillingSnapshot) return "Unavailable";
  if (!hasMountedText(args.plan)) return "Plan unavailable";
  if (!hasRecognizedPlanMetadata(args.plan)) return "Plan metadata unavailable";
  return formatPlan(args.plan ?? undefined);
}

export function readBillingStatusLabel(args: {
  loading: boolean;
  hasBillingSnapshot: boolean;
  status: string | null | undefined;
}): string {
  if (args.loading) return "Loading...";
  if (!args.hasBillingSnapshot) return "Unavailable";
  if (!hasRecognizedBillingStatus(args.status)) return "Status unavailable";
  return args.status!.trim().toLowerCase();
}

export function readCheckoutAvailabilityLabel(args: {
  hasBillingSnapshot: boolean;
  plan: string | null | undefined;
  checkoutAvailableKnown: boolean;
  checkoutAvailable: boolean | null | undefined;
}): string {
  if (!args.hasBillingSnapshot || !args.checkoutAvailableKnown) return "unavailable";
  if (!hasMountedText(args.plan) || !hasRecognizedPlanMetadata(args.plan)) return "unavailable";
  return args.checkoutAvailable ? "available" : "not configured";
}

export function readQuotaStateLabel(args: {
  hasBillingSnapshot: boolean;
  quotaState: string | null | undefined;
}): string {
  if (!args.hasBillingSnapshot) return "unavailable";
  if (!hasRecognizedQuotaState(args.quotaState)) return "unavailable";
  return args.quotaState!.trim().toLowerCase();
}

export function readRenewalSummary(args: {
  hasBillingSnapshot: boolean;
  plan: string | null | undefined;
  renewalDateLabel: string | null | undefined;
}): {
  label: string;
  detail: string;
} {
  if (!args.hasBillingSnapshot) {
    return {
      label: "Unavailable",
      detail: "Retry billing status to confirm subscription timing and renewal details.",
    };
  }
  if (!hasMountedText(args.plan)) {
    return {
      label: "Renewal unavailable",
      detail: "Retry billing status to confirm the current plan before trusting renewal timing.",
    };
  }
  if (!hasRecognizedPlanMetadata(args.plan) && !hasMountedText(args.renewalDateLabel)) {
    return {
      label: "Renewal unavailable",
      detail: "Retry billing status to confirm a supported plan id before inferring paid subscription renewal timing.",
    };
  }
  if (normalizePlanId(args.plan) === "free" && !hasMountedText(args.renewalDateLabel)) {
    return {
      label: "No renewal",
      detail: "Free workspaces do not have a paid subscription renewal date.",
    };
  }
  if (normalizePlanId(args.plan) !== "free" && !hasMountedText(args.renewalDateLabel)) {
    return {
      label: "Renewal unavailable",
      detail: "Retry billing status to confirm the Stripe subscription renewal date for this paid workspace.",
    };
  }
  return {
    label: args.renewalDateLabel!.trim(),
    detail: "Shown when Stripe subscription timing is present.",
  };
}

export function readUpgradePathState(args: {
  hasBillingSnapshot: boolean;
  plan: string | null | undefined;
  checkoutAvailableKnown: boolean;
  checkoutAvailable: boolean | null | undefined;
}): {
  headline: string;
  detail: string;
  manualRequestLabel: string;
  checkoutEligible: boolean;
} {
  const checkoutEligible = normalizePlanId(args.plan) === "free";
  if (!args.hasBillingSnapshot) {
    return {
      headline: "Billing status unavailable",
      detail: "Retry billing status to confirm whether self-serve checkout or the manual upgrade request path is available for this workspace.",
      manualRequestLabel: "Request billing help",
      checkoutEligible,
    };
  }
  if (!hasMountedText(args.plan)) {
    return {
      headline: "Plan metadata unavailable",
      detail: "Retry billing status to confirm the current plan before choosing a self-serve upgrade or manual billing path.",
      manualRequestLabel: "Request billing help",
      checkoutEligible,
    };
  }
  if (!hasRecognizedPlanMetadata(args.plan)) {
    return {
      headline: "Plan metadata unavailable",
      detail: "Retry billing status to confirm a supported plan id before choosing a self-serve upgrade or manual billing path.",
      manualRequestLabel: "Request billing help",
      checkoutEligible,
    };
  }
  if (!args.checkoutAvailableKnown) {
    return {
      headline: "Checkout capability unavailable",
      detail: "Retry billing status to confirm whether this workspace has Stripe-hosted checkout or the manual upgrade request path available.",
      manualRequestLabel: "Retry billing status",
      checkoutEligible,
    };
  }
  if (args.checkoutAvailable) {
    return {
      headline: checkoutEligible ? "Self-serve checkout is configured" : "Current paid plan is already active",
      detail: checkoutEligible
        ? "Start a Stripe-hosted subscription checkout directly from the workspace. If Stripe is not configured for this deployment, the manual upgrade request fallback remains available."
        : "This workspace is already on a paid plan, so subscription changes should go through the billing portal when it is available.",
      manualRequestLabel: checkoutEligible ? "Request upgrade" : "Request billing help",
      checkoutEligible,
    };
  }
  return {
    headline: "Manual fallback remains mounted",
    detail: "This deployment does not have self-serve Stripe checkout configured, so the prefilled workspace upgrade request remains the available path.",
    manualRequestLabel: checkoutEligible ? "Request upgrade" : "Request billing help",
    checkoutEligible,
  };
}

export function readBillingPortalState(args: {
  hasBillingSnapshot: boolean;
  billingPortalAvailableKnown: boolean;
  billingPortalAvailable: boolean | null | undefined;
}): {
  headline: string;
  detail: string;
} {
  if (!args.hasBillingSnapshot) {
    return {
      headline: "Billing status unavailable",
      detail: "Retry billing status to confirm whether the Stripe-hosted billing portal is available for this workspace.",
    };
  }
  if (!args.billingPortalAvailableKnown) {
    return {
      headline: "Billing portal capability unavailable",
      detail: "Retry billing status to confirm whether this workspace has Stripe-hosted billing portal access.",
    };
  }
  return args.billingPortalAvailable
    ? {
        headline: "Self-serve portal path is configured",
        detail: "Open the Stripe-hosted customer portal to manage payment details and subscription state when a Stripe customer is already linked.",
      }
    : {
        headline: "Not configured on this deployment",
        detail: "Subscription self-service and payment-method management are not configured for this deployment yet.",
      };
}

export function readStripeCustomerLabel(args: {
  hasBillingSnapshot: boolean;
  customerIdLabel: string | null | undefined;
}): string {
  if (!args.hasBillingSnapshot) return "Billing status unavailable";
  return normalizeMountedText(args.customerIdLabel) ?? "Stripe customer unavailable";
}

export function readStripeSubscriptionLabel(args: {
  hasBillingSnapshot: boolean;
  subscriptionIdLabel: string | null | undefined;
}): string {
  if (!args.hasBillingSnapshot) return "Billing status unavailable";
  return normalizeMountedText(args.subscriptionIdLabel) ?? "Stripe subscription unavailable";
}

export function readPaymentSetupDetail(args: {
  hasBillingSnapshot: boolean;
  checkoutAvailableKnown: boolean;
  billingPortalAvailableKnown: boolean;
  hasStripeCustomerSignal: boolean;
  hasStripeSubscriptionSignal: boolean;
}): string {
  if (!args.hasBillingSnapshot) {
    return "Retry billing status to confirm whether Stripe-backed checkout, customer-portal handoff, billing-state storage, and webhook-driven subscription sync are available for this workspace.";
  }
  if (
    !args.checkoutAvailableKnown ||
    !args.billingPortalAvailableKnown ||
    !args.hasStripeCustomerSignal ||
    !args.hasStripeSubscriptionSignal
  ) {
    return "Billing status is mounted, but some Stripe capability and linkage signals are still incomplete. Retry billing status to confirm checkout, portal access, and subscription sync state.";
  }
  return "Billing status confirms the current Stripe-backed checkout, customer-portal handoff, billing-state storage, and webhook-driven subscription sync signals for this workspace.";
}

export function readPaymentSetupIdentityCardModels(args: {
  stripeCustomerLabel: string;
  stripeSubscriptionLabel: string;
}): Array<{
  title: string;
  value: string;
}> {
  return [
    { title: "Stripe customer", value: args.stripeCustomerLabel },
    { title: "Subscription", value: args.stripeSubscriptionLabel },
  ];
}

export function readBillingActionButtonLabel(action: "checkout" | "copy" | "portal", busyAction: string | null | undefined): string {
  if (action === "checkout") return busyAction === "checkout" ? "Opening checkout..." : "Start checkout";
  if (action === "copy") return busyAction === "copy" ? "Copying..." : "Copy request details";
  return busyAction === "portal" ? "Opening portal..." : "Open billing portal";
}
