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
import type { PresentationStateCtx } from "@/lib/presentationState";
import { parseKeyFacts } from "@/lib/presentationState";

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

export function SummaryCard(props: CardProps) {
  const bullets = createMemo(() => arr<string>(props.data.bullets));
  return (
    <div class="space-y-3">
      <p class="text-sm leading-relaxed text-on-surface">{str(props.data.summary)}</p>
      <Show when={bullets().length > 0}>
        <ul class="space-y-1">
          <For each={bullets()}>
            {(b) => (
              <li class="flex items-start gap-2 text-xs text-on-surface-variant">
                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                {b}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

// ── 2. KeyFactsCard ───────────────────────────────────────────────────────────

export function KeyFactsCard(props: CardProps) {
  const facts = createMemo(() => {
    const raw = arr<{ key: string; value: string }>(props.data.facts);
    if (raw.length > 0) return raw;
    return parseKeyFacts(arr<string>(props.data.bullets));
  });
  return (
    <Show when={facts().length > 0} fallback={<p class="text-xs text-on-surface-variant">No key facts extracted.</p>}>
      <dl class="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6">
        <For each={facts()}>
          {(f) => (
            <>
              <dt class="text-[11px] font-semibold uppercase tracking-wide text-outline">{f.key}</dt>
              <dd class="text-xs text-on-surface">{f.value}</dd>
            </>
          )}
        </For>
      </dl>
    </Show>
  );
}

// ── 3. SourcesCard ────────────────────────────────────────────────────────────

export function SourcesCard(props: CardProps) {
  type Link = { title: string; url: string; snippet?: string };
  const links = createMemo(() => arr<Link>(props.data.sources));
  return (
    <Show when={links().length > 0} fallback={<p class="text-xs text-on-surface-variant">No sources available.</p>}>
      <ul class="space-y-2">
        <For each={links()}>
          {(l) => (
            <li class="flex items-start gap-2">
              <span class="mt-0.5 text-xs text-outline">↗</span>
              <div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs font-medium text-primary hover:underline"
                >
                  {l.title}
                </a>
                <Show when={l.snippet}>
                  <p class="mt-0.5 text-[11px] text-on-surface-variant">{l.snippet}</p>
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

export function TimelineCard(props: CardProps) {
  type Event = { date: string; label: string; description?: string };
  const events = createMemo(() => arr<Event>(props.data.events));
  return (
    <Show when={events().length > 0} fallback={<p class="text-xs text-on-surface-variant">No timeline events.</p>}>
      <ol class="relative space-y-4 border-l border-outline-variant/40 pl-4">
        <For each={events()}>
          {(e) => (
            <li class="relative">
              <span class="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-white" />
              <p class="text-[11px] font-semibold text-primary">{e.date}</p>
              <p class="text-xs font-medium text-on-surface">{e.label}</p>
              <Show when={e.description}>
                <p class="mt-0.5 text-[11px] text-on-surface-variant">{e.description}</p>
              </Show>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

// ── 5. DefinitionCard ─────────────────────────────────────────────────────────

export function DefinitionCard(props: CardProps) {
  return (
    <div class="space-y-2">
      <p class="text-base font-semibold heading-tight text-on-surface">{str(props.data.term, props.subject)}</p>
      <Show when={props.data.pronunciation}>
        <p class="font-mono text-xs text-outline">/{str(props.data.pronunciation)}/</p>
      </Show>
      <Show when={props.data.part_of_speech}>
        <Pill>{str(props.data.part_of_speech)}</Pill>
      </Show>
      <p class="text-sm leading-relaxed text-on-surface-variant">{str(props.data.definition)}</p>
      <Show when={props.data.example}>
        <p class="border-l-2 border-primary/30 pl-3 text-xs italic text-on-surface-variant">
          "{str(props.data.example)}"
        </p>
      </Show>
    </div>
  );
}

// ── 6. ComparisonCard ─────────────────────────────────────────────────────────

export function ComparisonCard(props: CardProps) {
  type Row = { attribute: string; values: string[] };
  const headers = createMemo(() => arr<string>(props.data.headers));
  const rows    = createMemo(() => arr<Row>(props.data.rows));
  return (
    <Show when={rows().length > 0} fallback={<p class="text-xs text-on-surface-variant">No comparison data.</p>}>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-outline-variant/40">
              <th class="pb-2 pr-3 text-left font-semibold text-outline" />
              <For each={headers()}>{(h) => <th class="pb-2 pr-3 text-left font-semibold text-on-surface">{h}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr class="border-b border-outline-variant/20 last:border-0">
                  <td class="py-1.5 pr-3 font-medium text-on-surface-variant">{row.attribute}</td>
                  <For each={row.values}>{(v) => <td class="py-1.5 pr-3 text-on-surface">{v}</td>}</For>
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

export function CompoundCard(props: CardProps) {
  return (
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed/60 text-xl font-bold text-primary">
          {str(props.data.formula, "?")}
        </div>
        <div>
          <p class="text-sm font-semibold text-on-surface">{str(props.data.name, props.subject)}</p>
          <p class="text-xs text-on-surface-variant">{str(props.data.iupac_name)}</p>
          <Show when={props.data.class}>
            <Pill tone="blue">{str(props.data.class)}</Pill>
          </Show>
        </div>
      </div>
      <p class="text-xs leading-relaxed text-on-surface-variant">{str(props.data.description)}</p>
      <div class="grid grid-cols-2 gap-2">
        <Show when={props.data.molar_mass}>
          <div class="rounded-xl bg-white/50 p-2 text-center">
            <p class="label-caps">Molar mass</p>
            <p class="text-sm font-semibold text-on-surface">{str(props.data.molar_mass)}</p>
          </div>
        </Show>
        <Show when={props.data.state}>
          <div class="rounded-xl bg-white/50 p-2 text-center">
            <p class="label-caps">State (25°C)</p>
            <p class="text-sm font-semibold text-on-surface">{str(props.data.state)}</p>
          </div>
        </Show>
      </div>
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

export function ElementBreakdownCard(props: CardProps) {
  const elements = createMemo(() => arr<ElementTile>(props.data.elements));
  type Bond = { type: string; description?: string; angle?: string; length?: string };
  const bonds = createMemo(() => arr<Bond>(props.data.bonds));

  return (
    <div class="space-y-4">
      <SectionLabel>Element composition</SectionLabel>
      <div class="flex flex-wrap gap-2">
        <For each={elements()}>
          {(el) => {
            const color = ELEMENT_COLORS[el.symbol] ?? "#cccccc";
            return (
              <div
                class="flex w-16 flex-col items-center justify-center rounded-xl border border-white/40 py-2 text-center shadow-sm"
                style={`background: ${color}22; border-color: ${color}55`}
              >
                <span class="text-xl font-bold" style={`color: ${color.replace("22","")}`}>{el.symbol}</span>
                <span class="mt-0.5 text-[10px] font-semibold text-on-surface">×{el.count}</span>
                <Show when={el.name}>
                  <span class="text-[9px] text-on-surface-variant">{el.name}</span>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={bonds().length > 0}>
        <SectionLabel>Bond information</SectionLabel>
        <dl class="space-y-1">
          <For each={bonds()}>
            {(b) => (
              <div class="flex items-start gap-2 text-xs">
                <Pill tone="blue">{b.type}</Pill>
                <span class="text-on-surface-variant">
                  {b.description}
                  {b.angle ? ` · angle ${b.angle}` : ""}
                  {b.length ? ` · length ${b.length}` : ""}
                </span>
              </div>
            )}
          </For>
        </dl>
      </Show>
    </div>
  );
}

// ── 9. PropertiesTableCard (Science) ──────────────────────────────────────────

export function PropertiesTableCard(props: CardProps) {
  type Prop = { property: string; value: string; unit?: string };
  const rows = createMemo(() => arr<Prop>(props.data.properties));
  return (
    <Show when={rows().length > 0} fallback={<KeyFactsCard {...props} />}>
      <table class="w-full text-xs">
        <tbody>
          <For each={rows()}>
            {(row) => (
              <tr class="border-b border-outline-variant/20 last:border-0">
                <td class="py-1.5 pr-4 font-medium text-on-surface-variant">{row.property}</td>
                <td class="py-1.5 font-semibold text-on-surface">
                  {row.value}
                  <Show when={row.unit}>
                    <span class="ml-1 text-[10px] text-outline">{row.unit}</span>
                  </Show>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  );
}

// ── 10. MapCard (Travel) ──────────────────────────────────────────────────────

export function MapCard(props: CardProps) {
  const lat = createMemo(() => num(props.data.lat));
  const lng = createMemo(() => num(props.data.lng));
  const hasCoords = createMemo(() => lat() !== 0 || lng() !== 0);

  return (
    <div class="space-y-3">
      <div class="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-sky-100/80 to-indigo-100/60 border border-white/40">
        <Show when={hasCoords()} fallback={
          <div class="text-center">
            <span class="text-3xl">📍</span>
            <p class="mt-1 text-xs font-medium text-on-surface">{str(props.data.location, props.subject)}</p>
            <p class="text-[10px] text-on-surface-variant">Map preview</p>
          </div>
        }>
          <div class="text-center">
            <span class="text-3xl">📍</span>
            <p class="mt-1 text-xs font-medium text-on-surface">{str(props.data.location, props.subject)}</p>
            <p class="font-mono text-[10px] text-on-surface-variant">{lat().toFixed(4)}°N, {lng().toFixed(4)}°E</p>
          </div>
        </Show>
      </div>
      <Show when={props.data.highlights}>
        <ul class="space-y-0.5">
          <For each={arr<string>(props.data.highlights)}>
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

export function WeatherCard(props: CardProps) {
  const icon = () => {
    const cond = str(props.data.conditions, "").toLowerCase();
    for (const [k, v] of Object.entries(WEATHER_ICONS)) {
      if (cond.includes(k)) return v;
    }
    return "🌡️";
  };
  return (
    <div class="space-y-3">
      <div class="flex items-center gap-4">
        <span class="text-4xl">{icon()}</span>
        <div>
          <p class="text-2xl font-bold heading-tight text-on-surface">{str(props.data.avg_temp, "—")}</p>
          <p class="text-xs text-on-surface-variant">{str(props.data.conditions)}</p>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "High",  v: props.data.high_temp },
          { label: "Low",   v: props.data.low_temp },
          { label: "Rain days", v: props.data.rain_days },
        ].map(({ label, v }) => (
          <div class="rounded-xl bg-white/50 py-2">
            <p class="label-caps">{label}</p>
            <p class="text-sm font-semibold text-on-surface">{String(v ?? "—")}</p>
          </div>
        ))}
      </div>
      <Show when={props.data.tip}>
        <p class="rounded-xl bg-primary-fixed/40 px-3 py-2 text-xs text-primary">{str(props.data.tip)}</p>
      </Show>
    </div>
  );
}

// ── 12. FlightsCard (Travel) ──────────────────────────────────────────────────

export function FlightsCard(props: CardProps) {
  type Flight = { id: string; airline: string; price: string; duration: string; stops: number; departure: string };
  const flights = createMemo(() => arr<Flight>(props.data.options));
  const [selected, setSelected] = createSignal<string | null>(null);

  return (
    <div class="space-y-2">
      <Show when={flights().length > 0} fallback={<p class="text-xs text-on-surface-variant">Flight data loading…</p>}>
        <For each={flights()}>
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
                <span>{f.departure}</span>
                <span class="text-[10px]">·</span>
                <span>{f.duration}</span>
                <span class="text-[10px]">·</span>
                <span>{f.stops === 0 ? "Nonstop" : `${f.stops} stop`}</span>
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
  const hotels = createMemo(() => arr<Hotel>(props.data.options));
  return (
    <div class="space-y-2">
      <For each={hotels()}>
        {(h) => (
          <div class="rounded-xl border border-outline-variant/30 bg-white/50 px-3 py-2">
            <div class="flex items-start justify-between">
              <p class="text-xs font-semibold text-on-surface">{h.name}</p>
              <p class="text-xs font-bold text-primary">{h.price_per_night}<span class="font-normal text-outline">/night</span></p>
            </div>
            <Show when={h.rating}>
              <p class="mt-0.5 text-[11px] text-amber-500">{"★".repeat(Math.round(h.rating ?? 0))}{"☆".repeat(5 - Math.round(h.rating ?? 0))}</p>
            </Show>
            <Show when={(h.highlights ?? []).length > 0}>
              <p class="mt-1 text-[11px] text-on-surface-variant">{h.highlights!.join(" · ")}</p>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

// ── 14. ActivitiesCard (Travel) ───────────────────────────────────────────────

export function ActivitiesCard(props: CardProps) {
  type Activity = { name: string; duration?: string; category?: string; price?: string };
  const items = createMemo(() => arr<Activity>(props.data.activities));
  return (
    <ul class="space-y-1.5">
      <For each={items()}>
        {(a) => (
          <li class="flex items-center gap-2 rounded-xl bg-white/40 px-3 py-1.5">
            <span class="text-base">{a.category === "food" ? "🍜" : a.category === "culture" ? "🏯" : a.category === "nature" ? "🌿" : "✦"}</span>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-on-surface">{a.name}</p>
              <Show when={a.duration || a.price}>
                <p class="text-[11px] text-on-surface-variant">{[a.duration, a.price].filter(Boolean).join(" · ")}</p>
              </Show>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

// ── 15. ItineraryCard (Travel) ────────────────────────────────────────────────

export function ItineraryCard(props: CardProps) {
  type Day = { day: string | number; location?: string; activities: string[] };
  const days = createMemo(() => arr<Day>(props.data.days));
  return (
    <ol class="space-y-3">
      <For each={days()}>
        {(d) => (
          <li class="relative border-l-2 border-primary/20 pl-4">
            <p class="text-[11px] font-bold uppercase tracking-wide text-primary">Day {d.day}{d.location ? ` — ${d.location}` : ""}</p>
            <ul class="mt-1 space-y-0.5">
              <For each={d.activities}>{(a) => <li class="text-xs text-on-surface-variant">· {a}</li>}</For>
            </ul>
          </li>
        )}
      </For>
    </ol>
  );
}

// ── 16. PriceMetricsCard (Finance) ────────────────────────────────────────────

export function PriceMetricsCard(props: CardProps) {
  const change = num(props.data.change_pct);
  const isUp = change >= 0;
  return (
    <div class="space-y-3">
      <div class="flex items-end gap-3">
        <p class="text-3xl font-bold heading-tight text-on-surface">{str(props.data.price, "—")}</p>
        <span class={`mb-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isUp ? "bg-secondary-container text-secondary" : "bg-red-100/80 text-error"}`}>
          {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
        </span>
      </div>
      <KeyFactsCard {...props} />
    </div>
  );
}

// ── 17. IngredientsCard (Recipe) ──────────────────────────────────────────────

export function IngredientsCard(props: CardProps) {
  type Ingredient = { name: string; amount: string; unit?: string; note?: string };
  const items = createMemo(() => arr<Ingredient>(props.data.ingredients));
  const [servings, setServings] = createSignal(num(props.data.servings, 4));
  const base = num(props.data.servings, 4);
  const ratio = () => servings() / base;
  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <p class="label-caps flex-1">Servings</p>
        <button type="button" class="h-6 w-6 rounded-full bg-white/60 text-sm hover:bg-white/80" onClick={() => setServings(Math.max(1, servings() - 1))}>−</button>
        <span class="w-6 text-center text-sm font-semibold text-on-surface">{servings()}</span>
        <button type="button" class="h-6 w-6 rounded-full bg-white/60 text-sm hover:bg-white/80" onClick={() => setServings(servings() + 1)}>+</button>
      </div>
      <ul class="space-y-1.5">
        <For each={items()}>
          {(i) => (
            <li class="flex items-baseline gap-2 text-xs">
              <span class="min-w-[60px] font-semibold text-primary">
                {(parseFloat(i.amount) * ratio()).toFixed(1).replace(/\.0$/, "")} {i.unit ?? ""}
              </span>
              <span class="text-on-surface">{i.name}</span>
              <Show when={i.note}><span class="text-on-surface-variant">({i.note})</span></Show>
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
  const steps = createMemo(() => arr<Step>(props.data.steps));
  const [active, setActive] = createSignal(0);
  return (
    <div class="space-y-3">
      <div class="flex gap-1.5 flex-wrap">
        <For each={steps()}>
          {(s, i) => (
            <button
              type="button"
              class={`h-6 w-6 rounded-full text-xs font-semibold transition ${i() === active() ? "bg-primary text-white" : "bg-white/60 text-on-surface-variant hover:bg-white/80"}`}
              onClick={() => setActive(i())}
            >
              {s.step}
            </button>
          )}
        </For>
      </div>
      <Show when={steps()[active()]}>
        {(step) => (
          <div class="rounded-xl bg-white/50 p-3">
            <div class="flex items-center justify-between mb-1">
              <p class="label-caps text-primary">Step {step().step}</p>
              <Show when={step().duration}><Pill tone="green">{step().duration!}</Pill></Show>
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
  const [copied, setCopied] = createSignal(false);
  function copy() {
    void navigator.clipboard.writeText(str(props.data.code)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Show when={props.data.language}>
          <Pill tone="blue">{str(props.data.language)}</Pill>
        </Show>
        <button type="button" class="text-[11px] text-outline hover:text-on-surface transition" onClick={copy}>
          {copied() ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre class="overflow-x-auto rounded-xl bg-on-surface/5 p-3 font-mono text-[11px] leading-relaxed text-on-surface">
        <code>{str(props.data.code)}</code>
      </pre>
      <Show when={props.data.explanation}>
        <p class="text-xs text-on-surface-variant">{str(props.data.explanation)}</p>
      </Show>
    </div>
  );
}

// ── 20. ProfileCard (Bio / People) ────────────────────────────────────────────

export function ProfileCard(props: CardProps) {
  return (
    <div class="space-y-3">
      <div class="flex items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-fixed/60 text-2xl">
          {str(props.data.emoji, "👤")}
        </div>
        <div>
          <p class="text-sm font-semibold text-on-surface">{str(props.data.name, props.subject)}</p>
          <p class="text-xs text-on-surface-variant">{str(props.data.role)}</p>
          <Show when={props.data.nationality}>
            <Pill>{str(props.data.nationality)}</Pill>
          </Show>
        </div>
      </div>
      <p class="text-xs leading-relaxed text-on-surface-variant">{str(props.data.bio)}</p>
      <Show when={(arr<string>(props.data.known_for)).length > 0}>
        <div class="flex flex-wrap gap-1">
          <For each={arr<string>(props.data.known_for)}>
            {(k) => <Pill tone="blue">{k}</Pill>}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── Card registry ─────────────────────────────────────────────────────────────

import type { CardType } from "@/lib/presentationState";

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
