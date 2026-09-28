import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminThirdPartyToolPolicyState,
  loadAdminThirdPartyToolPolicies,
  nextAdminThirdPartyToolPolicy,
  saveAdminThirdPartyToolPolicies,
} from "../src/lib/adminThirdPartyToolPolicyState.ts";
import { buildWeddingApiStackState } from "../src/lib/weddingApiStackState.ts";

test("admin third-party tool policy exposes shared wedding providers and usage metering", () => {
  const state = buildAdminThirdPartyToolPolicyState({
    apiStack: buildWeddingApiStackState({
      connectedAppIds: ["google-places-api", "google-maps-platform", "gcal", "weatherapi", "stripe"],
    }),
    policies: [
      {
        toolId: "google-maps-platform",
        enabledForWeddingTemplate: true,
        monthlyFreeQuotaLabel: "Free credit available",
      },
      {
        toolId: "stripe",
        enabledForAllUsers: true,
        quotaUsedLabel: "120 events this month",
      },
    ],
    policySourceLabel: "admin-third-party-tool-policy-env",
    billing: {
      current_month_start: "2026-09-01T00:00:00Z",
      total_estimated_cost_usd: 0,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      categories: [],
      connected_tools: [],
      recent_events: [],
      items: [{
        provider_origin: "built_in",
        provider_category: "maps",
        billing_category: "maps_travel",
        tool_slug: "google-maps-platform",
        tool_name: "Google Maps Platform",
        provider_key: "google-maps-platform",
        usage_unit: "requests",
        total_quantity: 44,
        total_estimated_cost_usd: 1.12,
        latest_occurred_at: "2026-09-25T10:00:00Z",
        event_count: 4,
      }],
    },
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });

  const maps = state.rows.find((row) => row.toolId === "google-maps-platform");
  const stripe = state.rows.find((row) => row.toolId === "stripe");
  const cloudinary = state.rows.find((row) => row.toolId === "cloudinary");

  assert.equal(maps?.enabledForWeddingTemplate, true);
  assert.equal(maps?.statusLabel, "Enabled for wedding planner");
  assert.equal(maps?.monthToDateUsageLabel, "44 requests");
  assert.equal(maps?.monthToDateCostLabel, "$1.12");
  assert.equal(maps?.meteringStatusLabel, "Metering active");
  assert.match(maps?.meteringDetailLabel ?? "", /4 usage events/i);
  assert.equal(maps?.usageEventSourceLabel, "Usage event: wedding_shared_tool_usage_event");
  assert.match(maps?.usageMetadataLabel ?? "", /user_id/);
  assert.match(maps?.usageMetadataLabel ?? "", /wedding_plan_id/);
  assert.match(maps?.usageMetadataLabel ?? "", /provider_request_id/);
  assert.match(maps?.weddingScopeProofLabel ?? "", /aggregate usage exists/i);
  assert.match(maps?.warningLabel ?? "", /wedding_shared_tool_usage_event/i);
  assert.equal(maps?.quotaLabel, "Free credit available");
  assert.equal(stripe?.enabledForAllUsers, true);
  assert.equal(stripe?.quotaLabel, "120 events this month");
  assert.equal(stripe?.meteringStatusLabel, "No usage recorded");
  assert.match(stripe?.warningLabel ?? "", /wedding_shared_tool_usage_event/i);
  assert.equal(cloudinary?.requiredForWedding, false);
  assert.equal(cloudinary?.meteringStatusLabel, "Metering idle");
  assert.match(state.summary, /2 shared providers enabled/i);
  assert.equal(state.sourceLabel, "Deployment defaults");
  assert.ok(state.guardrails.some((guardrail) => /metered per user/i.test(guardrail)));
});

test("admin third-party tool policy recognizes wedding-scoped usage event proof", () => {
  const state = buildAdminThirdPartyToolPolicyState({
    apiStack: buildWeddingApiStackState({
      connectedAppIds: ["weatherapi"],
    }),
    policies: [{ toolId: "weatherapi", enabledForWeddingTemplate: true }],
    billing: {
      current_month_start: "2026-09-01T00:00:00Z",
      total_estimated_cost_usd: 0,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      categories: [],
      connected_tools: [],
      items: [{
        provider_origin: "built_in",
        provider_category: "weather",
        billing_category: "outdoor_contingency",
        tool_slug: "weather-api",
        tool_name: "WeatherAPI",
        provider_key: "weatherapi",
        usage_unit: "requests",
        total_quantity: 2,
        total_estimated_cost_usd: 0.04,
        latest_occurred_at: "2026-09-25T10:00:00Z",
        event_count: 2,
      }],
      recent_events: [{
        id: "usage_1",
        tool_slug: "weather-api",
        tool_name: "WeatherAPI",
        provider_origin: "built_in",
        provider_key: "weatherapi",
        provider_category: "weather",
        billing_category: "wedding_weather_forecast",
        usage_unit: "requests",
        quantity: 1,
        estimated_cost_usd: 0.02,
        currency: "USD",
        source: "wedding_shared_tool_usage_event",
        occurred_at: "2026-09-25T10:00:00Z",
        recorded_at: "2026-09-25T10:00:01Z",
      }],
    },
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });
  const weather = state.rows.find((row) => row.toolId === "weatherapi");

  assert.equal(weather?.meteringStatusLabel, "Metering active");
  assert.match(weather?.weddingScopeProofLabel ?? "", /1 recent wedding-scoped usage event/i);
  assert.equal(weather?.warningLabel, null);
});

test("admin third-party tool policy accepts legacy wedding planner shared-tool usage source", () => {
  const state = buildAdminThirdPartyToolPolicyState({
    apiStack: buildWeddingApiStackState({
      connectedAppIds: ["google-places-api"],
    }),
    policies: [{ toolId: "google-places-api", enabledForWeddingTemplate: true }],
    billing: {
      current_month_start: "2026-09-01T00:00:00Z",
      total_estimated_cost_usd: 0,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      categories: [],
      connected_tools: [],
      items: [{
        provider_origin: "built_in",
        provider_category: "places",
        billing_category: "vendor_discovery",
        tool_slug: "google-places-api",
        tool_name: "Google Places API",
        provider_key: "google-places-api",
        usage_unit: "requests",
        total_quantity: 1,
        total_estimated_cost_usd: 0,
        latest_occurred_at: "2026-09-25T10:00:00Z",
        event_count: 1,
      }],
      recent_events: [{
        id: "usage_legacy_1",
        tool_slug: "google-places-api",
        tool_name: "Google Places API",
        provider_origin: "built_in",
        provider_key: "google-places-api",
        provider_category: "places",
        billing_category: "vendor_discovery",
        usage_unit: "requests",
        quantity: 1,
        estimated_cost_usd: 0,
        currency: "USD",
        source: "wedding_planner_shared_tool",
        occurred_at: "2026-09-25T10:00:00Z",
        recorded_at: "2026-09-25T10:00:01Z",
      }],
    },
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });
  const places = state.rows.find((row) => row.toolId === "google-places-api");

  assert.match(places?.weddingScopeProofLabel ?? "", /1 recent wedding-scoped usage event/i);
  assert.equal(places?.warningLabel, null);
});


test("admin third-party tool policy warns when enabled providers have no metering proof", () => {
  const state = buildAdminThirdPartyToolPolicyState({
    policies: [{
      toolId: "weatherapi",
      enabledForWeddingTemplate: true,
    }],
    policySourceLabel: "admin-third-party-tool-policy-file",
    billing: null,
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });
  const weather = state.rows.find((row) => row.toolId === "weatherapi");

  assert.equal(weather?.statusLabel, "Enabled for wedding planner");
  assert.equal(weather?.meteringStatusLabel, "Metering proof missing");
  assert.match(weather?.meteringDetailLabel ?? "", /billing status is loaded/i);
  assert.equal(weather?.usageEventSourceLabel, "Usage event: external tool usage event");
  assert.match(weather?.usageMetadataLabel ?? "", /user, provider, operation/i);
  assert.match(weather?.warningLabel ?? "", /per-user and total usage metering/i);
});

test("admin third-party tool policy matches provider usage aliases", () => {
  const state = buildAdminThirdPartyToolPolicyState({
    apiStack: buildWeddingApiStackState({
      connectedAppIds: ["gcal", "twilio-messaging"],
    }),
    policies: [
      { toolId: "gcal", enabledForWeddingTemplate: true },
      { toolId: "twilio-messaging", enabledForWeddingTemplate: true },
    ],
    billing: {
      current_month_start: "2026-09-01T00:00:00Z",
      total_estimated_cost_usd: 0,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      categories: [],
      connected_tools: [],
      recent_events: [],
      items: [
        {
          provider_origin: "built_in",
          provider_category: "calendar",
          billing_category: "calendar_write",
          tool_slug: "google_calendar",
          tool_name: "Google Calendar API",
          provider_key: "google_calendar",
          usage_unit: "events",
          total_quantity: 3,
          total_estimated_cost_usd: 0.3,
          latest_occurred_at: "2026-09-25T10:00:00Z",
          event_count: 3,
        },
        {
          provider_origin: "built_in",
          provider_category: "sms",
          billing_category: "sms",
          tool_slug: "twilio-sms",
          tool_name: "Twilio SMS",
          provider_key: "twilio",
          usage_unit: "messages",
          total_quantity: 8,
          total_estimated_cost_usd: 1.6,
          latest_occurred_at: "2026-09-25T10:05:00Z",
          event_count: 2,
        },
      ],
    },
    formatCostLabel: (amount) => `USD ${Number(amount ?? 0).toFixed(2)}`,
  });

  const calendar = state.rows.find((row) => row.toolId === "gcal");
  const twilio = state.rows.find((row) => row.toolId === "twilio-messaging");

  assert.equal(calendar?.meteringStatusLabel, "Metering active");
  assert.equal(calendar?.monthToDateUsageLabel, "3 events");
  assert.equal(twilio?.meteringStatusLabel, "Metering active");
  assert.equal(twilio?.monthToDateUsageLabel, "8 messages");
  assert.equal(state.overallCostLabel, "USD 1.90");
});

test("admin third-party tool policy includes Google Places as a shared wedding provider", () => {
  const state = buildAdminThirdPartyToolPolicyState({
    apiStack: buildWeddingApiStackState({
      connectedAppIds: ["google-places-api"],
    }),
    policies: [{ toolId: "google-places-api", enabledForWeddingTemplate: true }],
    billing: {
      current_month_start: "2026-09-01T00:00:00Z",
      total_estimated_cost_usd: 0,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      categories: [],
      connected_tools: [],
      recent_events: [],
      items: [{
        provider_origin: "built_in",
        provider_category: "places",
        billing_category: "vendor_discovery",
        tool_slug: "google_places",
        tool_name: "Google Places API",
        provider_key: "google_places",
        usage_unit: "requests",
        total_quantity: 12,
        total_estimated_cost_usd: 2.4,
        latest_occurred_at: "2026-09-25T10:00:00Z",
        event_count: 4,
      }],
    },
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });
  const places = state.rows.find((row) => row.toolId === "google-places-api");

  assert.equal(places?.label, "Google Places API");
  assert.equal(places?.requiredForWedding, true);
  assert.equal(places?.meteringStatusLabel, "Metering active");
  assert.match(places?.use ?? "", /Venue and vendor discovery|Discover venues/i);
});

test("admin third-party tool policy translates source labels into operator-facing copy", () => {
  const saved = buildAdminThirdPartyToolPolicyState({
    policies: [],
    policySourceLabel: "admin-third-party-tool-policy-file",
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });
  const local = buildAdminThirdPartyToolPolicyState({
    policies: [],
    policySourceLabel: "admin-third-party-tool-policy-local",
    formatCostLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });

  assert.equal(saved.sourceLabel, "Saved admin policy");
  assert.equal(local.sourceLabel, "Saved in this browser");
});

test("nextAdminThirdPartyToolPolicy toggles scopes without dropping existing policy metadata", () => {
  const first = nextAdminThirdPartyToolPolicy([], "weatherapi", "wedding_template", true);
  const second = nextAdminThirdPartyToolPolicy(
    [{ ...first[0]!, monthlyFreeQuotaLabel: "1m calls" }],
    "weatherapi",
    "all_users",
    true,
  );
  const third = nextAdminThirdPartyToolPolicy(second, "weatherapi", "wedding_template", false);

  assert.deepEqual(third, [{
    toolId: "weatherapi",
    enabledForAllUsers: true,
    enabledForWeddingTemplate: false,
    monthlyFreeQuotaLabel: "1m calls",
  }]);
});

test("admin third-party tool policies round-trip through account-scoped storage", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });

  const saved = saveAdminThirdPartyToolPolicies("admin_1", [{
    toolId: "cloudinary",
    enabledForWeddingTemplate: true,
    monthlyFreeQuotaLabel: "25 credits",
  }]);
  const loaded = loadAdminThirdPartyToolPolicies("admin_1");
  storage.set("omnyid.admin_third_party_tool_policy.v1:admin_2", "{bad json");

  assert.deepEqual(saved, loaded);
  assert.deepEqual(loadAdminThirdPartyToolPolicies("admin_2"), []);
});
