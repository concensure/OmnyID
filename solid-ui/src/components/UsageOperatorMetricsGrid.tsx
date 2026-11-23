// @locs-version: 1.0
type OperatorOverviewCard = {
  title: string;
  value: string;
  detail: string;
};

export type UsageOperatorMetricsGridProps = {
  cards: OperatorOverviewCard[];
};

export default function UsageOperatorMetricsGrid(props: UsageOperatorMetricsGridProps) {
  return (
    <div class="mt-4 grid gap-3 md:grid-cols-4">
      {props.cards.map((card) => (
        <div class="rounded-xl border border-white/50 bg-white/80 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.title}</p>
          <p class="mt-1 text-xl font-semibold text-slate-950">{card.value}</p>
          <p class="mt-1 text-xs text-slate-600">{card.detail}</p>
        </div>
      ))}
    </div>
  );
}
