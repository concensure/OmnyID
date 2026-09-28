// @locs-version: 1.0
import type { BillingStatus } from "@/lib/api";
import { buildBillingUpgradeMailtoHref } from "@/lib/billingUpgradeState";
import type { UsageBillingSectionProps } from "@/components/UsageBillingSection";
import type { UsageBillingSummaryGridProps } from "@/components/UsageBillingSummaryGrid";
import type { UsageOperationalGuidanceCardProps } from "@/components/UsageOperationalGuidanceCard";
import type { UsagePaymentSetupSectionProps } from "@/components/UsagePaymentSetupSection";
import type { UsageStatusMessageCardProps } from "@/components/UsageStatusMessageCard";
import type { UsageStoragePolicySectionProps } from "@/components/UsageStoragePolicySection";
import { hasRecognizedPlanMetadata, nextStorageUpgradeLabel, normalizePlanId } from "@/lib/pricing";
import {
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
} from "@/lib/usageBillingSummaryState";
import { readUsageStorageDetail, readUsageStorageTierLabel } from "@/lib/usageStorageState";
import {
  byteCountLabel,
  hasMountedFiniteBytes,
  hasMountedOptionalIdSignal,
  readMountedDateLabel,
  readMountedWarningText,
  redactMountedId,
} from "@/lib/usageViewSharedState";

export function readBillingDerivedState(args: {
  billing: BillingStatus | null | undefined;
  billingLoading: boolean;
  sessionEmail: string | null | undefined;
}) {
  const billing = args.billing ?? null;
  const hasBillingSnapshot = billing !== null;
  const hasConfirmedPlanMetadata = !!String(billing?.plan ?? "").trim();
  const hasRecognizedPlanState = hasRecognizedPlanMetadata(billing?.plan);
  const hasCheckoutAvailabilitySignal = typeof billing?.checkout_available === "boolean";
  const hasBillingPortalAvailabilitySignal = typeof billing?.billing_portal_available === "boolean";
  const hasStripeCustomerSignal = hasMountedOptionalIdSignal(billing?.stripe_customer_id);
  const hasStripeSubscriptionSignal = hasMountedOptionalIdSignal(billing?.stripe_subscription_id);
  const hasStorageUsageSignal = hasMountedFiniteBytes(billing?.storage_used_bytes);
  const hasArchiveOnlyModeSignal = typeof billing?.archive_only_enabled === "boolean";
  const normalizedPlan = normalizePlanId(billing?.plan);
  const renewalDateLabel = readMountedDateLabel(billing?.current_period_end);
  const archiveOnlyWarningText = readMountedWarningText(billing?.archive_only_warning);
  const checkoutEligible = normalizedPlan === "free";
  const canStartSelfServeCheckout = hasBillingSnapshot
    && hasConfirmedPlanMetadata
    && !!billing?.checkout_available
    && checkoutEligible;
  const storageUsed = billing?.storage_used_bytes ?? 0;
  const planLabel = readBillingPlanLabel({
    hasBillingSnapshot,
    plan: billing?.plan,
  });
  const billingStatusLabel = readBillingStatusLabel({
    loading: args.billingLoading,
    hasBillingSnapshot,
    status: billing?.status,
  });
  const checkoutAvailabilityLabel = readCheckoutAvailabilityLabel({
    hasBillingSnapshot,
    plan: billing?.plan,
    checkoutAvailableKnown: hasCheckoutAvailabilitySignal,
    checkoutAvailable: billing?.checkout_available,
  });
  const storageUsageLabel = !hasBillingSnapshot
    ? "Billing status unavailable"
    : !hasStorageUsageSignal
      ? "Usage unavailable"
      : byteCountLabel(storageUsed);
  const storageUsageDetail = readUsageStorageDetail(billing);
  const storageTierLabel = readUsageStorageTierLabel(billing);
  const quotaStateLabel = readQuotaStateLabel({
    hasBillingSnapshot,
    quotaState: billing?.quota_state,
  });
  const nextUpgradeLabel = !hasBillingSnapshot
    ? "Retry billing status to confirm the next storage upgrade path."
    : !hasConfirmedPlanMetadata
      ? "Retry billing status to confirm the current plan before inferring the next storage upgrade path."
      : !hasRecognizedPlanState
        ? "Retry billing status to confirm a supported plan id before trusting the next storage upgrade path."
        : nextStorageUpgradeLabel(billing?.plan);
  const upgradePathState = readUpgradePathState({
    hasBillingSnapshot,
    plan: billing?.plan,
    checkoutAvailableKnown: hasCheckoutAvailabilitySignal,
    checkoutAvailable: billing?.checkout_available,
  });
  const billingPortalState = readBillingPortalState({
    hasBillingSnapshot,
    billingPortalAvailableKnown: hasBillingPortalAvailabilitySignal,
    billingPortalAvailable: billing?.billing_portal_available,
  });
  const renewalSummary = readRenewalSummary({
    hasBillingSnapshot,
    plan: billing?.plan,
    renewalDateLabel,
  });
  const stripeCustomerLabel = readStripeCustomerLabel({
    hasBillingSnapshot,
    customerIdLabel: hasStripeCustomerSignal ? redactMountedId(billing?.stripe_customer_id) : null,
  });
  const stripeSubscriptionLabel = readStripeSubscriptionLabel({
    hasBillingSnapshot,
    subscriptionIdLabel: hasStripeSubscriptionSignal ? redactMountedId(billing?.stripe_subscription_id) : null,
  });
  const paymentSetupDetail = readPaymentSetupDetail({
    hasBillingSnapshot,
    checkoutAvailableKnown: hasCheckoutAvailabilitySignal,
    billingPortalAvailableKnown: hasBillingPortalAvailabilitySignal,
    hasStripeCustomerSignal,
    hasStripeSubscriptionSignal,
  });

  return {
    hasBillingSnapshot,
    hasCheckoutAvailabilitySignal,
    hasArchiveOnlyModeSignal,
    archiveOnlyWarningText,
    canStartSelfServeCheckout,
    planLabel,
    billingStatusLabel,
    checkoutAvailabilityLabel,
    storageUsageLabel,
    storageUsageDetail,
    storageTierLabel,
    quotaStateLabel,
    nextUpgradeLabel,
    renewalLabel: renewalSummary.label,
    renewalDetail: renewalSummary.detail,
    paymentSetupDetail,
    paymentSetupIdentityCards: readPaymentSetupIdentityCardModels({
      stripeCustomerLabel,
      stripeSubscriptionLabel,
    }),
    upgradeMailtoHref: buildBillingUpgradeMailtoHref(billing, args.sessionEmail),
    upgradePathHeadline: upgradePathState.headline,
    upgradePathDetail: upgradePathState.detail,
    manualRequestLabel: upgradePathState.manualRequestLabel,
    billingPortalHeadline: billingPortalState.headline,
    billingPortalDetail: billingPortalState.detail,
    billingPortalAvailable: billing?.billing_portal_available === true,
  };
}

export function readBillingSummaryCards(args: {
  planLabel: string;
  billingStatusLabel: string;
  checkoutAvailabilityLabel: string;
  storageUsageLabel: string;
  storageUsageDetail: string;
  renewalLabel: string;
  renewalDetail: string;
}): UsageBillingSummaryGridProps["cards"] {
  return [
    {
      title: "Current plan",
      value: args.planLabel,
      detailLines: [
        `Status: ${args.billingStatusLabel}`,
        `Self-serve checkout: ${args.checkoutAvailabilityLabel}`,
      ],
    },
    {
      title: "Storage usage",
      value: args.storageUsageLabel,
      detailLines: [args.storageUsageDetail],
    },
    {
      title: "Renewal",
      value: args.renewalLabel,
      detailLines: [args.renewalDetail],
    },
  ];
}

export function readWorkspaceOperationalGuidanceCardModel(args: {
  tone: "warning" | "neutral" | null | undefined;
  title: string | null | undefined;
  detail: string | null | undefined;
  artifactSummary: string | null;
  command: string | null | undefined;
}): Omit<UsageOperationalGuidanceCardProps, "onCopyCommand"> | null {
  if (!args.title && !args.detail && !args.command && !args.artifactSummary) return null;
  return {
    tone: args.tone === "warning" ? "warning" : "neutral",
    title: args.title ?? "Operational guidance active",
    detail: args.detail ?? "Workspace cleanup guidance is available.",
    artifactSummary: args.artifactSummary,
    command: args.command ?? null,
    copyButtonLabel: "Copy cleanup command",
  };
}

export function readBillingStatusMessage(args: {
  tone: UsageStatusMessageCardProps["tone"];
  title?: string | null | undefined;
  summary: string | null | undefined;
  detail?: string | null | undefined;
}): UsageStatusMessageCardProps | null {
  const summary = String(args.summary ?? "").trim();
  if (!summary) return null;
  const title = String(args.title ?? "").trim();
  const detail = String(args.detail ?? "").trim();
  return {
    tone: args.tone,
    title: title || undefined,
    summary,
    detail: detail || undefined,
  };
}

export function readBillingStoragePolicyModel(
  args: UsageStoragePolicySectionProps,
): UsageStoragePolicySectionProps {
  return args;
}

export function readBillingPaymentSetupModel(
  args: UsagePaymentSetupSectionProps,
): UsagePaymentSetupSectionProps {
  return args;
}

export function readBillingUsageSectionModel(
  args: UsageBillingSectionProps,
) {
  return args;
}
