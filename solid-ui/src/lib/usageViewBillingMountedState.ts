// @locs-version: 1.0
import type { BillingStatus } from "@/lib/api";
import type { UsageBillingSectionProps } from "@/components/UsageBillingSection";
import { archiveOnlyActiveLabel, archiveOnlyToggleLabel } from "@/lib/storageMode";
import { readBillingOperationalGuidanceCard } from "@/lib/billingOperationalGuidanceState";
import { readBillingActionButtonLabel } from "@/lib/usageBillingSummaryState";
import {
  readBillingDerivedState,
  readBillingPaymentSetupModel,
  readBillingSummaryCards,
  readBillingStatusMessage,
  readBillingStoragePolicyModel,
  readBillingUsageSectionModel,
  readWorkspaceOperationalGuidanceCardModel,
} from "@/lib/billingUsageSectionState";
import type { UsageViewBillingBusyAction } from "@/lib/usageViewInteractionState";
import type { UsageViewFailureReceipt } from "@/lib/usageViewFailureState";

export function readUsageViewBillingMountedSectionProps(args: {
  billing: BillingStatus | null | undefined;
  billingLoading: boolean;
  billingError: unknown;
  sessionEmail: string | null | undefined;
  modeSaving: boolean;
  billingActionBusy: UsageViewBillingBusyAction;
  modeError: UsageViewFailureReceipt | null | undefined;
  billingActionError: UsageViewFailureReceipt | null | undefined;
  upgradeActionNotice: string | null | undefined;
  operationalCommandNotice: string | null | undefined;
  onCopyOperationalCommand: UsageBillingSectionProps["onCopyOperationalCommand"];
  onToggleArchiveOnlyMode: (enabled: boolean) => void;
  onStartCheckout: UsageBillingSectionProps["paymentSetup"]["onStartCheckout"];
  onCopyUpgradeRequest: UsageBillingSectionProps["paymentSetup"]["onCopyUpgradeRequest"];
  onOpenBillingPortal: UsageBillingSectionProps["paymentSetup"]["onOpenBillingPortal"];
  formatArtifactSummary(args: {
    artifactUpdatedLabel: string | null | undefined;
    source: string | null | undefined;
  }): string | null;
}): UsageBillingSectionProps {
  const billing = args.billing ?? null;
  const operationalGuidanceCard = readBillingOperationalGuidanceCard(billing);
  const billingDerivedState = readBillingDerivedState({
    billing,
    billingLoading: args.billingLoading,
    sessionEmail: args.sessionEmail,
  });
  const operationalGuidance = readWorkspaceOperationalGuidanceCardModel({
    tone: operationalGuidanceCard?.tone,
    title: operationalGuidanceCard?.title,
    detail: operationalGuidanceCard?.detail,
    artifactSummary: operationalGuidanceCard?.generatedAt || operationalGuidanceCard?.source
      ? args.formatArtifactSummary({
        artifactUpdatedLabel: operationalGuidanceCard?.generatedAt,
        source: operationalGuidanceCard?.source,
      })
      : null,
    command: operationalGuidanceCard?.command ?? null,
  });

  return readBillingUsageSectionModel({
    summaryCards: readBillingSummaryCards({
      planLabel: billingDerivedState.planLabel,
      billingStatusLabel: billingDerivedState.billingStatusLabel,
      checkoutAvailabilityLabel: billingDerivedState.checkoutAvailabilityLabel,
      storageUsageLabel: billingDerivedState.storageUsageLabel,
      storageUsageDetail: billingDerivedState.storageUsageDetail,
      renewalLabel: billingDerivedState.renewalLabel,
      renewalDetail: billingDerivedState.renewalDetail,
    }),
    billingLoadWarning: readBillingStatusMessage({
      tone: "warning",
      summary: args.billingError
        ? "Unable to load billing status right now. Billing controls are mounted, but the status endpoint returned an error."
        : null,
    }),
    operationalGuidance,
    onCopyOperationalCommand: args.onCopyOperationalCommand,
    modeError: readBillingStatusMessage({
      tone: args.modeError?.tone === "danger" ? "danger" : "warning",
      title: args.modeError?.title,
      summary: args.modeError?.summary ?? null,
      detail: args.modeError?.nextStep ? `Next step: ${args.modeError.nextStep}` : null,
    }),
    billingActionError: readBillingStatusMessage({
      tone: args.billingActionError?.tone === "danger" ? "danger" : "warning",
      title: args.billingActionError?.title,
      summary: args.billingActionError?.summary ?? null,
      detail: args.billingActionError?.nextStep ? `Next step: ${args.billingActionError.nextStep}` : null,
    }),
    upgradeNotice: readBillingStatusMessage({
      tone: "info",
      summary: args.upgradeActionNotice ?? null,
    }),
    operationalCommandNotice: readBillingStatusMessage({
      tone: "info",
      summary: args.operationalCommandNotice ?? null,
    }),
    storagePolicy: readBillingStoragePolicyModel({
      storageTierLabel: billingDerivedState.storageTierLabel,
      quotaStateLabel: billingDerivedState.quotaStateLabel,
      nextUpgradeLabel: billingDerivedState.nextUpgradeLabel,
      archiveOnlyToggleLabel: archiveOnlyToggleLabel(billing, args.modeSaving),
      archiveOnlyActiveLabel: archiveOnlyActiveLabel(billing),
      archiveOnlyWarningText: billingDerivedState.archiveOnlyWarningText,
      showWarning: billingDerivedState.hasArchiveOnlyModeSignal,
      toggleDisabled: args.modeSaving
        || args.billingActionBusy !== null
        || !billing
        || !billingDerivedState.hasArchiveOnlyModeSignal,
      onToggle: () => args.onToggleArchiveOnlyMode(!(billing?.archive_only_enabled ?? false)),
    }),
    paymentSetup: readBillingPaymentSetupModel({
      detail: billingDerivedState.paymentSetupDetail,
      identityCards: billingDerivedState.paymentSetupIdentityCards,
      upgradePathHeadline: billingDerivedState.upgradePathHeadline,
      upgradePathDetail: billingDerivedState.upgradePathDetail,
      manualRequestLabel: billingDerivedState.manualRequestLabel,
      canStartSelfServeCheckout: billingDerivedState.canStartSelfServeCheckout,
      hasCheckoutAvailabilitySignal: billingDerivedState.hasCheckoutAvailabilitySignal,
      upgradeMailtoHref: billingDerivedState.upgradeMailtoHref,
      checkoutButtonLabel: readBillingActionButtonLabel("checkout", args.billingActionBusy),
      copyButtonLabel: readBillingActionButtonLabel("copy", args.billingActionBusy),
      billingPortalHeadline: billingDerivedState.billingPortalHeadline,
      billingPortalDetail: billingDerivedState.billingPortalDetail,
      billingPortalAvailable: billingDerivedState.billingPortalAvailable,
      portalButtonLabel: readBillingActionButtonLabel("portal", args.billingActionBusy),
      actionsDisabled: args.modeSaving || args.billingActionBusy !== null,
      onStartCheckout: args.onStartCheckout,
      onCopyUpgradeRequest: args.onCopyUpgradeRequest,
      onOpenBillingPortal: args.onOpenBillingPortal,
    }),
  });
}
