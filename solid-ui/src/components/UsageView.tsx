import { createResource, Show } from "solid-js";
import { getBillingStatus, readSession, type BillingStatus } from "@/lib/api";

function formatPlan(plan: string | undefined) {
  const raw = String(plan || "free").trim();
  if (!raw) return "Free";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function redact(value: string | null | undefined) {
  if (!value) return "Not connected";
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function UsageView() {
  const session = readSession();
  const [billing] = createResource<BillingStatus | null>(async () => {
    if (!session?.token) return null;
    return getBillingStatus();
  });

  return (
    <div class="space-y-5">
      <div class="glass-surface rounded-[24px] border border-white/40 p-6 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Usage</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Plan, billing, and usage</h3>
        <p class="mt-1 text-sm leading-6 text-on-surface-variant">
          Stripe billing infrastructure exists on the backend, but checkout and exact usage-cost calculation are not wired into the workspace yet.
        </p>

        <Show
          when={session?.token}
          fallback={
            <div class="mt-4 rounded-2xl border border-amber-300/40 bg-amber-50/60 p-4 text-sm text-on-surface-variant">
              Sign in to view your plan and payment details.
            </div>
          }
        >
          <div class="mt-5 grid gap-4 md:grid-cols-3">
            <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-outline">Current plan</p>
              <p class="mt-2 text-2xl font-semibold text-on-surface">{formatPlan(billing()?.plan)}</p>
              <p class="mt-1 text-xs text-on-surface-variant">
                Status: {billing.loading ? "Loading..." : billing()?.status ?? "unknown"}
              </p>
            </div>

            <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-outline">Usage this month</p>
              <p class="mt-2 text-2xl font-semibold text-on-surface">Placeholder</p>
              <p class="mt-1 text-xs text-on-surface-variant">
                Exact token and tool cost rollup still needs implementation.
              </p>
            </div>

            <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-outline">Renewal</p>
              <p class="mt-2 text-2xl font-semibold text-on-surface">
                {billing()?.current_period_end
                  ? new Date(billing()!.current_period_end!).toLocaleDateString()
                  : "TBD"}
              </p>
              <p class="mt-1 text-xs text-on-surface-variant">
                Shown when Stripe subscription timing is present.
              </p>
            </div>
          </div>

          <Show when={billing.error}>
            <div class="mt-4 rounded-2xl border border-amber-300/40 bg-amber-50/60 p-4 text-sm text-on-surface-variant">
              Unable to load billing status right now. Stripe checkout is still placeholder-only, and the billing status endpoint returned an error.
            </div>
          </Show>

          <div class="mt-4 rounded-2xl border border-white/30 bg-white/15 p-4">
            <p class="text-sm font-semibold text-on-surface">Payment setup</p>
            <p class="mt-1 text-xs leading-6 text-on-surface-variant">
              Backend status indicates Stripe support is already present for webhook ingestion and billing-state storage. Hosted checkout, portal management, and live usage charging still need to be added.
            </p>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-white/20 bg-white/20 p-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-outline">Stripe customer</p>
                <p class="mt-1 font-mono text-xs text-on-surface">{redact(billing()?.stripe_customer_id)}</p>
              </div>
              <div class="rounded-xl border border-white/20 bg-white/20 p-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-outline">Subscription</p>
                <p class="mt-1 font-mono text-xs text-on-surface">{redact(billing()?.stripe_subscription_id)}</p>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled
                class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white opacity-60"
              >
                Upgrade with Stripe (placeholder)
              </button>
              <button
                type="button"
                disabled
                class="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-on-surface-variant opacity-60"
              >
                Manage billing (placeholder)
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
