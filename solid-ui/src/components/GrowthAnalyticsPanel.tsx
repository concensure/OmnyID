import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  fetchGrowthBenchmarks,
  fetchGrowthCampaigns,
  fetchGrowthCohorts,
  fetchGrowthOverview,
  fetchGrowthQuality,
  downloadGrowthCampaignCsv,
  growthDateRange,
  growthKpiDetail,
  growthKpiLabel,
  saveGrowthBenchmark,
  type GrowthBenchmark,
  type GrowthKpiResult,
  type GrowthSnapshot,
  type GrowthTab,
} from "@/lib/growthAnalyticsState";

const TABS: Array<{ id: GrowthTab; label: string }> = [
  { id: "executive", label: "Executive" },
  { id: "campaigns", label: "Campaigns" },
  { id: "cohorts", label: "Cohorts" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "quality", label: "Data quality" },
];

const KPI_CARDS: Array<{ key: string; label: string; description: string }> = [
  { key: "cost_per_landing_session", label: "Cost per visit", description: "Spend ÷ eligible first-party landing sessions" },
  { key: "signup_rate", label: "Signup rate", description: "New Wedding registrations ÷ eligible sessions" },
  { key: "activation_rate_7d", label: "7-day activation", description: "Activated within 7 days ÷ mature registrations" },
  { key: "cost_per_activated_wedding", label: "Cost per activation", description: "Spend ÷ acquired activated Weddings" },
  { key: "return_rate_days_1_to_7", label: "Days 1–7 return", description: "Later-day return ÷ mature activations" },
  { key: "paid_cac_30d", label: "30-day paid CAC", description: "Spend ÷ acquired paying Weddings" },
];

function moneyMinor(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value / 100);
}

function dateTime(value: string | null): string {
  if (!value) return "Unavailable";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(parsed) : value;
}

function benchmarkLabel(target: GrowthBenchmark | undefined): string {
  if (!target) return "No target set";
  return target.unit === "basis_points" ? `${(target.target_value / 100).toFixed(1)}%` : moneyMinor(target.target_value);
}

function KpiCard(props: { label: string; description: string; current: GrowthKpiResult; previous: GrowthKpiResult; target?: GrowthBenchmark }) {
  return (
    <article class="rounded-2xl border border-white/55 bg-white/75 p-4 shadow-card">
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{props.label}</p>
      <p class="mt-3 text-2xl font-semibold text-on-surface">{growthKpiLabel(props.current)}</p>
      <p class="mt-1 text-xs text-on-surface-variant">{growthKpiDetail(props.current)}</p>
      <div class="mt-3 border-t border-outline-variant/25 pt-3 text-xs text-on-surface-variant">
        <span class="font-medium">Previous:</span> {growthKpiLabel(props.previous)}
        <span class="mx-2" aria-hidden="true">·</span>
        <span class="font-medium">Target:</span> {benchmarkLabel(props.target)}
        <p class="mt-2" title={props.description}>Definition: {props.description}</p>
        <Show when={props.current.denominator > 0 && props.current.denominator < 30}>
          <p class="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">Small sample ({props.current.denominator}); do not treat this as a stable verdict.</p>
        </Show>
      </div>
    </article>
  );
}

export function GrowthAnalyticsPanel() {
  const initial = growthDateRange();
  const [activeTab, setActiveTab] = createSignal<GrowthTab>("executive");
  const [draftFrom, setDraftFrom] = createSignal(initial.from);
  const [draftThrough, setDraftThrough] = createSignal(initial.through);
  const [benchmarkKpi, setBenchmarkKpi] = createSignal("signup_rate");
  const [benchmarkValue, setBenchmarkValue] = createSignal("");
  const [benchmarkRationale, setBenchmarkRationale] = createSignal("");
  const [benchmarkSaving, setBenchmarkSaving] = createSignal(false);
  const [benchmarkNotice, setBenchmarkNotice] = createSignal<string | null>(null);
  const [exportBusy, setExportBusy] = createSignal(false);
  const [exportNotice, setExportNotice] = createSignal<string | null>(null);
  const [range, setRange] = createSignal(initial);
  const rangeKey = () => `${range().from}|${range().through}`;
  const [overview, { refetch: refetchOverview }] = createResource(rangeKey, async (key) => {
    const [from, through] = key.split("|");
    return fetchGrowthOverview(from, through);
  });
  const [campaigns, { refetch: refetchCampaigns }] = createResource(() => overview() && activeTab() === "campaigns" ? rangeKey() : undefined, async (key) => {
    const [from, through] = key.split("|");
    return fetchGrowthCampaigns(from, through);
  });
  const [cohorts, { refetch: refetchCohorts }] = createResource(() => overview() && activeTab() === "cohorts" ? rangeKey() : undefined, async (key) => {
    const [from, through] = key.split("|");
    return fetchGrowthCohorts(from, through);
  });
  const [benchmarks, { refetch: refetchBenchmarks }] = createResource(() => overview() ? rangeKey() : undefined, async (key) => {
    const [from, through] = key.split("|");
    return fetchGrowthBenchmarks(from, through);
  });
  const [quality, { refetch: refetchQuality }] = createResource(() => overview() && activeTab() === "quality" ? rangeKey() : undefined, async (key) => {
    const [from, through] = key.split("|");
    return fetchGrowthQuality(from, through);
  });
  const unavailable = createMemo(() => {
    const message = overview.error instanceof Error ? overview.error.message.toLowerCase() : "";
    return message.includes("operator access required") || message.includes("growth analytics is disabled");
  });
  const currentTargets = createMemo(() => {
    const targets = new Map<string, GrowthBenchmark>();
    for (const target of benchmarks()?.items ?? []) if (!targets.has(target.kpi_key)) targets.set(target.kpi_key, target);
    return targets;
  });
  const refresh = () => {
    void refetchOverview();
    if (activeTab() === "campaigns") void refetchCampaigns();
    if (activeTab() === "cohorts") void refetchCohorts();
    if (activeTab() === "benchmarks") void refetchBenchmarks();
    if (activeTab() === "quality") void refetchQuality();
  };
  const applyRange = (event: Event) => {
    event.preventDefault();
    if (!draftFrom() || !draftThrough() || draftFrom() > draftThrough()) return;
    setRange({ from: draftFrom(), through: draftThrough() });
  };
  const saveBenchmark = async (event: Event) => {
    event.preventDefault();
    const entered = Number(benchmarkValue());
    if (!Number.isFinite(entered) || entered < 0 || benchmarkRationale().trim().length < 10) {
      setBenchmarkNotice("Enter a non-negative target and a rationale of at least 10 characters.");
      return;
    }
    const isRate = ["signup_rate", "activation_rate_7d", "return_rate_days_1_to_7"].includes(benchmarkKpi());
    setBenchmarkSaving(true);
    setBenchmarkNotice(null);
    try {
      await saveGrowthBenchmark({
        kpi_key: benchmarkKpi(), target_value: Math.round(entered * 100),
        effective_from: range().from, rationale: benchmarkRationale().trim(),
      });
      setBenchmarkValue("");
      setBenchmarkRationale("");
      setBenchmarkNotice(`Saved ${isRate ? "percentage" : "AUD"} target as a new revision.`);
      await refetchBenchmarks();
    } catch (error) {
      setBenchmarkNotice(error instanceof Error ? error.message : "Target could not be saved.");
    } finally {
      setBenchmarkSaving(false);
    }
  };
  const downloadExport = async () => {
    setExportBusy(true);
    setExportNotice(null);
    try {
      const blob = await downloadGrowthCampaignCsv(range().from, range().through);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `omnyid-growth-${range().from}-${range().through}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportNotice("Aggregate campaign CSV downloaded and audited.");
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "Growth export could not be prepared.");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <Show when={!unavailable()}>
      <section data-a2ui-surface="admin-growth-analytics" class="rounded-[28px] border border-white/50 bg-gradient-to-br from-emerald-50/90 via-white/80 to-sky-50/70 p-4 shadow-panel sm:p-6">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-800/70">Admin · Growth</p>
            <h2 class="mt-2 text-2xl font-semibold text-on-surface">Campaign analytics</h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
              First-party acquisition, activation, return and payment evidence. Meta-reported views stay separate until campaign keys match.
            </p>
          </div>
          <form class="grid grid-cols-2 gap-2 sm:flex sm:items-end" onSubmit={applyRange}>
            <label class="text-xs font-medium text-on-surface-variant">
              From
              <input class="mt-1 min-h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3 text-sm" type="date" value={draftFrom()} onInput={(event) => setDraftFrom(event.currentTarget.value)} />
            </label>
            <label class="text-xs font-medium text-on-surface-variant">
              Through
              <input class="mt-1 min-h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3 text-sm" type="date" value={draftThrough()} onInput={(event) => setDraftThrough(event.currentTarget.value)} />
            </label>
            <button class="col-span-2 min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white sm:col-span-1" type="submit">Apply</button>
            <button class="col-span-2 min-h-11 rounded-xl border border-outline-variant/50 bg-white/80 px-4 text-sm font-semibold text-on-surface sm:col-span-1" type="button" onClick={refresh}>Refresh</button>
            <button class="col-span-2 min-h-11 rounded-xl border border-outline-variant/50 bg-white/80 px-4 text-sm font-semibold text-on-surface disabled:opacity-60 sm:col-span-1" type="button" disabled={exportBusy()} onClick={() => void downloadExport()}>{exportBusy() ? "Preparing…" : "Export CSV"}</button>
            <Show when={exportNotice()}><p class="col-span-2 text-xs text-on-surface-variant" role="status">{exportNotice()}</p></Show>
          </form>
        </div>

        <div class="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Growth analytics views">
          <For each={TABS}>{(tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab() === tab.id}
              class={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${activeTab() === tab.id ? "bg-emerald-800 text-white" : "border border-outline-variant/40 bg-white/75 text-on-surface"}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          )}</For>
        </div>

        <Show when={overview.loading}>
          <p class="mt-5 rounded-2xl bg-white/70 p-4 text-sm text-on-surface-variant" role="status">Loading content-free Growth aggregates…</p>
        </Show>
        <Show when={overview.error && !unavailable()}>
          <div class="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
            Growth analytics could not load. {overview.error instanceof Error ? overview.error.message : "Retry this panel."}
          </div>
        </Show>

        <Show when={activeTab() === "executive" && overview()}>
          <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <For each={KPI_CARDS}>{(card) => {
              const current = () => overview()!.comparison.current[card.key as keyof GrowthSnapshot] as GrowthKpiResult;
              const previous = () => overview()!.comparison.previous[card.key as keyof GrowthSnapshot] as GrowthKpiResult;
              return <KpiCard label={card.label} description={card.description} current={current()} previous={previous()} target={currentTargets().get(card.key)} />;
            }}</For>
          </div>
          <div class="mt-4 rounded-2xl border border-white/55 bg-white/75 p-4">
            <h3 class="font-semibold text-on-surface">Funnel</h3>
            <div class="mt-3 grid gap-2 sm:grid-cols-5">
              <For each={Object.entries(overview()!.funnel)}>{([key, value]) => (
                <div class="rounded-xl bg-surface-container-low p-3">
                  <p class="text-xl font-semibold text-on-surface">{value.toLocaleString("en-AU")}</p>
                  <p class="mt-1 text-xs text-on-surface-variant">{key.replace(/_/g, " ")}</p>
                </div>
              )}</For>
            </div>
          </div>
        </Show>

        <Show when={activeTab() === "campaigns"}>
          <div class="mt-5 space-y-3 md:hidden">
            <For each={campaigns()?.items ?? []} fallback={<p class="rounded-2xl bg-white/70 p-4 text-sm">No campaign rows in this period.</p>}>
              {(row) => (
                <article class="rounded-2xl border border-white/55 bg-white/75 p-4">
                  <h3 class="font-semibold text-on-surface">{row.campaign}</h3>
                  <p class="text-xs text-on-surface-variant">{row.source} · {row.medium} · {row.intent}</p>
                  <dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><dt class="text-xs text-on-surface-variant">Spend</dt><dd>{moneyMinor(row.spend_aud_minor)}</dd></div>
                    <div><dt class="text-xs text-on-surface-variant">First-party visits</dt><dd>{row.first_party_landing_sessions}</dd></div>
                    <div><dt class="text-xs text-on-surface-variant">Meta views</dt><dd>{row.meta_landing_views}</dd></div>
                    <div><dt class="text-xs text-on-surface-variant">Activated</dt><dd>{row.activated_weddings}</dd></div>
                  </dl>
                </article>
              )}
            </For>
          </div>
          <div class="mt-5 hidden overflow-x-auto rounded-2xl border border-white/55 bg-white/75 md:block">
            <table class="min-w-[900px] w-full text-left text-sm">
              <thead><tr class="border-b border-outline-variant/30 text-xs text-on-surface-variant"><For each={["Campaign","Source","Spend","First-party visits","Meta views","Signups","Activated","Returned","Paid"]}>{(label) => <th class="p-3 font-semibold">{label}</th>}</For></tr></thead>
              <tbody><For each={campaigns()?.items ?? []}>{(row) => <tr class="border-b border-outline-variant/20 last:border-0"><td class="p-3 font-medium">{row.campaign}</td><td class="p-3">{row.source}</td><td class="p-3">{moneyMinor(row.spend_aud_minor)}</td><td class="p-3">{row.first_party_landing_sessions}</td><td class="p-3">{row.meta_landing_views}</td><td class="p-3">{row.registered_weddings}</td><td class="p-3">{row.activated_weddings}</td><td class="p-3">{row.returned_weddings_days_1_to_7}</td><td class="p-3">{row.paid_weddings_within_30d}</td></tr>}</For></tbody>
            </table>
          </div>
        </Show>

        <Show when={activeTab() === "cohorts"}>
          <div class="mt-5 overflow-x-auto rounded-2xl border border-white/55 bg-white/75">
            <table class="min-w-[760px] w-full text-left text-sm">
              <thead><tr class="border-b border-outline-variant/30 text-xs text-on-surface-variant"><For each={["Week","Registered","Mature 7d","Activated 7d","Mature return","Returned 1–7","Mature 30d","Paid 30d"]}>{(label) => <th class="p-3 font-semibold">{label}</th>}</For></tr></thead>
              <tbody><For each={cohorts()?.items ?? []} fallback={<tr><td class="p-4" colSpan={8}>No signup cohorts in this period.</td></tr>}>{(row) => <tr class="border-b border-outline-variant/20 last:border-0"><td class="p-3 font-medium">{row.week_start}</td><td class="p-3">{row.registered_weddings}</td><td class="p-3">{row.mature_registered_weddings_7d}</td><td class="p-3">{row.activated_within_7d}</td><td class="p-3">{row.mature_activated_weddings_7d}</td><td class="p-3">{row.returned_weddings_days_1_to_7}</td><td class="p-3">{row.mature_registered_weddings_30d}</td><td class="p-3">{row.paid_within_30d}</td></tr>}</For></tbody>
            </table>
          </div>
        </Show>

        <Show when={activeTab() === "benchmarks"}>
          <div class="mt-5 rounded-2xl border border-white/55 bg-white/75 p-5">
            <h3 class="font-semibold text-on-surface">Targets and baselines</h3>
            <p class="mt-2 text-sm leading-6 text-on-surface-variant">{benchmarks()?.notice || "No reviewed target is available. No benchmark is inferred."}</p>
            <form class="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void saveBenchmark(event)}>
              <label class="text-sm font-medium text-on-surface">KPI
                <select class="mt-1 min-h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3" value={benchmarkKpi()} onChange={(event) => setBenchmarkKpi(event.currentTarget.value)}>
                  <For each={KPI_CARDS}>{(card) => <option value={card.key}>{card.label}</option>}</For>
                </select>
              </label>
              <label class="text-sm font-medium text-on-surface">Target ({["signup_rate", "activation_rate_7d", "return_rate_days_1_to_7"].includes(benchmarkKpi()) ? "%" : "AUD"})
                <input class="mt-1 min-h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3" type="number" min="0" step="0.01" value={benchmarkValue()} onInput={(event) => setBenchmarkValue(event.currentTarget.value)} />
              </label>
              <label class="text-sm font-medium text-on-surface md:col-span-2">Rationale
                <textarea class="mt-1 min-h-24 w-full rounded-xl border border-outline-variant/40 bg-white p-3" maxlength="500" value={benchmarkRationale()} onInput={(event) => setBenchmarkRationale(event.currentTarget.value)} placeholder="Why this internal target is appropriate" />
              </label>
              <button class="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={benchmarkSaving()}>{benchmarkSaving() ? "Saving…" : "Save target revision"}</button>
              <Show when={benchmarkNotice()}><p class="self-center text-sm text-on-surface-variant" role="status">{benchmarkNotice()}</p></Show>
            </form>
            <div class="mt-5 space-y-2">
              <For each={benchmarks()?.items ?? []}>{(target) => <article class="rounded-xl bg-surface-container-low p-3 text-sm"><div class="flex flex-wrap justify-between gap-2"><strong>{target.kpi_key.replace(/_/g, " ")}</strong><span>{benchmarkLabel(target)}</span></div><p class="mt-1 text-on-surface-variant">{target.rationale}</p><p class="mt-1 text-xs text-on-surface-variant">Effective {target.effective_from}{target.supersedes_id ? " · supersedes an earlier revision" : ""}</p></article>}</For>
            </div>
          </div>
        </Show>

        <Show when={activeTab() === "quality" && quality()}>
          <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <For each={[
              ["Latest public event", dateTime(quality()!.quality.latest_public_event_at)],
              ["Latest spend import", dateTime(quality()!.quality.latest_spend_import_at)],
              ["Latest rollup", dateTime(quality()!.quality.latest_rollup_at)],
              ["Unattributed sessions", quality()!.quality.unattributed_sessions.toLocaleString("en-AU")],
              ["Unmatched spend", moneyMinor(quality()!.quality.unmatched_spend_aud_minor)],
              ["Payments missing tax", `${quality()!.quality.payment_rows_missing_tax} of ${quality()!.quality.payment_rows}`],
              ["Immature 7-day signups", quality()!.quality.immature_registered_weddings_7d.toLocaleString("en-AU")],
              ["Immature 7-day activations", quality()!.quality.immature_activated_weddings_7d.toLocaleString("en-AU")],
            ]}>{(item) => <article class="rounded-2xl border border-white/55 bg-white/75 p-4"><p class="text-xs text-on-surface-variant">{item[0]}</p><p class="mt-2 font-semibold text-on-surface">{item[1]}</p></article>}</For>
          </div>
          <p class="mt-3 text-xs leading-5 text-on-surface-variant">Duplicate-discard and bot/test exclusion counters are shown as unavailable until a source authority records them; they are never assumed to be zero.</p>
        </Show>

        <Show when={overview()}>
          <p class="mt-5 text-xs leading-5 text-on-surface-variant">Definition {overview()!.meta.definition_version} · {overview()!.meta.timezone} · {overview()!.meta.attribution_model.replace(/_/g, " ")} · raw attribution is retained for a bounded period.</p>
        </Show>
      </section>
    </Show>
  );
}
