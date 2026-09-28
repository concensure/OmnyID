import assert from "node:assert/strict";
import test from "node:test";

import {
  readExternalToolDerivedState,
  readExternalToolSectionModel,
  readExternalToolUsageSectionModel,
} from "../src/lib/externalToolUsageSectionState.ts";

test("external tool derived state centralizes filtering, totals, and section cards", () => {
  const derived = readExternalToolDerivedState({
    billing: {
      current_month_start: "2026-08-01T00:00:00Z",
      total_estimated_cost_usd: 4.2,
      connected_estimated_cost_usd: 1.25,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      coverage: {
        measurement_state: "estimated",
        settlement_state: "pending",
        coverage_summary: "Estimated from recorded month-to-date events.",
        retention: {
          max_event_age_days: 30,
          max_event_rows_per_user: 5000,
          rollover_behavior: "rolling",
        },
        caveats: ["Pricing metadata may drift"],
      },
      categories: [{
        billing_category: "search",
        total_quantity: 24,
        total_estimated_cost_usd: 1.25,
        event_count: 3,
      }],
      items: [{
        provider_origin: "connected",
        provider_category: "research",
        billing_category: "search",
        tool_slug: "exa",
        tool_name: "Exa",
        provider_key: "exa",
        usage_unit: "requests",
        total_quantity: 24,
        total_estimated_cost_usd: 1.25,
        latest_occurred_at: "2026-08-31T10:00:00Z",
        event_count: 3,
      }, {
        provider_origin: "built_in",
        provider_category: "search",
        billing_category: "search",
        tool_slug: "duckduckgo",
        tool_name: "DuckDuckGo",
        provider_key: "ddg",
        usage_unit: "requests",
        total_quantity: 10,
        total_estimated_cost_usd: 0,
        latest_occurred_at: "2026-08-31T11:00:00Z",
        event_count: 1,
      }],
      recent_events: [{
        id: "evt_connected",
        tool_slug: "tavily",
        tool_name: "Tavily",
        provider_origin: "connected",
        provider_key: "tavily",
        provider_category: "research",
        billing_category: "search",
        usage_unit: "requests",
        quantity: 2,
        estimated_cost_usd: 0.4,
        currency: "USD",
        source: "task runner",
        occurred_at: "2026-08-31T10:00:00Z",
        recorded_at: "2026-08-31T10:01:00Z",
      }, {
        id: "evt_builtin",
        tool_slug: "duckduckgo",
        tool_name: "DuckDuckGo",
        provider_origin: "built_in",
        provider_key: "ddg",
        provider_category: "search",
        billing_category: "search",
        usage_unit: "requests",
        quantity: 10,
        estimated_cost_usd: 0,
        currency: "USD",
        source: "server",
        occurred_at: "2026-08-31T11:00:00Z",
        recorded_at: "2026-08-31T11:01:00Z",
      }],
      connected_tools: [{
        tool_slug: "exa",
        tool_name: "Exa",
        connection_provider: "Exa",
        connected_at: "2026-08-01T00:00:00Z",
        provider_origin: "connected",
        provider_key: "exa",
        provider_category: "research",
        billing_model: "per_request",
        pricing_summary: "$5 per 1k requests",
        free_tier_summary: "100 credits monthly",
        production_caveat: "Estimated from provider list pricing",
        pricing_source_url: null,
        default_usage_unit: "requests",
      }],
    },
    quotaState: "ok",
    adminThirdPartyToolPolicySourceLabel: "admin-third-party-tool-policy-file",
    formatCostLabel: (amount) => `$${amount.toFixed(2)}`,
  });

  assert.equal(derived.connectedToolItems.length, 1);
  assert.equal(derived.builtInToolItems.length, 1);
  assert.equal(derived.connectedToolEvents.length, 1);
  assert.equal(derived.builtInToolEvents.length, 1);
  assert.equal(derived.estimatedToolSpendLabel, "$4.20");
  assert.equal(derived.estimateDetail, "Estimated from recorded month-to-date events.");
  assert.equal(derived.overviewCards.length, 8);
  assert.equal(derived.categoryCards.length, 1);
  assert.equal(derived.connectionCards.length, 1);
  assert.equal(derived.connectedLineItems.length, 1);
  assert.equal(derived.connectedUsageEvents.length, 1);
  assert.equal(derived.builtInLineItems.length, 1);
  assert.equal(derived.builtInUsageEvents.length, 1);
  assert.equal(derived.adminThirdPartyToolPolicy.sourceLabel, "Saved admin policy");
  assert.ok(derived.costTrustPanel.caveatItems.includes("Pricing metadata may drift"));
});

test("external tool usage section builder preserves the mounted section contract", () => {
  assert.deepEqual(
    readExternalToolUsageSectionModel({
      intro: "Per-user provider usage",
      estimatedToolSpendLabel: "$4.20",
      estimateDetail: "Estimated from recorded month-to-date events.",
      overviewCards: [{
        title: "Connected providers",
        value: "2",
        detail: "Per-user tool connections with pricing metadata.",
        tone: "default",
      }],
      categoryCards: [{
        billingCategoryLabel: "search",
        estimatedCostLabel: "$1.25",
        summaryLine: "24 units | 3 events",
      }],
      categoryEmptyState: "No external usage has been recorded yet for this account.",
      connectionCards: [{
        toolName: "Exa",
        pricingSummary: "$5 per 1k requests",
        billingModelLabel: "per request",
        freeTierSummary: "100 credits monthly",
        productionCaveat: "Estimated from provider list pricing",
      }],
      connectionEmptyState: "No billable external providers are connected yet on this account.",
      connectedLineItemsEmptyState: "Connected-provider spend will appear here as approved provider usage events are recorded.",
      connectedLineItems: [{
        toolNameLabel: "Exa",
        providerKeyLabel: "exa",
        billingCategoryLabel: "search",
        usageSummary: "24 requests",
        estimatedCostLabel: "$1.25",
      }],
      connectedUsageEmptyState: "No usage events have been recorded yet for the connected providers on this account.",
      connectedUsageEvents: [{
        toolNameLabel: "Tavily",
        estimatedCostLabel: "$0.40",
        summaryLine: "2 requests | search | task runner",
        occurredAtLabel: "2026-08-31T10:00:00Z",
      }],
      builtInLineItemsEmptyState: "Built-in providers will appear here when OmnyID makes direct server-side calls.",
      builtInLineItems: [{
        toolNameLabel: "DuckDuckGo",
        providerKeyLabel: "ddg",
        billingCategoryLabel: "search",
        usageSummary: "10 requests",
        estimatedCostLabel: "$0.00",
      }],
      builtInUsageEmptyState: "No built-in direct usage has been recorded yet for this account.",
      builtInUsageEvents: [{
        toolNameLabel: "DuckDuckGo",
        estimatedCostLabel: "$0.00",
        summaryLine: "10 requests | search | server",
        occurredAtLabel: "2026-08-31T11:00:00Z",
      }],
      costTrustPanel: {
        heading: "Cost trust",
        detail: "Usage is estimated from recorded provider events.",
        coverageTitle: "Coverage",
        coverageItems: ["Connected providers included"],
        caveatsTitle: "Caveats",
        caveatItems: ["Pricing metadata may drift"],
      },
    }),
    {
      intro: "Per-user provider usage",
      estimatedToolSpendLabel: "$4.20",
      estimateDetail: "Estimated from recorded month-to-date events.",
      overviewCards: [{
        title: "Connected providers",
        value: "2",
        detail: "Per-user tool connections with pricing metadata.",
        tone: "default",
      }],
      categoryCards: [{
        billingCategoryLabel: "search",
        estimatedCostLabel: "$1.25",
        summaryLine: "24 units | 3 events",
      }],
      categoryEmptyState: "No external usage has been recorded yet for this account.",
      connectionCards: [{
        toolName: "Exa",
        pricingSummary: "$5 per 1k requests",
        billingModelLabel: "per request",
        freeTierSummary: "100 credits monthly",
        productionCaveat: "Estimated from provider list pricing",
      }],
      connectionEmptyState: "No billable external providers are connected yet on this account.",
      connectedLineItemsEmptyState: "Connected-provider spend will appear here as approved provider usage events are recorded.",
      connectedLineItems: [{
        toolNameLabel: "Exa",
        providerKeyLabel: "exa",
        billingCategoryLabel: "search",
        usageSummary: "24 requests",
        estimatedCostLabel: "$1.25",
      }],
      connectedUsageEmptyState: "No usage events have been recorded yet for the connected providers on this account.",
      connectedUsageEvents: [{
        toolNameLabel: "Tavily",
        estimatedCostLabel: "$0.40",
        summaryLine: "2 requests | search | task runner",
        occurredAtLabel: "2026-08-31T10:00:00Z",
      }],
      builtInLineItemsEmptyState: "Built-in providers will appear here when OmnyID makes direct server-side calls.",
      builtInLineItems: [{
        toolNameLabel: "DuckDuckGo",
        providerKeyLabel: "ddg",
        billingCategoryLabel: "search",
        usageSummary: "10 requests",
        estimatedCostLabel: "$0.00",
      }],
      builtInUsageEmptyState: "No built-in direct usage has been recorded yet for this account.",
      builtInUsageEvents: [{
        toolNameLabel: "DuckDuckGo",
        estimatedCostLabel: "$0.00",
        summaryLine: "10 requests | search | server",
        occurredAtLabel: "2026-08-31T11:00:00Z",
      }],
      costTrustPanel: {
        heading: "Cost trust",
        detail: "Usage is estimated from recorded provider events.",
        coverageTitle: "Coverage",
        coverageItems: ["Connected providers included"],
        caveatsTitle: "Caveats",
        caveatItems: ["Pricing metadata may drift"],
      },
    },
  );
});

test("external tool section builder fills stable empty-state copy around derived content", () => {
  const model = readExternalToolSectionModel({
    estimatedToolSpendLabel: "$4.20",
    estimateDetail: "Estimated from recorded month-to-date events.",
    overviewCards: [],
    categoryCards: [],
    connectionCards: [],
    connectedLineItems: [],
    connectedUsageEvents: [],
    builtInLineItems: [],
    builtInUsageEvents: [],
    costTrustPanel: {
      heading: "Cost trust",
      detail: "Usage is estimated from recorded provider events.",
      coverageTitle: "Coverage",
      coverageItems: ["Connected providers included"],
      caveatsTitle: "Caveats",
      caveatItems: ["Pricing metadata may drift"],
    },
  });

  assert.equal(
    model.intro,
    "This view is per user. It lists your connected research and scraping providers, their pricing caveats, and any recorded month-to-date usage events.",
  );
  assert.match(model.categoryEmptyState, /^No external usage has been recorded yet for this account\./);
  assert.match(model.connectionEmptyState, /^No billable external providers are connected yet on this account\./);
  assert.match(model.connectedUsageEmptyState, /^No usage events have been recorded yet for the connected providers on this account\./);
  assert.match(model.builtInUsageEmptyState, /^No built-in direct usage has been recorded yet for this account\./);
});
