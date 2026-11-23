// @locs-version: 1.0
function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function readExternalToolBillingModelLabel(value: string | null | undefined): string {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replaceAll("_", " ") : "usage based";
}

export function readExternalToolConnectionCardModel(args: {
  billingModel: string | null | undefined;
  freeTierSummary: string | null | undefined;
  productionCaveat: string | null | undefined;
}) {
  return {
    billingModelLabel: readExternalToolBillingModelLabel(args.billingModel),
    freeTierSummary: normalizeOptionalText(args.freeTierSummary),
    productionCaveat: normalizeOptionalText(args.productionCaveat),
  };
}

export function readExternalToolBillingSectionIntro(): string {
  return "This view is per user. It lists your connected research and scraping providers, their pricing caveats, and any recorded month-to-date usage events.";
}

export function readExternalToolBillingOverviewCardModels(args: {
  connectedProviderCount: number;
  builtInProviderCount: number;
  categoryCount: number;
  eventCount: number;
  connectedSpendLabel: string;
  builtInSpendLabel: string;
  settlementLabel: string;
  measurementLabel: string;
  retentionDetail: string;
}): Array<{
  title: string;
  value: string;
  detail: string;
  tone: "default" | "emerald" | "amber" | "sky" | "indigo";
}> {
  return [
    {
      title: "Connected providers",
      value: String(args.connectedProviderCount),
      detail: "Per-user tool connections with pricing metadata.",
      tone: "default",
    },
    {
      title: "Built-in providers",
      value: String(args.builtInProviderCount),
      detail: "Server-side direct tools OmnyID used on this account without a user connection.",
      tone: "default",
    },
    {
      title: "Usage categories",
      value: String(args.categoryCount),
      detail: "Search, news, scraping, and other provider buckets.",
      tone: "default",
    },
    {
      title: "Recorded events",
      value: String(args.eventCount),
      detail: "Most recent captured provider-usage events for this account.",
      tone: "default",
    },
    {
      title: "Connected spend",
      value: args.connectedSpendLabel,
      detail: "Estimated usage from user-connected providers.",
      tone: "emerald",
    },
    {
      title: "Built-in spend",
      value: args.builtInSpendLabel,
      detail: "Estimated server-side provider usage on this account.",
      tone: "amber",
    },
    {
      title: "Settlement state",
      value: args.settlementLabel,
      detail: `Measurement: ${args.measurementLabel}.`,
      tone: "sky",
    },
    {
      title: "History retention",
      value: "Rolling window",
      detail: args.retentionDetail,
      tone: "indigo",
    },
  ];
}

export function readExternalToolCategoryTotalsEmptyState(): string {
  return "No external usage has been recorded yet for this account. Connected providers below still show their pricing model and caveats.";
}

export function readExternalToolConnectedProvidersEmptyState(): string {
  return "No billable external providers are connected yet on this account.";
}

export function readExternalToolConnectedLineItemsEmptyState(): string {
  return "Connected-provider spend will appear here as approved provider usage events are recorded.";
}

export function readExternalToolConnectedUsageEmptyState(): string {
  return "No usage events have been recorded yet for the connected providers on this account.";
}

export function readExternalToolBuiltInLineItemsEmptyState(): string {
  return "Built-in providers such as DuckDuckGo will appear here when OmnyID makes direct server-side calls for this account.";
}

export function readExternalToolBuiltInUsageEmptyState(): string {
  return "No built-in direct usage has been recorded yet for this account.";
}

export function readExternalToolCategoryTotalCardModel(args: {
  billingCategory: string | null | undefined;
  estimatedCostLabel: string;
  summaryLine: string;
}) {
  return {
    billingCategoryLabel: normalizeOptionalText(args.billingCategory) ?? "unknown",
    estimatedCostLabel: args.estimatedCostLabel,
    summaryLine: args.summaryLine,
  };
}

export function readExternalToolCategoryTotalCardModels(args: {
  entries: ReadonlyArray<{
    billing_category: string | null | undefined;
    total_estimated_cost_usd: number | null | undefined;
    total_quantity: number | null | undefined;
    event_count: number | null | undefined;
  }>;
  formatCostLabel: (value: number | null | undefined) => string;
  formatCategorySummaryLine: (entry: {
    total_quantity: number | null | undefined;
    event_count: number | null | undefined;
  }) => string;
}) {
  return args.entries.map((entry) => readExternalToolCategoryTotalCardModel({
    billingCategory: entry.billing_category,
    estimatedCostLabel: args.formatCostLabel(entry.total_estimated_cost_usd),
    summaryLine: args.formatCategorySummaryLine({
      total_quantity: entry.total_quantity,
      event_count: entry.event_count,
    }),
  }));
}

export function readExternalToolConnectionCards(args: {
  entries: ReadonlyArray<{
    tool_name: string | null | undefined;
    pricing_summary: string | null | undefined;
    billing_model: string | null | undefined;
    free_tier_summary?: string | null | undefined;
    production_caveat?: string | null | undefined;
  }>;
}) {
  return args.entries.map((entry) => {
    const cardModel = readExternalToolConnectionCardModel({
      billingModel: entry.billing_model,
      freeTierSummary: entry.free_tier_summary,
      productionCaveat: entry.production_caveat,
    });
    return {
      toolName: normalizeOptionalText(entry.tool_name) ?? "unknown",
      pricingSummary: normalizeOptionalText(entry.pricing_summary) ?? "Pricing metadata unavailable.",
      billingModelLabel: cardModel.billingModelLabel,
      freeTierSummary: cardModel.freeTierSummary,
      productionCaveat: cardModel.productionCaveat,
    };
  });
}

export function readExternalToolUsageLineItemRowModel(args: {
  toolName: string | null | undefined;
  providerKey: string | null | undefined;
  billingCategory: string | null | undefined;
  usageSummary: string;
  estimatedCostLabel: string;
}) {
  return {
    toolNameLabel: normalizeOptionalText(args.toolName) ?? "unknown",
    providerKeyLabel: normalizeOptionalText(args.providerKey) ?? "unknown",
    billingCategoryLabel: normalizeOptionalText(args.billingCategory) ?? "unknown",
    usageSummary: args.usageSummary,
    estimatedCostLabel: args.estimatedCostLabel,
  };
}

export function readExternalToolUsageLineItemRowModels(args: {
  entries: ReadonlyArray<{
    tool_name: string | null | undefined;
    provider_key: string | null | undefined;
    billing_category: string | null | undefined;
    total_quantity: number | null | undefined;
    usage_unit: string | null | undefined;
    total_estimated_cost_usd: number | null | undefined;
  }>;
  formatUsageSummary: (entry: {
    total_quantity: number | null | undefined;
    usage_unit: string | null | undefined;
  }) => string;
  formatCostLabel: (value: number | null | undefined) => string;
}) {
  return args.entries.map((entry) => readExternalToolUsageLineItemRowModel({
    toolName: entry.tool_name,
    providerKey: entry.provider_key,
    billingCategory: entry.billing_category,
    usageSummary: args.formatUsageSummary({
      total_quantity: entry.total_quantity,
      usage_unit: entry.usage_unit,
    }),
    estimatedCostLabel: args.formatCostLabel(entry.total_estimated_cost_usd),
  }));
}

export function readExternalToolUsageEventCardModel(args: {
  toolName: string | null | undefined;
  estimatedCostLabel: string;
  summaryLine: string;
  occurredAtLabel: string | null | undefined;
  occurredAtFallback: string | null | undefined;
}) {
  return {
    toolNameLabel: normalizeOptionalText(args.toolName) ?? "unknown",
    estimatedCostLabel: args.estimatedCostLabel,
    summaryLine: args.summaryLine,
    occurredAtLabel: normalizeOptionalText(args.occurredAtLabel) ?? normalizeOptionalText(args.occurredAtFallback) ?? "unknown",
  };
}

export function readExternalToolUsageEventCardModels(args: {
  entries: ReadonlyArray<{
    tool_name: string | null | undefined;
    estimated_cost_usd: number | null | undefined;
    quantity: number | null | undefined;
    usage_unit: string | null | undefined;
    billing_category: string | null | undefined;
    source: string | null | undefined;
    occurred_at: string | null | undefined;
  }>;
  formatCostLabel: (value: number | null | undefined) => string;
  formatSummaryLine: (entry: {
    quantity: number | null | undefined;
    usage_unit: string | null | undefined;
    billing_category: string | null | undefined;
    source: string | null | undefined;
  }) => string;
  formatOccurredAtLabel: (value: string | null | undefined) => string | null | undefined;
  limit?: number;
}) {
  return args.entries.slice(0, args.limit ?? args.entries.length).map((entry) => readExternalToolUsageEventCardModel({
    toolName: entry.tool_name,
    estimatedCostLabel: args.formatCostLabel(entry.estimated_cost_usd),
    summaryLine: args.formatSummaryLine({
      quantity: entry.quantity,
      usage_unit: entry.usage_unit,
      billing_category: entry.billing_category,
      source: entry.source,
    }),
    occurredAtLabel: args.formatOccurredAtLabel(entry.occurred_at),
    occurredAtFallback: entry.occurred_at,
  }));
}
