// @locs-version: 1.0
type ExternalToolOverviewCard = {
  title: string;
  value: string;
  detail: string;
  tone: "default" | "emerald" | "amber" | "sky" | "indigo";
};

export type UsageExternalToolOverviewGridProps = {
  cards: ExternalToolOverviewCard[];
};

function readCardContainerClassName(tone: ExternalToolOverviewCard["tone"]): string {
  if (tone === "emerald") {
    return "border border-emerald-300/30 bg-emerald-50/40";
  }
  if (tone === "amber") {
    return "border border-amber-300/30 bg-amber-50/40";
  }
  if (tone === "sky") {
    return "border border-sky-300/30 bg-sky-50/40";
  }
  if (tone === "indigo") {
    return "border border-indigo-300/30 bg-indigo-50/40";
  }
  return "border border-white/20 bg-white/20";
}

function readTitleClassName(tone: ExternalToolOverviewCard["tone"]): string {
  if (tone === "emerald") {
    return "text-emerald-900";
  }
  if (tone === "amber") {
    return "text-amber-900";
  }
  if (tone === "sky") {
    return "text-sky-900";
  }
  if (tone === "indigo") {
    return "text-indigo-900";
  }
  return "text-outline";
}

function readValueClassName(tone: ExternalToolOverviewCard["tone"]): string {
  const sizeClass = tone === "indigo" ? "text-sm" : "text-2xl";
  const colorClass = tone === "emerald"
    ? "text-emerald-950"
    : tone === "amber"
      ? "text-amber-950"
      : tone === "sky"
        ? "text-sky-950"
        : tone === "indigo"
          ? "text-indigo-950"
          : "text-on-surface";
  return `mt-1 ${sizeClass} font-semibold ${colorClass}`;
}

function readDetailClassName(tone: ExternalToolOverviewCard["tone"]): string {
  if (tone === "emerald") {
    return "text-emerald-900/80";
  }
  if (tone === "amber") {
    return "text-amber-900/80";
  }
  if (tone === "sky") {
    return "text-sky-900/80";
  }
  if (tone === "indigo") {
    return "text-indigo-900/80";
  }
  return "text-on-surface-variant";
}

export default function UsageExternalToolOverviewGrid(props: UsageExternalToolOverviewGridProps) {
  return (
    <div class="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {props.cards.map((card) => (
        <div class={`rounded-xl p-3 ${readCardContainerClassName(card.tone)}`}>
          <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${readTitleClassName(card.tone)}`}>{card.title}</p>
          <p class={readValueClassName(card.tone)}>{card.value}</p>
          <p class={`mt-1 text-xs ${readDetailClassName(card.tone)}`}>{card.detail}</p>
        </div>
      ))}
    </div>
  );
}
