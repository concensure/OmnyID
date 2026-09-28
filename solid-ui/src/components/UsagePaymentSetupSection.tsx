// @locs-version: 1.0
import { Show } from "solid-js";

type PaymentIdentityCard = {
  title: string;
  value: string;
};

export type UsagePaymentSetupSectionProps = {
  detail: string;
  identityCards: PaymentIdentityCard[];
  upgradePathHeadline: string;
  upgradePathDetail: string;
  manualRequestLabel: string;
  canStartSelfServeCheckout: boolean;
  hasCheckoutAvailabilitySignal: boolean;
  upgradeMailtoHref: string;
  checkoutButtonLabel: string;
  copyButtonLabel: string;
  billingPortalHeadline: string;
  billingPortalDetail: string;
  billingPortalAvailable: boolean;
  portalButtonLabel: string;
  actionsDisabled: boolean;
  onStartCheckout: () => void;
  onCopyUpgradeRequest: () => void;
  onOpenBillingPortal: () => void;
};

export default function UsagePaymentSetupSection(props: UsagePaymentSetupSectionProps) {
  return (
    <div class="mt-4 rounded-2xl border border-white/30 bg-white/15 p-4">
      <p class="text-sm font-semibold text-on-surface">Payment setup</p>
      <p class="mt-1 text-xs leading-6 text-on-surface-variant">
        {props.detail}
      </p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        {props.identityCards.map((card) => (
          <div class="rounded-xl border border-white/20 bg-white/20 p-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-outline">{card.title}</p>
            <p class="mt-1 font-mono text-xs text-on-surface">{card.value}</p>
          </div>
        ))}
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-amber-300/40 bg-amber-50/60 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">Upgrade path</p>
          <p class="mt-1 text-sm text-amber-900">{props.upgradePathHeadline}</p>
          <p class="mt-1 text-xs leading-6 text-amber-800/90">{props.upgradePathDetail}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Show
              when={props.canStartSelfServeCheckout}
              fallback={
                <Show
                  when={props.hasCheckoutAvailabilitySignal}
                  fallback={
                    <button
                      type="button"
                      disabled
                      class="rounded-xl border border-amber-400/50 bg-white/50 px-3 py-1.5 text-sm font-medium text-amber-900 opacity-70"
                    >
                      {props.manualRequestLabel}
                    </button>
                  }
                >
                  <a
                    href={props.upgradeMailtoHref}
                    class="rounded-xl border border-amber-400/50 bg-white/70 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-white"
                  >
                    {props.manualRequestLabel}
                  </a>
                </Show>
              }
            >
              <button
                type="button"
                onClick={() => void props.onStartCheckout()}
                disabled={props.actionsDisabled}
                class="rounded-xl border border-amber-400/50 bg-white/70 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {props.checkoutButtonLabel}
              </button>
            </Show>
            <button
              type="button"
              onClick={() => void props.onCopyUpgradeRequest()}
              disabled={props.actionsDisabled}
              class="rounded-xl border border-amber-400/50 bg-white/50 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-white/80"
            >
              {props.copyButtonLabel}
            </button>
          </div>
        </div>
        <div class="rounded-xl border border-amber-300/40 bg-amber-50/60 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">Billing portal</p>
          <p class="mt-1 text-sm text-amber-900">{props.billingPortalHeadline}</p>
          <p class="mt-1 text-xs leading-6 text-amber-800/90">{props.billingPortalDetail}</p>
          <Show when={props.billingPortalAvailable}>
            <div class="mt-3">
              <button
                type="button"
                onClick={() => void props.onOpenBillingPortal()}
                disabled={props.actionsDisabled}
                class="rounded-xl border border-amber-400/50 bg-white/70 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {props.portalButtonLabel}
              </button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
