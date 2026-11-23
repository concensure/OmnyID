import assert from "node:assert/strict";
import test from "node:test";

import {
  readExternalToolBillingModelLabel,
  readExternalToolBillingOverviewCardModels,
  readExternalToolBillingSectionIntro,
  readExternalToolBuiltInLineItemsEmptyState,
  readExternalToolBuiltInUsageEmptyState,
  readExternalToolCategoryTotalCardModels,
  readExternalToolCategoryTotalsEmptyState,
  readExternalToolCategoryTotalCardModel,
  readExternalToolConnectionCards,
  readExternalToolConnectedLineItemsEmptyState,
  readExternalToolConnectionCardModel,
  readExternalToolConnectedProvidersEmptyState,
  readExternalToolConnectedUsageEmptyState,
  readExternalToolUsageEventCardModels,
  readExternalToolUsageEventCardModel,
  readExternalToolUsageLineItemRowModels,
  readExternalToolUsageLineItemRowModel,
} from "../src/lib/externalToolBillingViewState.ts";

test("readExternalToolBillingModelLabel humanizes configured billing models", () => {
  assert.equal(readExternalToolBillingModelLabel("per_request"), "per request");
  assert.equal(readExternalToolBillingModelLabel(""), "usage based");
});

test("readExternalToolConnectionCardModel trims optional copy and preserves omissions", () => {
  assert.deepEqual(
    readExternalToolConnectionCardModel({
      billingModel: "per_credit",
      freeTierSummary: " 100 credits monthly ",
      productionCaveat: " Estimated from provider list pricing ",
    }),
    {
      billingModelLabel: "per credit",
      freeTierSummary: "100 credits monthly",
      productionCaveat: "Estimated from provider list pricing",
    },
  );
  assert.deepEqual(
    readExternalToolConnectionCardModel({
      billingModel: null,
      freeTierSummary: " ",
      productionCaveat: null,
    }),
    {
      billingModelLabel: "usage based",
      freeTierSummary: null,
      productionCaveat: null,
    },
  );
});

test("external tool billing section copy stays centralized", () => {
  assert.equal(
    readExternalToolBillingSectionIntro(),
    "This view is per user. It lists your connected research and scraping providers, their pricing caveats, and any recorded month-to-date usage events.",
  );
  assert.equal(
    readExternalToolCategoryTotalsEmptyState(),
    "No external usage has been recorded yet for this account. Connected providers below still show their pricing model and caveats.",
  );
  assert.equal(
    readExternalToolConnectedProvidersEmptyState(),
    "No billable external providers are connected yet on this account.",
  );
  assert.equal(
    readExternalToolConnectedLineItemsEmptyState(),
    "Connected-provider spend will appear here as approved provider usage events are recorded.",
  );
  assert.equal(
    readExternalToolConnectedUsageEmptyState(),
    "No usage events have been recorded yet for the connected providers on this account.",
  );
  assert.equal(
    readExternalToolBuiltInLineItemsEmptyState(),
    "Built-in providers such as DuckDuckGo will appear here when OmnyID makes direct server-side calls for this account.",
  );
  assert.equal(
    readExternalToolBuiltInUsageEmptyState(),
    "No built-in direct usage has been recorded yet for this account.",
  );
});

test("readExternalToolBillingOverviewCardModels centralizes summary tiles", () => {
  assert.deepEqual(
    readExternalToolBillingOverviewCardModels({
      connectedProviderCount: 3,
      builtInProviderCount: 1,
      categoryCount: 4,
      eventCount: 12,
      connectedSpendLabel: "$9.25",
      builtInSpendLabel: "$0.15",
      settlementLabel: "estimated",
      measurementLabel: "per request",
      retentionDetail: "30 day window | 1000 rows",
    }),
    [
      {
        title: "Connected providers",
        value: "3",
        detail: "Per-user tool connections with pricing metadata.",
        tone: "default",
      },
      {
        title: "Built-in providers",
        value: "1",
        detail: "Server-side direct tools OmnyID used on this account without a user connection.",
        tone: "default",
      },
      {
        title: "Usage categories",
        value: "4",
        detail: "Search, news, scraping, and other provider buckets.",
        tone: "default",
      },
      {
        title: "Recorded events",
        value: "12",
        detail: "Most recent captured provider-usage events for this account.",
        tone: "default",
      },
      {
        title: "Connected spend",
        value: "$9.25",
        detail: "Estimated usage from user-connected providers.",
        tone: "emerald",
      },
      {
        title: "Built-in spend",
        value: "$0.15",
        detail: "Estimated server-side provider usage on this account.",
        tone: "amber",
      },
      {
        title: "Settlement state",
        value: "estimated",
        detail: "Measurement: per request.",
        tone: "sky",
      },
      {
        title: "History retention",
        value: "Rolling window",
        detail: "30 day window | 1000 rows",
        tone: "indigo",
      },
    ],
  );
});

test("external tool billing row models normalize category, line item, and event card copy", () => {
  assert.deepEqual(
    readExternalToolCategoryTotalCardModel({
      billingCategory: "search",
      estimatedCostLabel: "$1.25",
      summaryLine: "24 units | 3 events",
    }),
    {
      billingCategoryLabel: "search",
      estimatedCostLabel: "$1.25",
      summaryLine: "24 units | 3 events",
    },
  );
  assert.deepEqual(
    readExternalToolUsageLineItemRowModel({
      toolName: "Exa",
      providerKey: "exa",
      billingCategory: "search",
      usageSummary: "24 requests",
      estimatedCostLabel: "$1.25",
    }),
    {
      toolNameLabel: "Exa",
      providerKeyLabel: "exa",
      billingCategoryLabel: "search",
      usageSummary: "24 requests",
      estimatedCostLabel: "$1.25",
    },
  );
  assert.deepEqual(
    readExternalToolUsageEventCardModel({
      toolName: "Tavily",
      estimatedCostLabel: "$0.40",
      summaryLine: "2 requests | search | task runner",
      occurredAtLabel: "",
      occurredAtFallback: "2026-08-30T10:00:00Z",
    }),
    {
      toolNameLabel: "Tavily",
      estimatedCostLabel: "$0.40",
      summaryLine: "2 requests | search | task runner",
      occurredAtLabel: "2026-08-30T10:00:00Z",
    },
  );
});

test("external tool list builders centralize category, connection, line-item, and event mapping", () => {
  assert.deepEqual(
    readExternalToolCategoryTotalCardModels({
      entries: [{
        billing_category: "search",
        total_estimated_cost_usd: 1.25,
        total_quantity: 24,
        event_count: 3,
      }],
      formatCostLabel: (value) => `$${Number(value ?? 0).toFixed(2)}`,
      formatCategorySummaryLine: (entry) => `${entry.total_quantity} units | ${entry.event_count} events`,
    }),
    [{
      billingCategoryLabel: "search",
      estimatedCostLabel: "$1.25",
      summaryLine: "24 units | 3 events",
    }],
  );

  assert.deepEqual(
    readExternalToolConnectionCards({
      entries: [{
        tool_name: "Exa",
        pricing_summary: " $5 per 1k requests ",
        billing_model: "per_request",
        free_tier_summary: " 100 credits monthly ",
        production_caveat: " Estimated from provider list pricing ",
      }],
    }),
    [{
      toolName: "Exa",
      pricingSummary: "$5 per 1k requests",
      billingModelLabel: "per request",
      freeTierSummary: "100 credits monthly",
      productionCaveat: "Estimated from provider list pricing",
    }],
  );

  assert.deepEqual(
    readExternalToolUsageLineItemRowModels({
      entries: [{
        tool_name: "Tavily",
        provider_key: "tavily",
        billing_category: "search",
        total_quantity: 2,
        usage_unit: "requests",
        total_estimated_cost_usd: 0.4,
      }],
      formatUsageSummary: (entry) => `${entry.total_quantity} ${entry.usage_unit}`,
      formatCostLabel: (value) => `$${Number(value ?? 0).toFixed(2)}`,
    }),
    [{
      toolNameLabel: "Tavily",
      providerKeyLabel: "tavily",
      billingCategoryLabel: "search",
      usageSummary: "2 requests",
      estimatedCostLabel: "$0.40",
    }],
  );

  assert.deepEqual(
    readExternalToolUsageEventCardModels({
      entries: [{
        tool_name: "Firecrawl",
        estimated_cost_usd: 0.8,
        quantity: 3,
        usage_unit: "pages",
        billing_category: "scraping",
        source: "task runner",
        occurred_at: "2026-08-31T10:00:00Z",
      }],
      formatCostLabel: (value) => `$${Number(value ?? 0).toFixed(2)}`,
      formatSummaryLine: (entry) => `${entry.quantity} ${entry.usage_unit} | ${entry.billing_category} | ${entry.source}`,
      formatOccurredAtLabel: () => "",
      limit: 8,
    }),
    [{
      toolNameLabel: "Firecrawl",
      estimatedCostLabel: "$0.80",
      summaryLine: "3 pages | scraping | task runner",
      occurredAtLabel: "2026-08-31T10:00:00Z",
    }],
  );
});
