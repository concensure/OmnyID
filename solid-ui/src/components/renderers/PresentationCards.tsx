/**
 * PresentationCards — 20 interactive card components for the universal
 * UI Presentation layer.
 *
 * Every card accepts:
 *   data   — structured content extracted from the server's AFP response
 *   ctx    — shared PresentationStateCtx (read + write)
 *   subject — optional instance label (e.g. "Tokyo" for a MapCard instance)
 *
 * Cards are intentionally self-contained. They do NOT call APIs — they render
 * data the server already provided, with reactive state updates via ctx.
 */

import { createMemo, createSignal, For, Show } from "solid-js";
import type { Component } from "solid-js";
import type { CardType, PresentationStateCtx } from "@/lib/presentationState";
import { parseKeyFacts } from "@/lib/presentationState";
import { safeHref } from "@/lib/api";

// ── Shared card prop type ─────────────────────────────────────────────────────

export type CardProps = {
  id: string;
  data: Record<string, unknown>;
  ctx: PresentationStateCtx;
  subject?: string;
};

// ── Utility helpers ───────────────────────────────────────────────────────────

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function SectionLabel(props: { children: string }) {
  return (
    <p class="label-caps mb-2 text-outline">{props.children}</p>
  );
}

function Pill(props: { children: string; tone?: "blue" | "green" | "amber" | "default" }) {
  const cls = () => ({
    blue:    "bg-primary-fixed/70 text-primary",
    green:   "bg-secondary-container/80 text-secondary",
    amber:   "bg-amber-100/80 text-amber-700",
    default: "bg-white/60 text-on-surface-variant border border-outline-variant/40",
  }[props.tone ?? "default"]);
  return (
    <span class={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls()}`}>
      {props.children}
    </span>
  );
}

// ── 1. SummaryCard ─────────────────────────────────────────────────────────────

type SummaryCardState = {
  summary: string;
  bullets: string[];
  showBullets: boolean;
};

const summaryCardState = (props: CardProps): SummaryCardState => {
  const bullets = arr<string>(props.data.bullets);
  return {
    summary: str(props.data.summary),
    bullets,
    showBullets: bullets.length > 0,
  };
};

export function SummaryCard(props: CardProps) {
  const cardState = createMemo(() => summaryCardState(props));
  return (
    <div class="space-y-3">
      <p class="text-sm leading-relaxed text-on-surface">{cardState().summary}</p>
      <Show when={cardState().showBullets}>
        <ul class="space-y-1">
          <For each={cardState().bullets}>
            {(bullet) => (
              <li class="flex items-start gap-2 text-xs text-on-surface-variant">
                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                {bullet}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

// ── 2. KeyFactsCard ───────────────────────────────────────────────────────────

type KeyFactRow = {
  key: string;
  value: string;
};

type KeyFactsCardState = {
  facts: KeyFactRow[];
  showFacts: boolean;
};

const keyFactsCardState = (props: CardProps): KeyFactsCardState => {
  const rawFacts = arr<{ key: string; value: string }>(props.data.facts);
  const facts =
    rawFacts.length > 0
      ? rawFacts
      : parseKeyFacts(arr<string>(props.data.bullets)).map((fact) => ({
          key: fact.key,
          value: fact.value,
        }));
  return {
    facts,
    showFacts: facts.length > 0,
  };
};

export function KeyFactsCard(props: CardProps) {
  const cardState = createMemo(() => keyFactsCardState(props));
  return (
    <Show when={cardState().showFacts} fallback={<p class="text-xs text-on-surface-variant">No key facts extracted.</p>}>
      <dl class="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6">
        <For each={cardState().facts}>
          {(fact) => (
            <>
              <dt class="text-[11px] font-semibold uppercase tracking-wide text-outline">{fact.key}</dt>
              <dd class="text-xs text-on-surface">{fact.value}</dd>
            </>
          )}
        </For>
      </dl>
    </Show>
  );
}

// ── 3. SourcesCard ────────────────────────────────────────────────────────────

type SourceLinkRow = {
  title: string;
  href: string | undefined;
  snippet: string;
  showSnippet: boolean;
};

type SourcesCardState = {
  links: SourceLinkRow[];
  showLinks: boolean;
};

const sourcesCardState = (props: CardProps): SourcesCardState => {
  const links = arr<{ title: string; url: string; snippet?: string }>(props.data.sources).map((link) => {
    const snippet = str(link.snippet);
    return {
      title: link.title,
      href: safeHref(link.url),
      snippet,
      showSnippet: Boolean(snippet),
    };
  });
  return {
    links,
    showLinks: links.length > 0,
  };
};

export function SourcesCard(props: CardProps) {
  const cardState = createMemo(() => sourcesCardState(props));
  return (
    <Show when={cardState().showLinks} fallback={<p class="text-xs text-on-surface-variant">No sources available.</p>}>
      <ul class="space-y-2">
        <For each={cardState().links}>
          {(link) => (
            <li class="flex items-start gap-2">
              <span class="mt-0.5 text-xs text-outline">↗</span>
              <div>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs font-medium text-primary hover:underline"
                >
                  {link.title}
                </a>
                <Show when={link.showSnippet}>
                  <p class="mt-0.5 text-[11px] text-on-surface-variant">{link.snippet}</p>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

// ── 4. TimelineCard ───────────────────────────────────────────────────────────

type TimelineEventRow = {
  date: string;
  label: string;
  description: string;
  showDescription: boolean;
};

type TimelineCardState = {
  events: TimelineEventRow[];
  showEvents: boolean;
};

const timelineCardState = (props: CardProps): TimelineCardState => {
  const events = arr<{ date: string; label: string; description?: string }>(props.data.events).map((event) => {
    const description = str(event.description);
    return {
      date: event.date,
      label: event.label,
      description,
      showDescription: Boolean(description),
    };
  });
  return {
    events,
    showEvents: events.length > 0,
  };
};

export function TimelineCard(props: CardProps) {
  const cardState = createMemo(() => timelineCardState(props));
  return (
    <Show when={cardState().showEvents} fallback={<p class="text-xs text-on-surface-variant">No timeline events.</p>}>
      <ol class="relative space-y-4 border-l border-outline-variant/40 pl-4">
        <For each={cardState().events}>
          {(event) => (
            <li class="relative">
              <span class="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-white" />
              <p class="text-[11px] font-semibold text-primary">{event.date}</p>
              <p class="text-xs font-medium text-on-surface">{event.label}</p>
              <Show when={event.showDescription}>
                <p class="mt-0.5 text-[11px] text-on-surface-variant">{event.description}</p>
              </Show>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

// ── 5. DefinitionCard ─────────────────────────────────────────────────────────

type DefinitionCardState = {
  term: string;
  pronunciation: string;
  showPronunciation: boolean;
  partOfSpeech: string;
  showPartOfSpeech: boolean;
  definition: string;
  example: string;
  showExample: boolean;
};

const definitionCardState = (props: CardProps): DefinitionCardState => {
  const pronunciation = str(props.data.pronunciation);
  const partOfSpeech = str(props.data.part_of_speech);
  const example = str(props.data.example);
  return {
    term: str(props.data.term, props.subject),
    pronunciation,
    showPronunciation: Boolean(pronunciation),
    partOfSpeech,
    showPartOfSpeech: Boolean(partOfSpeech),
    definition: str(props.data.definition),
    example,
    showExample: Boolean(example),
  };
};

export function DefinitionCard(props: CardProps) {
  const cardState = createMemo(() => definitionCardState(props));
  return (
    <div class="space-y-2">
      <p class="text-base font-semibold heading-tight text-on-surface">{cardState().term}</p>
      <Show when={cardState().showPronunciation}>
        <p class="font-mono text-xs text-outline">/{cardState().pronunciation}/</p>
      </Show>
      <Show when={cardState().showPartOfSpeech}>
        <Pill>{cardState().partOfSpeech}</Pill>
      </Show>
      <p class="text-sm leading-relaxed text-on-surface-variant">{cardState().definition}</p>
      <Show when={cardState().showExample}>
        <p class="border-l-2 border-primary/30 pl-3 text-xs italic text-on-surface-variant">
          "{cardState().example}"
        </p>
      </Show>
    </div>
  );
}

// ── 6. ComparisonCard ─────────────────────────────────────────────────────────

type ComparisonRow = {
  attribute: string;
  values: string[];
};

type ComparisonCardState = {
  headers: string[];
  rows: ComparisonRow[];
  showRows: boolean;
};

const comparisonCardState = (props: CardProps): ComparisonCardState => {
  const rows = arr<{ attribute: string; values: string[] }>(props.data.rows).map((row) => ({
    attribute: row.attribute,
    values: arr<string>(row.values),
  }));
  return {
    headers: arr<string>(props.data.headers),
    rows,
    showRows: rows.length > 0,
  };
};

export function ComparisonCard(props: CardProps) {
  const cardState = createMemo(() => comparisonCardState(props));
  return (
    <Show when={cardState().showRows} fallback={<p class="text-xs text-on-surface-variant">No comparison data.</p>}>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-outline-variant/40">
              <th class="pb-2 pr-3 text-left font-semibold text-outline" />
              <For each={cardState().headers}>
                {(header) => <th class="pb-2 pr-3 text-left font-semibold text-on-surface">{header}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={cardState().rows}>
              {(row) => (
                <tr class="border-b border-outline-variant/20 last:border-0">
                  <td class="py-1.5 pr-3 font-medium text-on-surface-variant">{row.attribute}</td>
                  <For each={row.values}>{(value) => <td class="py-1.5 pr-3 text-on-surface">{value}</td>}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

// ── 7. CompoundCard (Science) ─────────────────────────────────────────────────

type CompoundMetricCard = {
  label: string;
  value: string;
};

type CompoundCardState = {
  formula: string;
  name: string;
  iupacName: string;
  showIupacName: boolean;
  className: string;
  showClassName: boolean;
  description: string;
  showDescription: boolean;
  metricCards: CompoundMetricCard[];
  showMetricCards: boolean;
};

const compoundCardState = (props: CardProps): CompoundCardState => {
  const className = str(props.data.class);
  const molarMass = str(props.data.molar_mass);
  const state = str(props.data.state);
  const metricCards: CompoundMetricCard[] = [];
  if (molarMass) metricCards.push({ label: "Molar mass", value: molarMass });
  if (state) metricCards.push({ label: "State (25 C)", value: state });
  return {
    formula: str(props.data.formula, "?"),
    name: str(props.data.name, props.subject),
    iupacName: str(props.data.iupac_name),
    showIupacName: Boolean(str(props.data.iupac_name)),
    className,
    showClassName: Boolean(className),
    description: str(props.data.description),
    showDescription: Boolean(str(props.data.description)),
    metricCards,
    showMetricCards: metricCards.length > 0,
  };
};

export function CompoundCard(props: CardProps) {
  const cardState = createMemo(() => compoundCardState(props));
  return (
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed/60 text-xl font-bold text-primary">
          {cardState().formula}
        </div>
        <div>
          <p class="text-sm font-semibold text-on-surface">{cardState().name}</p>
          <Show when={cardState().showIupacName}>
            <p class="text-xs text-on-surface-variant">{cardState().iupacName}</p>
          </Show>
          <Show when={cardState().showClassName}>
            <Pill tone="blue">{cardState().className}</Pill>
          </Show>
        </div>
      </div>
      <Show when={cardState().showDescription}>
        <p class="text-xs leading-relaxed text-on-surface-variant">{cardState().description}</p>
      </Show>
      <Show when={cardState().showMetricCards}>
        <div class="grid grid-cols-2 gap-2">
          <For each={cardState().metricCards}>
            {(metric) => (
              <div class="rounded-xl bg-white/50 p-2 text-center">
                <p class="label-caps">{metric.label}</p>
                <p class="text-sm font-semibold text-on-surface">{metric.value}</p>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={false}>
          <div class="rounded-xl bg-white/50 p-2 text-center">
            <p class="label-caps">State (25°C)</p>
            <p class="text-sm font-semibold text-on-surface">{str(props.data.state)}</p>
          </div>
        </Show>
    </div>
  );
}

// ── 8. ElementBreakdownCard (Science) ─────────────────────────────────────────
// Renders periodic-table-style element tiles + bond information.
// No 3D viewer — uses 2D SVG element tiles which covers the structural data fully.

const ELEMENT_COLORS: Record<string, string> = {
  H:"#6eb5ff", He:"#d9ffff", Li:"#cc80ff", Be:"#c2ff00", B:"#ffb5b5",
  C:"#909090", N:"#3050f8", O:"#ff0d0d", F:"#90e050", Ne:"#b3e3f5",
  Na:"#ab5cf2", Mg:"#8aff00", Al:"#bfa6a6", Si:"#f0c8a0", P:"#ff8000",
  S:"#ffff30", Cl:"#1ff01f", K:"#8f40d4", Ca:"#3dff00", Fe:"#e06633",
  Cu:"#c88033", Zn:"#7d80b0", Br:"#a62929", Ag:"#c0c0c0", I:"#940094",
};

type ElementTile = { symbol: string; name?: string; count: number };
type Bond = { type: string; description?: string; angle?: string; length?: string };

type ElementTileState = {
  symbol: string;
  name: string;
  showName: boolean;
  count: number;
  countText: string;
  backgroundStyle: string;
  borderStyle: string;
  textStyle: string;
};

type BondState = {
  type: string;
  description: string;
  angle: string;
  length: string;
  detailText: string;
};

type ElementBreakdownCardState = {
  elementTiles: ElementTileState[];
  bondRows: BondState[];
  showElementTiles: boolean;
  showBondRows: boolean;
};

const elementTileState = (element: ElementTile): ElementTileState => {
  const color = ELEMENT_COLORS[element.symbol] ?? "#cccccc";
  const name = str(element.name);
  return {
    symbol: element.symbol,
    name,
    showName: Boolean(name),
    count: element.count,
    countText: `x${element.count}`,
    backgroundStyle: `background: ${color}22;`,
    borderStyle: `border-color: ${color}55;`,
    textStyle: `color: ${color};`,
  };
};

const bondState = (bond: Bond): BondState => {
  const detailParts = [str(bond.description)];
  if (bond.angle) detailParts.push(`angle ${bond.angle}`);
  if (bond.length) detailParts.push(`length ${bond.length}`);
  return {
    type: bond.type,
    description: str(bond.description),
    angle: str(bond.angle),
    length: str(bond.length),
    detailText: detailParts.filter(Boolean).join(" - "),
  };
};

const elementBreakdownCardState = (props: CardProps): ElementBreakdownCardState => {
  const elementTiles = arr<ElementTile>(props.data.elements).map((element) => elementTileState(element));
  const bondRows = arr<Bond>(props.data.bonds).map((bond) => bondState(bond));
  return {
    elementTiles,
    bondRows,
    showElementTiles: elementTiles.length > 0,
    showBondRows: bondRows.length > 0,
  };
};

export function ElementBreakdownCard(props: CardProps) {
  const cardState = createMemo(() => elementBreakdownCardState(props));

  return (
    <div class="space-y-4">
      <Show when={cardState().showElementTiles}>
        <SectionLabel>Element composition</SectionLabel>
        <div class="flex flex-wrap gap-2">
          <For each={cardState().elementTiles}>
            {(element) => (
              <div
                class="flex w-16 flex-col items-center justify-center rounded-xl border border-white/40 py-2 text-center shadow-sm"
                style={`${element.backgroundStyle} ${element.borderStyle}`}
              >
                <span class="text-xl font-bold" style={element.textStyle}>{element.symbol}</span>
                <span class="mt-0.5 text-[10px] font-semibold text-on-surface">{element.countText}</span>
                <Show when={element.showName}>
                  <span class="text-[9px] text-on-surface-variant">{element.name}</span>
                </Show>
              </div>
            )}
        </For>
      </div>
      </Show>

      <Show when={cardState().showBondRows}>
        <SectionLabel>Bond information</SectionLabel>
        <dl class="space-y-1">
          <For each={cardState().bondRows}>
            {(bond) => (
              <div class="flex items-start gap-2 text-xs">
                <Pill tone="blue">{bond.type}</Pill>
                <span class="text-on-surface-variant">{bond.detailText}</span>
              </div>
            )}
          </For>
        </dl>
      </Show>
    </div>
  );
}

// ── 9. PropertiesTableCard (Science) ──────────────────────────────────────────

type PropertyRow = { property: string; value: string; unit?: string };

type PropertyRowState = {
  property: string;
  value: string;
  unit: string;
  showUnit: boolean;
};

type PropertiesTableCardState = {
  rows: PropertyRowState[];
  showRows: boolean;
};

const propertiesTableCardState = (props: CardProps): PropertiesTableCardState => {
  const rows = arr<PropertyRow>(props.data.properties).map((row) => {
    const unit = str(row.unit);
    return {
      property: row.property,
      value: row.value,
      unit,
      showUnit: Boolean(unit),
    };
  });
  return {
    rows,
    showRows: rows.length > 0,
  };
};

export function PropertiesTableCard(props: CardProps) {
  const cardState = createMemo(() => propertiesTableCardState(props));
  return (
    <Show when={cardState().showRows} fallback={<KeyFactsCard {...props} />}>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <tbody>
            <For each={cardState().rows}>
              {(row) => (
                <tr class="border-b border-outline-variant/20 last:border-0">
                  <td class="py-1.5 pr-4 font-medium text-on-surface-variant">{row.property}</td>
                  <td class="py-1.5 font-semibold text-on-surface">
                    {row.value}
                    <Show when={row.showUnit}>
                      <span class="ml-1 text-[10px] text-outline">{row.unit}</span>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

// ── 10. MapCard (Travel) ──────────────────────────────────────────────────────

type MapCardState = {
  location: string;
  coordinateText: string;
  hasCoords: boolean;
  highlights: string[];
  showHighlights: boolean;
  mapIcon: string;
};

const mapCardState = (props: CardProps): MapCardState => {
  const lat = num(props.data.lat);
  const lng = num(props.data.lng);
  const highlights = arr<string>(props.data.highlights);
  return {
    location: str(props.data.location, props.subject),
    coordinateText: `${lat.toFixed(4)} deg N, ${lng.toFixed(4)} deg E`,
    hasCoords: lat !== 0 || lng !== 0,
    highlights,
    showHighlights: highlights.length > 0,
    mapIcon: "📍",
  };
};

export function MapCard(props: CardProps) {
  const cardState = createMemo(() => mapCardState(props));

  return (
    <div class="space-y-3">
      <div class="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-sky-100/80 to-indigo-100/60 border border-white/40">
        <Show when={cardState().hasCoords} fallback={
          <div class="text-center">
            <span class="text-3xl">{cardState().mapIcon}</span>
            <p class="mt-1 text-xs font-medium text-on-surface">{cardState().location}</p>
            <p class="text-[10px] text-on-surface-variant">Map preview</p>
          </div>
        }>
          <div class="text-center">
            <span class="text-3xl">{cardState().mapIcon}</span>
            <p class="mt-1 text-xs font-medium text-on-surface">{cardState().location}</p>
            <p class="font-mono text-[10px] text-on-surface-variant">{cardState().coordinateText}</p>
          </div>
        </Show>
      </div>
      <Show when={cardState().showHighlights}>
        <ul class="space-y-0.5">
          <For each={cardState().highlights}>
            {(h) => <li class="flex items-center gap-1.5 text-xs text-on-surface-variant"><span class="text-primary">·</span>{h}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}

// ── 11. WeatherCard (Travel) ──────────────────────────────────────────────────

const WEATHER_ICONS: Record<string, string> = {
  sunny: "☀️", clear: "☀️", cloudy: "☁️", "partly cloudy": "⛅",
  rain: "🌧️", rainy: "🌧️", snow: "❄️", windy: "💨", stormy: "⛈️",
};

type WeatherMetricCard = {
  label: string;
  value: string;
};

type WeatherCardState = {
  icon: string;
  averageTemp: string;
  conditions: string;
  metrics: WeatherMetricCard[];
  tip: string;
  showTip: boolean;
};

const weatherIcon = (conditions: string): string => {
  const normalizedConditions = conditions.toLowerCase();
  for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
    if (normalizedConditions.includes(key)) return icon;
  }
  return "🌡️";
};

const weatherCardState = (props: CardProps): WeatherCardState => {
  const conditions = str(props.data.conditions);
  const metrics: WeatherMetricCard[] = [
    { label: "High", value: String(props.data.high_temp ?? "—") },
    { label: "Low", value: String(props.data.low_temp ?? "—") },
    { label: "Rain days", value: String(props.data.rain_days ?? "—") },
  ];
  const tip = str(props.data.tip);
  return {
    icon: weatherIcon(conditions),
    averageTemp: str(props.data.avg_temp, "—"),
    conditions,
    metrics,
    tip,
    showTip: Boolean(tip),
  };
};

export function WeatherCard(props: CardProps) {
  const cardState = createMemo(() => weatherCardState(props));
  return (
    <div class="space-y-3">
      <div class="flex items-center gap-4">
        <span class="text-4xl">{cardState().icon}</span>
        <div>
          <p class="text-2xl font-bold heading-tight text-on-surface">{cardState().averageTemp}</p>
          <p class="text-xs text-on-surface-variant">{cardState().conditions}</p>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <For each={cardState().metrics}>
          {(metric) => (
            <div class="rounded-xl bg-white/50 py-2">
              <p class="label-caps">{metric.label}</p>
              <p class="text-sm font-semibold text-on-surface">{metric.value}</p>
            </div>
          )}
        </For>
      </div>
      <Show when={cardState().showTip}>
        <p class="rounded-xl bg-primary-fixed/40 px-3 py-2 text-xs text-primary">{cardState().tip}</p>
      </Show>
    </div>
  );
}

// ── 12. FlightsCard (Travel) ──────────────────────────────────────────────────

export function FlightsCard(props: CardProps) {
  type Flight = { id: string; airline: string; price: string; duration: string; stops: number; departure: string };
  type FlightCardState = {
    id: string;
    airline: string;
    price: string;
    metadataItems: string[];
    metadataSeparator: string;
  };
  type FlightsCardState = {
    flights: FlightCardState[];
    showFlights: boolean;
    emptyText: string;
  };
  const flightsCardState = (): FlightsCardState => {
    const flights = arr<Flight>(props.data.options).map((flight) => ({
      id: flight.id,
      airline: flight.airline,
      price: flight.price,
      metadataItems: [
        flight.departure,
        flight.duration,
        flight.stops === 0 ? "Nonstop" : `${flight.stops} stop`,
      ],
      metadataSeparator: "|",
    }));
    return {
      flights,
      showFlights: flights.length > 0,
      emptyText: "Flight data loading...",
    };
  };
  const cardState = createMemo(() => flightsCardState());
  const [selected, setSelected] = createSignal<string | null>(null);

  return (
    <div class="space-y-2">
      <Show when={cardState().showFlights} fallback={<p class="text-xs text-on-surface-variant">{cardState().emptyText}</p>}>
        <For each={cardState().flights}>
          {(f) => (
            <button
              type="button"
              class={`w-full rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                selected() === f.id
                  ? "border-primary/40 bg-primary-fixed/50"
                  : "border-outline-variant/30 bg-white/50 hover:bg-white/70"
              }`}
              onClick={() => {
                setSelected(f.id);
                props.ctx.setState({ ...props.ctx.state(), params: { ...props.ctx.state().params, selectedFlight: f.id } });
              }}
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-on-surface">{f.airline}</span>
                <span class="font-bold text-primary">{f.price}</span>
              </div>
              <div class="mt-0.5 flex items-center gap-2 text-on-surface-variant">
                <For each={f.metadataItems}>
                  {(item, index) => (
                    <>
                      <Show when={index() > 0}>
                        <span class="text-[10px]">{f.metadataSeparator}</span>
                      </Show>
                      <span>{item}</span>
                    </>
                  )}
                </For>
              </div>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}

// ── 13. AccommodationCard (Travel) ────────────────────────────────────────────

export function AccommodationCard(props: CardProps) {
  type Hotel = { name: string; price_per_night: string; rating?: number; highlights?: string[] };
  type HotelCardState = {
    name: string;
    pricePerNight: string;
    ratingStars: string;
    showRating: boolean;
    highlightsText: string;
    showHighlights: boolean;
  };
  type AccommodationCardState = {
    hotels: HotelCardState[];
    showHotels: boolean;
  };
  const accommodationCardState = (): AccommodationCardState => {
    const hotels = arr<Hotel>(props.data.options).map((hotel) => {
      const roundedRating = Math.round(hotel.rating ?? 0);
      const highlightsText = (hotel.highlights ?? []).join(" | ");
      return {
        name: hotel.name,
        pricePerNight: hotel.price_per_night,
        ratingStars: `${"★".repeat(roundedRating)}${"☆".repeat(5 - roundedRating)}`,
        showRating: Boolean(hotel.rating),
        highlightsText,
        showHighlights: Boolean(highlightsText),
      };
    });
    return {
      hotels,
      showHotels: hotels.length > 0,
    };
  };
  const cardState = createMemo(() => accommodationCardState());
  return (
    <Show when={cardState().showHotels} fallback={<p class="text-xs text-on-surface-variant">No accommodation options.</p>}>
      <div class="space-y-2">
        <For each={cardState().hotels}>
          {(h) => (
            <div class="rounded-xl border border-outline-variant/30 bg-white/50 px-3 py-2">
              <div class="flex items-start justify-between">
                <p class="text-xs font-semibold text-on-surface">{h.name}</p>
                <p class="text-xs font-bold text-primary">{h.pricePerNight}<span class="font-normal text-outline">/night</span></p>
              </div>
              <Show when={h.showRating}>
                <p class="mt-0.5 text-[11px] text-amber-500">{h.ratingStars}</p>
              </Show>
              <Show when={h.showHighlights}>
                <p class="mt-1 text-[11px] text-on-surface-variant">{h.highlightsText}</p>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

// ── 14. ActivitiesCard (Travel) ───────────────────────────────────────────────

export function ActivitiesCard(props: CardProps) {
  type Activity = { name: string; duration?: string; category?: string; price?: string };
  type ActivityCardState = {
    name: string;
    icon: string;
    detailText: string;
    showDetailText: boolean;
  };
  type ActivitiesCardState = {
    items: ActivityCardState[];
    showItems: boolean;
  };
  const activityIcon = (category?: string): string => {
    switch (category) {
      case "food":
        return "🍜";
      case "culture":
        return "🏯";
      case "nature":
        return "🌿";
      default:
        return "✦";
    }
  };
  const activitiesCardState = (): ActivitiesCardState => {
    const items = arr<Activity>(props.data.activities).map((activity) => {
      const detailText = [activity.duration, activity.price].filter(Boolean).join(" | ");
      return {
        name: activity.name,
        icon: activityIcon(activity.category),
        detailText,
        showDetailText: Boolean(detailText),
      };
    });
    return {
      items,
      showItems: items.length > 0,
    };
  };
  const cardState = createMemo(() => activitiesCardState());
  return (
    <Show when={cardState().showItems} fallback={<p class="text-xs text-on-surface-variant">No activities listed.</p>}>
      <ul class="space-y-1.5">
        <For each={cardState().items}>
          {(a) => (
            <li class="flex items-center gap-2 rounded-xl bg-white/40 px-3 py-1.5">
              <span class="text-base">{a.icon}</span>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-on-surface">{a.name}</p>
                <Show when={a.showDetailText}>
                  <p class="text-[11px] text-on-surface-variant">{a.detailText}</p>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

// ── 15. ItineraryCard (Travel) ────────────────────────────────────────────────

export function ItineraryCard(props: CardProps) {
  type Day = { day: string | number; location?: string; activities: string[] };
  type ItineraryDayState = {
    heading: string;
    activities: string[];
  };
  type ItineraryCardState = {
    days: ItineraryDayState[];
    showDays: boolean;
  };
  const itineraryCardState = (): ItineraryCardState => {
    const days = arr<Day>(props.data.days).map((day) => ({
      heading: `Day ${day.day}${day.location ? ` — ${day.location}` : ""}`,
      activities: day.activities,
    }));
    return {
      days,
      showDays: days.length > 0,
    };
  };
  const cardState = createMemo(() => itineraryCardState());
  return (
    <Show when={cardState().showDays} fallback={<p class="text-xs text-on-surface-variant">No itinerary days.</p>}>
      <ol class="space-y-3">
      <For each={cardState().days}>
        {(d) => (
          <li class="relative border-l-2 border-primary/20 pl-4">
            <p class="text-[11px] font-bold uppercase tracking-wide text-primary">{d.heading}</p>
            <ul class="mt-1 space-y-0.5">
              <For each={d.activities}>{(a) => <li class="text-xs text-on-surface-variant">- {a}</li>}</For>
            </ul>
          </li>
        )}
      </For>
      </ol>
    </Show>
  );
}

// ── 16. PriceMetricsCard (Finance) ────────────────────────────────────────────

export function PriceMetricsCard(props: CardProps) {
  type PriceMetricsCardState = {
    priceText: string;
    changeText: string;
    directionIcon: string;
    badgeClass: string;
  };
  const priceMetricsCardState = (): PriceMetricsCardState => {
    const change = num(props.data.change_pct);
    const isUp = change >= 0;
    return {
      priceText: str(props.data.price, "—"),
      changeText: `${Math.abs(change).toFixed(2)}%`,
      directionIcon: isUp ? "▲" : "▼",
      badgeClass: isUp
        ? "bg-secondary-container text-secondary"
        : "bg-red-100/80 text-error",
    };
  };
  const cardState = createMemo(() => priceMetricsCardState());
  return (
    <div class="space-y-3">
      <div class="flex items-end gap-3">
        <p class="text-3xl font-bold heading-tight text-on-surface">{cardState().priceText}</p>
        <span class={`mb-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cardState().badgeClass}`}>
          {cardState().directionIcon} {cardState().changeText}
        </span>
      </div>
      <KeyFactsCard {...props} />
    </div>
  );
}

// ── 17. IngredientsCard (Recipe) ──────────────────────────────────────────────

export function IngredientsCard(props: CardProps) {
  type Ingredient = { name: string; amount: string; unit?: string; note?: string };
  type IngredientRowState = {
    amountText: string;
    name: string;
    noteText: string;
    showNote: boolean;
  };
  type IngredientsCardState = {
    servings: number;
    rows: IngredientRowState[];
    showRows: boolean;
    decrementLabel: string;
    incrementLabel: string;
  };
  const [servings, setServings] = createSignal(num(props.data.servings, 4));
  const base = num(props.data.servings, 4);
  const ratio = () => servings() / base;
  const ingredientsCardState = (): IngredientsCardState => {
    const rows = arr<Ingredient>(props.data.ingredients).map((ingredient) => {
      const scaledAmount = (parseFloat(ingredient.amount) * ratio()).toFixed(1).replace(/\.0$/, "");
      const amountText = `${scaledAmount} ${ingredient.unit ?? ""}`.trim();
      const noteText = str(ingredient.note);
      return {
        amountText,
        name: ingredient.name,
        noteText,
        showNote: Boolean(noteText),
      };
    });
    return {
      servings: servings(),
      rows,
      showRows: rows.length > 0,
      decrementLabel: "−",
      incrementLabel: "+",
    };
  };
  const cardState = createMemo(() => ingredientsCardState());
  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <p class="label-caps flex-1">Servings</p>
        <button type="button" class="h-6 w-6 rounded-full bg-white/60 text-sm hover:bg-white/80" onClick={() => setServings(Math.max(1, servings() - 1))}>{cardState().decrementLabel}</button>
        <span class="w-6 text-center text-sm font-semibold text-on-surface">{cardState().servings}</span>
        <button type="button" class="h-6 w-6 rounded-full bg-white/60 text-sm hover:bg-white/80" onClick={() => setServings(servings() + 1)}>{cardState().incrementLabel}</button>
      </div>
      <ul class="space-y-1.5">
        <For each={cardState().rows}>
          {(i) => (
            <li class="flex items-baseline gap-2 text-xs">
              <span class="min-w-[60px] font-semibold text-primary">{i.amountText}</span>
              <span class="text-on-surface">{i.name}</span>
              <Show when={i.showNote}><span class="text-on-surface-variant">({i.noteText})</span></Show>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

// ── 18. StepsCard (Recipe) ────────────────────────────────────────────────────

export function StepsCard(props: CardProps) {
  type Step = { step: number; instruction: string; duration?: string };
  type StepTabState = {
    stepNumber: number;
    activeClass: string;
    inactiveClass: string;
  };
  type StepDetailState = {
    heading: string;
    instruction: string;
    duration: string;
    showDuration: boolean;
  };
  type StepsCardState = {
    tabs: StepTabState[];
    activeIndex: number;
    activeStep: StepDetailState | null;
  };
  const [active, setActive] = createSignal(0);
  const stepsCardState = (): StepsCardState => {
    const steps = arr<Step>(props.data.steps);
    const activeIndex = active();
    const tabs = steps.map((step, index) => ({
      stepNumber: step.step,
      activeClass: index === activeIndex ? "bg-primary text-white" : "",
      inactiveClass: index === activeIndex ? "" : "bg-white/60 text-on-surface-variant hover:bg-white/80",
    }));
    const currentStep = steps[activeIndex];
    return {
      tabs,
      activeIndex,
      activeStep: currentStep
        ? {
            heading: `Step ${currentStep.step}`,
            instruction: currentStep.instruction,
            duration: str(currentStep.duration),
            showDuration: Boolean(currentStep.duration),
          }
        : null,
    };
  };
  const cardState = createMemo(() => stepsCardState());
  return (
    <div class="space-y-3">
      <div class="flex gap-1.5 flex-wrap">
        <For each={cardState().tabs}>
          {(stepTab, i) => (
            <button
              type="button"
              class={`h-6 w-6 rounded-full text-xs font-semibold transition ${stepTab.activeClass || stepTab.inactiveClass}`}
              onClick={() => setActive(i())}
            >
              {stepTab.stepNumber}
            </button>
          )}
        </For>
      </div>
      <Show when={cardState().activeStep}>
        {(step) => (
          <div class="rounded-xl bg-white/50 p-3">
            <div class="flex items-center justify-between mb-1">
              <p class="label-caps text-primary">{step().heading}</p>
              <Show when={step().showDuration}><Pill tone="green">{step().duration}</Pill></Show>
            </div>
            <p class="text-xs leading-relaxed text-on-surface">{step().instruction}</p>
          </div>
        )}
      </Show>
    </div>
  );
}

// ── 19. CodeSnippetCard (Dev) ─────────────────────────────────────────────────

export function CodeSnippetCard(props: CardProps) {
  type CodeSnippetCardState = {
    language: string;
    showLanguage: boolean;
    copyLabel: string;
    code: string;
    explanation: string;
    showExplanation: boolean;
  };
  const [copied, setCopied] = createSignal(false);
  function copy() {
    void navigator.clipboard.writeText(str(props.data.code)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  const codeSnippetCardState = (): CodeSnippetCardState => {
    const language = str(props.data.language);
    const explanation = str(props.data.explanation);
    return {
      language,
      showLanguage: Boolean(language),
      copyLabel: copied() ? "✓ Copied" : "Copy",
      code: str(props.data.code),
      explanation,
      showExplanation: Boolean(explanation),
    };
  };
  const cardState = createMemo(() => codeSnippetCardState());
  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Show when={cardState().showLanguage}>
          <Pill tone="blue">{cardState().language}</Pill>
        </Show>
        <button type="button" class="text-[11px] text-outline hover:text-on-surface transition" onClick={copy}>
          {cardState().copyLabel}
        </button>
      </div>
      <pre class="overflow-x-auto rounded-xl bg-on-surface/5 p-3 font-mono text-[11px] leading-relaxed text-on-surface">
        <code>{cardState().code}</code>
      </pre>
      <Show when={cardState().showExplanation}>
        <p class="text-xs text-on-surface-variant">{cardState().explanation}</p>
      </Show>
    </div>
  );
}

// ── 20. ProfileCard (Bio / People) ────────────────────────────────────────────

type ProfileCardState = {
  emoji: string;
  name: string;
  role: string;
  nationality: string;
  showNationality: boolean;
  bio: string;
  knownFor: string[];
  showKnownFor: boolean;
};

const profileCardState = (props: CardProps): ProfileCardState => {
  const nationality = str(props.data.nationality);
  const knownFor = arr<string>(props.data.known_for);
  return {
    emoji: str(props.data.emoji, "👤"),
    name: str(props.data.name, props.subject),
    role: str(props.data.role),
    nationality,
    showNationality: Boolean(nationality),
    bio: str(props.data.bio),
    knownFor,
    showKnownFor: knownFor.length > 0,
  };
};

export function ProfileCard(props: CardProps) {
  const cardState = createMemo(() => profileCardState(props));
  return (
    <div class="space-y-3">
      <div class="flex items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-fixed/60 text-2xl">
          {cardState().emoji}
        </div>
        <div>
          <p class="text-sm font-semibold text-on-surface">{cardState().name}</p>
          <p class="text-xs text-on-surface-variant">{cardState().role}</p>
          <Show when={cardState().showNationality}>
            <Pill>{cardState().nationality}</Pill>
          </Show>
        </div>
      </div>
      <p class="text-xs leading-relaxed text-on-surface-variant">{cardState().bio}</p>
      <Show when={cardState().showKnownFor}>
        <div class="flex flex-wrap gap-1">
          <For each={cardState().knownFor}>
            {(item) => <Pill tone="blue">{item}</Pill>}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── Card registry ─────────────────────────────────────────────────────────────

export const CARD_REGISTRY: Record<CardType, Component<CardProps>> = {
  summary:           SummaryCard,
  key_facts:         KeyFactsCard,
  sources:           SourcesCard,
  timeline:          TimelineCard,
  definition:        DefinitionCard,
  comparison:        ComparisonCard,
  compound:          CompoundCard,
  element_breakdown: ElementBreakdownCard,
  properties_table:  PropertiesTableCard,
  map:               MapCard,
  weather:           WeatherCard,
  flights:           FlightsCard,
  accommodation:     AccommodationCard,
  activities:        ActivitiesCard,
  itinerary:         ItineraryCard,
  price_metrics:     PriceMetricsCard,
  ingredients:       IngredientsCard,
  steps:             StepsCard,
  code_snippet:      CodeSnippetCard,
  profile:           ProfileCard,
};
