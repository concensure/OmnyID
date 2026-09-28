// @locs-version: 1.0
import { Show } from "solid-js";
import UsageBillingSummaryGrid from "@/components/UsageBillingSummaryGrid";
import type { UsageBillingSummaryGridProps } from "@/components/UsageBillingSummaryGrid";
import UsageStatusMessageCard from "@/components/UsageStatusMessageCard";
import type { UsageStatusMessageCardProps } from "@/components/UsageStatusMessageCard";
import UsageOperationalGuidanceCard from "@/components/UsageOperationalGuidanceCard";
import type { UsageOperationalGuidanceCardProps } from "@/components/UsageOperationalGuidanceCard";
import UsageStoragePolicySection from "@/components/UsageStoragePolicySection";
import type { UsageStoragePolicySectionProps } from "@/components/UsageStoragePolicySection";
import UsagePaymentSetupSection from "@/components/UsagePaymentSetupSection";
import type { UsagePaymentSetupSectionProps } from "@/components/UsagePaymentSetupSection";

export type UsageBillingSectionProps = {
  summaryCards: UsageBillingSummaryGridProps["cards"];
  billingLoadWarning: UsageStatusMessageCardProps | null;
  operationalGuidance: Omit<UsageOperationalGuidanceCardProps, "onCopyCommand"> | null;
  onCopyOperationalCommand: UsageOperationalGuidanceCardProps["onCopyCommand"];
  modeError: UsageStatusMessageCardProps | null;
  billingActionError: UsageStatusMessageCardProps | null;
  upgradeNotice: UsageStatusMessageCardProps | null;
  operationalCommandNotice: UsageStatusMessageCardProps | null;
  storagePolicy: UsageStoragePolicySectionProps;
  paymentSetup: UsagePaymentSetupSectionProps;
};

export default function UsageBillingSection(props: UsageBillingSectionProps) {
  return (
    <>
      <UsageBillingSummaryGrid cards={props.summaryCards} />

      <Show when={props.billingLoadWarning}>
        {(card) => <UsageStatusMessageCard {...card()} />}
      </Show>

      <Show when={props.operationalGuidance}>
        {(card) => (
          <UsageOperationalGuidanceCard
            tone={card().tone}
            title={card().title}
            detail={card().detail}
            artifactSummary={card().artifactSummary}
            command={card().command}
            copyButtonLabel={card().copyButtonLabel}
            onCopyCommand={props.onCopyOperationalCommand}
          />
        )}
      </Show>

      <Show when={props.modeError}>
        {(card) => <UsageStatusMessageCard {...card()} />}
      </Show>

      <Show when={props.billingActionError}>
        {(card) => <UsageStatusMessageCard {...card()} />}
      </Show>

      <Show when={props.upgradeNotice}>
        {(card) => <UsageStatusMessageCard {...card()} />}
      </Show>

      <Show when={props.operationalCommandNotice}>
        {(card) => <UsageStatusMessageCard {...card()} />}
      </Show>

      <UsageStoragePolicySection {...props.storagePolicy} />
      <UsagePaymentSetupSection {...props.paymentSetup} />
    </>
  );
}
