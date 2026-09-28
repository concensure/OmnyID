// @locs-version: 1.0
import { Show } from "solid-js";

export type UsageStoragePolicySectionProps = {
  storageTierLabel: string;
  quotaStateLabel: string;
  nextUpgradeLabel: string;
  archiveOnlyToggleLabel: string;
  archiveOnlyActiveLabel: string | null;
  archiveOnlyWarningText: string | null;
  toggleDisabled: boolean;
  showWarning: boolean;
  onToggle: () => void;
};

export default function UsageStoragePolicySection(props: UsageStoragePolicySectionProps) {
  return (
    <div class="mt-4 rounded-2xl border border-white/30 bg-white/15 p-4">
      <p class="text-sm font-semibold text-on-surface">Storage policy</p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-white/20 bg-white/20 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-outline">Current tier</p>
          <p class="mt-1 text-sm text-on-surface">{props.storageTierLabel}</p>
          <p class="mt-1 text-xs text-on-surface-variant">State: {props.quotaStateLabel}</p>
        </div>
        <div class="rounded-xl border border-white/20 bg-white/20 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-outline">Next upgrade</p>
          <p class="mt-1 text-sm text-on-surface">{props.nextUpgradeLabel}</p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={props.onToggle}
          disabled={props.toggleDisabled}
          class="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-on-surface transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.archiveOnlyToggleLabel}
        </button>
        <Show when={props.archiveOnlyActiveLabel}>
          <span class="rounded-xl border border-amber-300/40 bg-amber-50/70 px-3 py-1.5 text-xs font-medium text-amber-800">
            {props.archiveOnlyActiveLabel}
          </span>
        </Show>
      </div>
      <Show when={props.showWarning && props.archiveOnlyWarningText}>
        <div class="mt-3 rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 text-xs leading-6 text-on-surface-variant">
          {props.archiveOnlyWarningText}
        </div>
      </Show>
    </div>
  );
}
