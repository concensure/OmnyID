// @locs-version: 1.0
type UsageBillingSummaryCard = {
  title: string;
  value: string;
  detailLines: string[];
};

export type UsageBillingSummaryGridProps = {
  cards: UsageBillingSummaryCard[];
};

export default function UsageBillingSummaryGrid(props: UsageBillingSummaryGridProps) {
  return (
    <div class="mt-5 grid gap-4 md:grid-cols-3">
      {props.cards.map((card) => (
        <div class="rounded-2xl border border-white/30 bg-white/20 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-outline">{card.title}</p>
          <p class="mt-2 text-2xl font-semibold text-on-surface">{card.value}</p>
          {card.detailLines.map((line) => (
            <p class="mt-1 text-xs text-on-surface-variant">{line}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
