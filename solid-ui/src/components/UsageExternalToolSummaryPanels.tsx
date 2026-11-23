// @locs-version: 1.0
import { Show } from "solid-js";

type ExternalToolCategoryTotalCard = {
  billingCategoryLabel: string;
  estimatedCostLabel: string;
  summaryLine: string;
};

type ExternalToolConnectionCard = {
  toolName: string;
  pricingSummary: string;
  billingModelLabel: string;
  freeTierSummary: string | null;
  productionCaveat: string | null;
};

export type UsageExternalToolSummaryPanelsProps = {
  categoryCards: ExternalToolCategoryTotalCard[];
  categoryEmptyState: string;
  connectionCards: ExternalToolConnectionCard[];
  connectionEmptyState: string;
};

export default function UsageExternalToolSummaryPanels(props: UsageExternalToolSummaryPanelsProps) {
  return (
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      <div class="rounded-xl border border-white/20 bg-white/20 p-3">
        <p class="text-sm font-semibold text-on-surface">Category totals</p>
        <Show when={props.categoryCards.length > 0} fallback={
          <p class="mt-2 text-xs leading-6 text-on-surface-variant">
            {props.categoryEmptyState}
          </p>
        }>
          <div class="mt-3 space-y-2">
            {props.categoryCards.map((card) => (
              <div class="rounded-lg border border-white/20 bg-white/30 px-3 py-2">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium text-on-surface">{card.billingCategoryLabel}</p>
                  <p class="text-sm font-semibold text-on-surface">{card.estimatedCostLabel}</p>
                </div>
                <p class="mt-1 text-xs text-on-surface-variant">{card.summaryLine}</p>
              </div>
            ))}
          </div>
        </Show>
      </div>

      <div class="rounded-xl border border-white/20 bg-white/20 p-3">
        <p class="text-sm font-semibold text-on-surface">Connected providers</p>
        <Show when={props.connectionCards.length > 0} fallback={
          <p class="mt-2 text-xs leading-6 text-on-surface-variant">
            {props.connectionEmptyState}
          </p>
        }>
          <div class="mt-3 space-y-2">
            {props.connectionCards.map((card) => (
              <div class="rounded-lg border border-white/20 bg-white/30 px-3 py-2">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-on-surface">{card.toolName}</p>
                    <p class="mt-1 text-xs text-on-surface-variant">{card.pricingSummary}</p>
                  </div>
                  <span class="rounded-full border border-sky-300/40 bg-sky-50/70 px-2 py-0.5 text-[10px] font-medium text-sky-900">
                    {card.billingModelLabel}
                  </span>
                </div>
                <Show when={card.freeTierSummary}>
                  {(freeTierSummary) => (
                    <p class="mt-1 text-[11px] text-on-surface-variant/90">Free tier: {freeTierSummary()}</p>
                  )}
                </Show>
                <Show when={card.productionCaveat}>
                  {(productionCaveat) => (
                    <p class="mt-1 text-[11px] text-amber-800">{productionCaveat()}</p>
                  )}
                </Show>
              </div>
            ))}
          </div>
        </Show>
      </div>
    </div>
  );
}
