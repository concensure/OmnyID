import { render } from "solid-js/web";
import "../../src/index.css";
import { GrowthAnalyticsPanel } from "../../src/components/GrowthAnalyticsPanel";

const available = (value: number, unit = "basis_points") => ({ state: "available", numerator: 2, denominator: 10, value, unit });
const snapshot = {
  definition_version: "growth-kpi-v1",
  cost_per_landing_session: available(200, "aud_minor_per_unit"),
  signup_rate: available(2000),
  activation_rate_7d: { state: "provisional", numerator: 1, denominator: 0, mature_on: "2026-11-12" },
  cost_per_activated_wedding: available(2000, "aud_minor_per_unit"),
  return_rate_days_1_to_7: { state: "unavailable", reason: "no_mature_activated_weddings", numerator: 0, denominator: 0 },
  paid_cac_30d: { state: "unavailable", reason: "zero_denominator", numerator: 20000, denominator: 0 },
};
const meta = { definition_version: "growth-kpi-v1", timezone: "Australia/Sydney", attribution_model: "first_touch", from: "2026-10-01", through: "2026-10-30", source: null };

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.includes("/admin/growth/")) return originalFetch(input, init);
  let payload: unknown = {};
  if (url.includes("/overview")) payload = { meta, comparison: { current: snapshot, previous: snapshot }, funnel: { landing_sessions: 10, registered_weddings: 2, activated_weddings: 1, returned_weddings_days_1_to_7: 0, paid_weddings_within_30d: 0 } };
  if (url.includes("/campaigns")) payload = { meta, items: [{ source: "instagram", medium: "paid_social", campaign: "spring", intent: "binder", spend_aud_minor: 20000, meta_landing_views: 900, first_party_landing_sessions: 100, registered_weddings: 20, activated_weddings: 10, returned_weddings_days_1_to_7: 4, paid_weddings_within_30d: 2, gross_minor: 18000, refunded_minor: 0 }] };
  if (url.includes("/cohorts")) payload = { meta, items: [{ week_start: "2026-10-26", registered_weddings: 20, mature_registered_weddings_7d: 10, activated_within_7d: 6, mature_activated_weddings_7d: 4, returned_weddings_days_1_to_7: 2, mature_registered_weddings_30d: 0, paid_within_30d: 0 }] };
  if (url.includes("/benchmarks")) payload = { meta, items: [], notice: "No operator target has been recorded. OmnyID does not fabricate benchmarks." };
  if (url.includes("/quality")) payload = { meta, quality: { latest_public_event_at: "2026-11-04T01:00:00Z", latest_spend_import_at: null, latest_rollup_at: "2026-11-04T02:00:00Z", first_party_landing_views: 100, meta_landing_views: 900, unattributed_sessions: 3, unmatched_spend_aud_minor: 20000, payment_rows: 2, payment_rows_missing_tax: 1, duplicate_events_discarded: null, bot_or_test_events_excluded: null } };
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
};

render(() => <GrowthAnalyticsPanel />, document.getElementById("root")!);
