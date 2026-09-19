// @locs-version: 2.0
import type { WeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";
import type { WeddingVendorSearchProviderKind } from "@/lib/weddingVendorSearchProviderEnvState";
import type {
  WeddingVendorSearchProviderPlan,
  WeddingVendorSearchProviderQuery,
} from "@/lib/weddingVendorSearchProviderPlanState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingVendorSearchExecutorMode = "dry_run" | "live";

export type WeddingVendorSearchSource = {
  title: string;
  url: string;
  snippet?: string | null;
  provider?: string | null;
};

export type WeddingVendorSearchPortResult = {
  ok: boolean;
  query: string;
  sources?: readonly WeddingVendorSearchSource[] | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WeddingVendorSearchPort = (
  query: string,
) => Promise<WeddingVendorSearchPortResult> | WeddingVendorSearchPortResult;

export type WeddingVendorSearchPlannedPort = (
  query: WeddingVendorSearchProviderQuery,
) => Promise<WeddingVendorSearchPortResult> | WeddingVendorSearchPortResult;

export type WeddingVendorSearchExecutionState = {
  status: "blocked" | "dry_run" | "executed" | "failed";
  externalSearchPerformed: boolean;
  providerLabel: string | null;
  queryCount: number;
  sourceCount: number;
  queries: string[];
  sources: WeddingVendorSearchSource[];
  message: string;
  receiptMetadata: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedSources(values: readonly WeddingVendorSearchSource[] | null | undefined): WeddingVendorSearchSource[] {
  const seen = new Set<string>();
  const sources: WeddingVendorSearchSource[] = [];
  for (const value of values ?? []) {
    const title = clean(value.title);
    const url = clean(value.url);
    if (!title || !url) continue;
    const key = `${title.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title,
      url,
      snippet: clean(value.snippet) || null,
      provider: clean(value.provider) || null,
    });
  }
  return sources;
}

function sourceProviderLabels(sources: readonly WeddingVendorSearchSource[]): string[] {
  return [...new Set(sources.map((source) => clean(source.provider)).filter(Boolean))];
}

function sourceCountsByProvider(sources: readonly WeddingVendorSearchSource[]): Record<string, number> {
  return sources.reduce<Record<string, number>>((counts, source) => {
    const provider = clean(source.provider) || "unknown";
    counts[provider] = (counts[provider] ?? 0) + 1;
    return counts;
  }, {});
}

function receiptId(args: { workspaceId?: string | null; mode: WeddingVendorSearchExecutorMode; queries: readonly string[] }) {
  return [
    "wedding_vendor_search",
    args.mode,
    safeWeddingLabel(args.workspaceId),
    safeWeddingLabel(args.queries[0] ?? "no-query"),
  ].join(":");
}

function flattenPlanQueries(plans: readonly WeddingVendorSearchProviderPlan[], maxQueries: number): WeddingVendorSearchProviderQuery[] {
  const ordered = [...plans].sort((a, b) => a.priority - b.priority);
  return ordered.flatMap((plan) => plan.queries).slice(0, Math.max(1, maxQueries));
}

function plannedReceiptMetadata(input: {
  workspaceId?: string | null;
  mode: WeddingVendorSearchExecutorMode;
  providerLabel: string | null;
  queries: readonly WeddingVendorSearchProviderQuery[];
  status: string;
  externalSearchPerformed: boolean;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    receipt_id: receiptId({ workspaceId: input.workspaceId, mode: input.mode, queries: input.queries.map((query) => query.query) }),
    vendor_search_mode: input.mode,
    vendor_search_status: input.status,
    provider_label: input.providerLabel,
    provider_kinds: [...new Set(input.queries.map((query) => query.providerKind))],
    vendor_categories: [...new Set(input.queries.map((query) => query.category))],
    google_place_types: [...new Set(input.queries.flatMap((query) => query.googlePlaceTypes))],
    overpass_tags: [...new Set(input.queries.flatMap((query) => query.overpassTags))],
    expected_fields: [...new Set(input.queries.flatMap((query) => query.expectedFields))],
    provider_guardrails: [...new Set(input.queries.flatMap((query) => query.guardrails))],
    external_search_performed: input.externalSearchPerformed,
    query_count: input.queries.length,
    ...(input.extra ?? {}),
  };
}

export async function runWeddingVendorSearchExecution(input: {
  readiness: WeddingVendorSearchReadinessState;
  mode?: WeddingVendorSearchExecutorMode | null;
  port?: WeddingVendorSearchPort | null;
  providerLabel?: string | null;
  providerKind?: WeddingVendorSearchProviderKind | null;
  workspaceId?: string | null;
  maxQueries?: number | null;
}): Promise<WeddingVendorSearchExecutionState> {
  const mode = input.mode === "live" ? "live" : "dry_run";
  const providerLabel = clean(input.providerLabel) || null;
  const providerKind = clean(input.providerKind) || null;
  const queries = input.readiness.searchQueries.slice(0, Math.max(1, input.maxQueries ?? 5));

  if (input.readiness.status === "blocked") {
    return {
      status: "blocked",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: 0,
      sourceCount: 0,
      queries: [],
      sources: [],
      message: `Vendor search blocked: ${input.readiness.missing.join(", ") || "missing required context"}.`,
      receiptMetadata: {
        receipt_id: receiptId({ workspaceId: input.workspaceId, mode, queries }),
        vendor_search_mode: mode,
        vendor_search_status: "blocked",
        provider_kind: providerKind,
        external_search_performed: false,
        missing_context: input.readiness.missing,
      },
    };
  }

  if (mode === "dry_run") {
    return {
      status: "dry_run",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: queries.length,
      sourceCount: 0,
      queries,
      sources: [],
      message: "Vendor-search smoke test prepared in dry-run mode. No live vendor search was performed.",
      receiptMetadata: {
        receipt_id: receiptId({ workspaceId: input.workspaceId, mode, queries }),
        vendor_search_mode: "dry_run",
        vendor_search_status: "dry_run",
        provider_kind: providerKind,
        provider_label: providerLabel,
        external_search_performed: false,
        provider_smoke_test_only: true,
        query_count: queries.length,
      },
    };
  }

  if (!input.port) {
    return {
      status: "failed",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: queries.length,
      sourceCount: 0,
      queries,
      sources: [],
      message: "Live vendor-search provider is not connected.",
      receiptMetadata: {
        receipt_id: receiptId({ workspaceId: input.workspaceId, mode, queries }),
        vendor_search_mode: "live",
        vendor_search_status: "failed",
        provider_kind: providerKind,
        provider_label: providerLabel,
        external_search_performed: false,
        missing_provider_port: "vendor_search",
        query_count: queries.length,
      },
    };
  }

  const results = await Promise.all(queries.map((query) => input.port!(query)));
  const failed = results.find((result) => !result.ok);
  if (failed) {
    return {
      status: "failed",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: queries.length,
      sourceCount: 0,
      queries,
      sources: [],
      message: clean(failed.message) || "Live vendor-search provider failed.",
      receiptMetadata: {
        receipt_id: receiptId({ workspaceId: input.workspaceId, mode, queries }),
        vendor_search_mode: "live",
        vendor_search_status: "failed",
        provider_kind: providerKind,
        provider_label: providerLabel,
        external_search_performed: false,
        failed_query: failed.query,
        query_count: queries.length,
        ...(failed.metadata ?? {}),
      },
    };
  }

  const sources = normalizedSources(results.flatMap((result) => result.sources ?? []));
  const sourceProviders = sourceProviderLabels(sources);
  return {
    status: "executed",
    externalSearchPerformed: true,
    providerLabel,
    queryCount: queries.length,
    sourceCount: sources.length,
    queries,
    sources,
    message: sources.length > 0
      ? `Live vendor search completed with ${sources.length} source${sources.length === 1 ? "" : "s"}.`
      : "Live vendor search completed but returned no usable sources.",
    receiptMetadata: {
      receipt_id: receiptId({ workspaceId: input.workspaceId, mode, queries }),
      vendor_search_mode: "live",
      vendor_search_status: "executed",
      provider_kind: providerKind,
      provider_label: providerLabel,
      external_search_performed: true,
      query_count: queries.length,
      source_count: sources.length,
      source_urls: sources.map((source) => source.url).slice(0, 20),
      source_provider_labels: sourceProviders,
      source_counts_by_provider: sourceCountsByProvider(sources),
    },
  };
}

export function weddingVendorSearchPortAvailable(port: WeddingVendorSearchPort | null | undefined): boolean {
  return Boolean(port);
}

export async function runWeddingPlannedVendorSearchExecution(input: {
  providerPlans: readonly WeddingVendorSearchProviderPlan[];
  mode?: WeddingVendorSearchExecutorMode | null;
  port?: WeddingVendorSearchPlannedPort | null;
  providerLabel?: string | null;
  workspaceId?: string | null;
  maxQueries?: number | null;
}): Promise<WeddingVendorSearchExecutionState> {
  const mode = input.mode === "live" ? "live" : "dry_run";
  const providerLabel = clean(input.providerLabel) || null;
  const plannedQueries = flattenPlanQueries(input.providerPlans, input.maxQueries ?? 6);
  const queries = plannedQueries.map((query) => query.query);

  if (plannedQueries.length === 0) {
    return {
      status: "blocked",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: 0,
      sourceCount: 0,
      queries: [],
      sources: [],
      message: "Planned vendor search blocked: no provider-specific queries are available.",
      receiptMetadata: plannedReceiptMetadata({
        workspaceId: input.workspaceId,
        mode,
        providerLabel,
        queries: [],
        status: "blocked",
        externalSearchPerformed: false,
        extra: { missing_context: ["provider-specific vendor search plan"] },
      }),
    };
  }

  if (mode === "dry_run") {
    return {
      status: "dry_run",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: plannedQueries.length,
      sourceCount: 0,
      queries,
      sources: [],
      message: "Provider-specific vendor-search smoke test prepared in dry-run mode. No live vendor search was performed.",
      receiptMetadata: plannedReceiptMetadata({
        workspaceId: input.workspaceId,
        mode,
        providerLabel,
        queries: plannedQueries,
        status: "dry_run",
        externalSearchPerformed: false,
        extra: { provider_smoke_test_only: true },
      }),
    };
  }

  if (!input.port) {
    return {
      status: "failed",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: plannedQueries.length,
      sourceCount: 0,
      queries,
      sources: [],
      message: "Live provider-specific vendor-search executor is not connected.",
      receiptMetadata: plannedReceiptMetadata({
        workspaceId: input.workspaceId,
        mode,
        providerLabel,
        queries: plannedQueries,
        status: "failed",
        externalSearchPerformed: false,
        extra: { missing_provider_port: "planned_vendor_search" },
      }),
    };
  }

  const results = await Promise.all(plannedQueries.map((query) => input.port!(query)));
  const failed = results.find((result) => !result.ok);
  if (failed) {
    return {
      status: "failed",
      externalSearchPerformed: false,
      providerLabel,
      queryCount: plannedQueries.length,
      sourceCount: 0,
      queries,
      sources: [],
      message: clean(failed.message) || "Live provider-specific vendor search failed.",
      receiptMetadata: plannedReceiptMetadata({
        workspaceId: input.workspaceId,
        mode,
        providerLabel,
        queries: plannedQueries,
        status: "failed",
        externalSearchPerformed: false,
        extra: {
          failed_query: failed.query,
          ...(failed.metadata ?? {}),
        },
      }),
    };
  }

  const sources = normalizedSources(results.flatMap((result) => result.sources ?? []));
  const sourceProviders = sourceProviderLabels(sources);
  return {
    status: "executed",
    externalSearchPerformed: true,
    providerLabel,
    queryCount: plannedQueries.length,
    sourceCount: sources.length,
    queries,
    sources,
    message: sources.length > 0
      ? `Provider-specific live vendor search completed with ${sources.length} source${sources.length === 1 ? "" : "s"}.`
      : "Provider-specific live vendor search completed but returned no usable sources.",
    receiptMetadata: plannedReceiptMetadata({
      workspaceId: input.workspaceId,
      mode,
      providerLabel,
      queries: plannedQueries,
      status: "executed",
      externalSearchPerformed: true,
      extra: {
        source_count: sources.length,
        source_urls: sources.map((source) => source.url).slice(0, 20),
        source_provider_labels: sourceProviders,
        source_counts_by_provider: sourceCountsByProvider(sources),
      },
    }),
  };
}
