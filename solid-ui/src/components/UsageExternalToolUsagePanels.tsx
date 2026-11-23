// @locs-version: 1.0
import { Show } from "solid-js";

type ExternalToolLineItemRow = {
  toolNameLabel: string;
  providerKeyLabel: string;
  billingCategoryLabel: string;
  usageSummary: string;
  estimatedCostLabel: string;
};

type ExternalToolUsageEventCard = {
  toolNameLabel: string;
  estimatedCostLabel: string;
  summaryLine: string;
  occurredAtLabel: string;
};

export type UsageExternalToolUsagePanelsProps = {
  lineItemsTitle: string;
  lineItemsEmptyState: string;
  lineItems: ExternalToolLineItemRow[];
  lineItemPrimaryHeader: string;
  usageTitle: string;
  usageEmptyState: string;
  usageEvents: ExternalToolUsageEventCard[];
};

export default function UsageExternalToolUsagePanels(props: UsageExternalToolUsagePanelsProps) {
  return (
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      <div class="rounded-xl border border-white/20 bg-white/20 p-3">
        <p class="text-sm font-semibold text-on-surface">{props.lineItemsTitle}</p>
        <Show when={props.lineItems.length > 0} fallback={
          <p class="mt-2 text-xs leading-6 text-on-surface-variant">
            {props.lineItemsEmptyState}
          </p>
        }>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-left text-xs text-on-surface-variant">
              <thead>
                <tr class="border-b border-white/20 text-on-surface-variant/80">
                  <th class="py-2 pr-3 font-semibold">{props.lineItemPrimaryHeader}</th>
                  <th class="py-2 pr-3 font-semibold">Category</th>
                  <th class="py-2 pr-3 font-semibold">Usage</th>
                  <th class="py-2 font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody>
                {props.lineItems.map((item) => (
                  <tr class="border-b border-white/10 last:border-b-0">
                    <td class="py-2 pr-3 align-top">
                      <div class="font-medium text-on-surface">{item.toolNameLabel}</div>
                      <div class="text-[11px] text-on-surface-variant/80">{item.providerKeyLabel}</div>
                    </td>
                    <td class="py-2 pr-3 align-top">{item.billingCategoryLabel}</td>
                    <td class="py-2 pr-3 align-top">{item.usageSummary}</td>
                    <td class="py-2 align-top font-medium text-on-surface">{item.estimatedCostLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Show>
      </div>

      <div class="rounded-xl border border-white/20 bg-white/20 p-3">
        <p class="text-sm font-semibold text-on-surface">{props.usageTitle}</p>
        <Show when={props.usageEvents.length > 0} fallback={
          <p class="mt-2 text-xs leading-6 text-on-surface-variant">
            {props.usageEmptyState}
          </p>
        }>
          <div class="mt-3 space-y-2">
            {props.usageEvents.map((event) => (
              <div class="rounded-lg border border-white/20 bg-white/30 px-3 py-2">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium text-on-surface">{event.toolNameLabel}</p>
                  <p class="text-sm font-semibold text-on-surface">{event.estimatedCostLabel}</p>
                </div>
                <p class="mt-1 text-xs text-on-surface-variant">{event.summaryLine}</p>
                <p class="mt-1 text-[11px] text-on-surface-variant/80">{event.occurredAtLabel}</p>
              </div>
            ))}
          </div>
        </Show>
      </div>
    </div>
  );
}
