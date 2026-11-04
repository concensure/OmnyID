import { apiFetch } from "@/lib/api";

export type GrowthTab = "executive" | "campaigns" | "cohorts" | "benchmarks" | "quality";

export type GrowthKpiResult =
  | { state: "available"; numerator: number; denominator: number; value: number; unit: string }
  | { state: "provisional"; numerator: number; denominator: number; mature_on: string }
  | { state: "unavailable"; reason: string; numerator: number; denominator: number };

export type GrowthSnapshot = {
  definition_version: string;
  cost_per_landing_session: GrowthKpiResult;
  signup_rate: GrowthKpiResult;
  activation_rate_7d: GrowthKpiResult;
  cost_per_activated_wedding: GrowthKpiResult;
  return_rate_days_1_to_7: GrowthKpiResult;
  paid_cac_30d: GrowthKpiResult;
};

export type GrowthOverview = {
  meta: GrowthMeta;
  comparison: { current: GrowthSnapshot; previous: GrowthSnapshot };
  funnel: Record<string, number>;
};

export type GrowthMeta = {
  definition_version: string;
  timezone: string;
  attribution_model: string;
  from: string;
  through: string;
  source: string | null;
};

export type GrowthCampaign = {
  source: string;
  medium: string;
  campaign: string;
  intent: string;
  spend_aud_minor: number;
  meta_landing_views: number;
  first_party_landing_sessions: number;
  registered_weddings: number;
  activated_weddings: number;
  returned_weddings_days_1_to_7: number;
  paid_weddings_within_30d: number;
  gross_minor: number;
  refunded_minor: number;
};

export type GrowthCohort = {
  week_start: string;
  registered_weddings: number;
  mature_registered_weddings_7d: number;
  activated_within_7d: number;
  mature_activated_weddings_7d: number;
  returned_weddings_days_1_to_7: number;
  mature_registered_weddings_30d: number;
  paid_within_30d: number;
};

export type GrowthQuality = {
  latest_public_event_at: string | null;
  latest_spend_import_at: string | null;
  latest_rollup_at: string | null;
  first_party_landing_views: number;
  meta_landing_views: number;
  unattributed_sessions: number;
  unmatched_spend_aud_minor: number;
  payment_rows: number;
  payment_rows_missing_tax: number;
  duplicate_events_discarded: number | null;
  bot_or_test_events_excluded: number | null;
};

type GrowthList<T> = { meta: GrowthMeta; items: T[]; notice?: string; has_more?: boolean };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function meta(value: unknown): GrowthMeta {
  const source = record(value);
  return {
    definition_version: text(source.definition_version, "unknown"),
    timezone: text(source.timezone, "Australia/Sydney"),
    attribution_model: text(source.attribution_model, "first_touch"),
    from: text(source.from),
    through: text(source.through),
    source: nullableText(source.source),
  };
}

function kpi(value: unknown): GrowthKpiResult {
  const source = record(value);
  const state = text(source.state);
  const numerator = numberValue(source.numerator);
  const denominator = numberValue(source.denominator);
  if (state === "available") {
    return { state, numerator, denominator, value: numberValue(source.value), unit: text(source.unit) };
  }
  if (state === "provisional") {
    return { state, numerator, denominator, mature_on: text(source.mature_on) };
  }
  return { state: "unavailable", reason: text(source.reason, "unknown"), numerator, denominator };
}

function snapshot(value: unknown): GrowthSnapshot {
  const source = record(value);
  return {
    definition_version: text(source.definition_version, "unknown"),
    cost_per_landing_session: kpi(source.cost_per_landing_session),
    signup_rate: kpi(source.signup_rate),
    activation_rate_7d: kpi(source.activation_rate_7d),
    cost_per_activated_wedding: kpi(source.cost_per_activated_wedding),
    return_rate_days_1_to_7: kpi(source.return_rate_days_1_to_7),
    paid_cac_30d: kpi(source.paid_cac_30d),
  };
}

export function normalizeGrowthOverview(value: unknown): GrowthOverview {
  const source = record(value);
  const comparison = record(source.comparison);
  const funnel = record(source.funnel);
  return {
    meta: meta(source.meta),
    comparison: { current: snapshot(comparison.current), previous: snapshot(comparison.previous) },
    funnel: Object.fromEntries([
      "landing_sessions", "registered_weddings", "activated_weddings",
      "returned_weddings_days_1_to_7", "paid_weddings_within_30d",
    ].map((key) => [key, numberValue(funnel[key])])),
  };
}

function normalizeCampaign(value: unknown): GrowthCampaign {
  const source = record(value);
  return {
    source: text(source.source, "unknown"), medium: text(source.medium, "unknown"),
    campaign: text(source.campaign, "unknown"), intent: text(source.intent, "none"),
    spend_aud_minor: numberValue(source.spend_aud_minor), meta_landing_views: numberValue(source.meta_landing_views),
    first_party_landing_sessions: numberValue(source.first_party_landing_sessions),
    registered_weddings: numberValue(source.registered_weddings), activated_weddings: numberValue(source.activated_weddings),
    returned_weddings_days_1_to_7: numberValue(source.returned_weddings_days_1_to_7),
    paid_weddings_within_30d: numberValue(source.paid_weddings_within_30d),
    gross_minor: numberValue(source.gross_minor), refunded_minor: numberValue(source.refunded_minor),
  };
}

function normalizeCohort(value: unknown): GrowthCohort {
  const source = record(value);
  return {
    week_start: text(source.week_start), registered_weddings: numberValue(source.registered_weddings),
    mature_registered_weddings_7d: numberValue(source.mature_registered_weddings_7d),
    activated_within_7d: numberValue(source.activated_within_7d),
    mature_activated_weddings_7d: numberValue(source.mature_activated_weddings_7d),
    returned_weddings_days_1_to_7: numberValue(source.returned_weddings_days_1_to_7),
    mature_registered_weddings_30d: numberValue(source.mature_registered_weddings_30d),
    paid_within_30d: numberValue(source.paid_within_30d),
  };
}

function query(from: string, through: string): string {
  return new URLSearchParams({ from, through, attribution_model: "first_touch" }).toString();
}

export const fetchGrowthOverview = (from: string, through: string) =>
  apiFetch<unknown>(`/admin/growth/overview?${query(from, through)}`).then(normalizeGrowthOverview);

export const fetchGrowthCampaigns = (from: string, through: string) =>
  apiFetch<unknown>(`/admin/growth/campaigns?${query(from, through)}&page_size=100`).then((value) => {
    const source = record(value);
    return { meta: meta(source.meta), items: Array.isArray(source.items) ? source.items.map(normalizeCampaign) : [], has_more: source.has_more === true } satisfies GrowthList<GrowthCampaign>;
  });

export const fetchGrowthCohorts = (from: string, through: string) =>
  apiFetch<unknown>(`/admin/growth/cohorts?${query(from, through)}`).then((value) => {
    const source = record(value);
    return { meta: meta(source.meta), items: Array.isArray(source.items) ? source.items.map(normalizeCohort) : [] } satisfies GrowthList<GrowthCohort>;
  });

export const fetchGrowthBenchmarks = (from: string, through: string) =>
  apiFetch<unknown>(`/admin/growth/benchmarks?${query(from, through)}`).then((value) => {
    const source = record(value);
    return { meta: meta(source.meta), items: Array.isArray(source.items) ? source.items : [], notice: text(source.notice) } satisfies GrowthList<unknown>;
  });

export const fetchGrowthQuality = (from: string, through: string) =>
  apiFetch<unknown>(`/admin/growth/quality?${query(from, through)}`).then((value) => {
    const source = record(value);
    const quality = record(source.quality);
    return {
      meta: meta(source.meta),
      quality: {
        latest_public_event_at: nullableText(quality.latest_public_event_at),
        latest_spend_import_at: nullableText(quality.latest_spend_import_at),
        latest_rollup_at: nullableText(quality.latest_rollup_at),
        first_party_landing_views: numberValue(quality.first_party_landing_views),
        meta_landing_views: numberValue(quality.meta_landing_views),
        unattributed_sessions: numberValue(quality.unattributed_sessions),
        unmatched_spend_aud_minor: numberValue(quality.unmatched_spend_aud_minor),
        payment_rows: numberValue(quality.payment_rows), payment_rows_missing_tax: numberValue(quality.payment_rows_missing_tax),
        duplicate_events_discarded: nullableNumber(quality.duplicate_events_discarded),
        bot_or_test_events_excluded: nullableNumber(quality.bot_or_test_events_excluded),
      } satisfies GrowthQuality,
    };
  });

export function growthKpiLabel(result: GrowthKpiResult): string {
  if (result.state === "provisional") return "Provisional";
  if (result.state === "unavailable") return "Not available";
  if (result.unit === "basis_points") return `${(result.value / 100).toFixed(1)}%`;
  if (result.unit === "aud_minor_per_unit") return `$${(result.value / 100).toFixed(2)}`;
  return result.value.toLocaleString("en-AU");
}

export function growthKpiDetail(result: GrowthKpiResult): string {
  if (result.state === "provisional") return `Matures ${result.mature_on || "after its cohort window"}`;
  if (result.state === "unavailable") return result.reason.replace(/_/g, " ");
  return `${result.numerator.toLocaleString("en-AU")} ÷ ${result.denominator.toLocaleString("en-AU")}`;
}

export function growthDateRange(days = 30): { from: string; through: string } {
  const through = new Date();
  const from = new Date(through);
  from.setDate(from.getDate() - Math.max(0, days - 1));
  return { from: from.toISOString().slice(0, 10), through: through.toISOString().slice(0, 10) };
}
