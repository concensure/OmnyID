// @locs-version: 1.0
type UsageExternalToolCostTrustPanelProps = {
  heading: string;
  detail: string;
  coverageTitle: string;
  coverageItems: string[];
  caveatsTitle: string;
  caveatItems: string[];
};

export default function UsageExternalToolCostTrustPanel(props: UsageExternalToolCostTrustPanelProps) {
  return (
    <div class="mt-4 rounded-2xl border border-white/30 bg-white/15 p-4">
      <p class="text-sm font-semibold text-on-surface">{props.heading}</p>
      <p class="mt-1 text-xs leading-6 text-on-surface-variant">{props.detail}</p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-emerald-300/35 bg-emerald-50/50 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-900">
            {props.coverageTitle}
          </p>
          <ul class="mt-2 space-y-2 text-xs leading-6 text-emerald-900/90">
            {props.coverageItems.map((entry) => (
              <li>{entry}</li>
            ))}
          </ul>
        </div>
        <div class="rounded-xl border border-amber-300/35 bg-amber-50/50 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">
            {props.caveatsTitle}
          </p>
          <ul class="mt-2 space-y-2 text-xs leading-6 text-amber-900/90">
            {props.caveatItems.map((entry) => (
              <li>{entry}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
