// @locs-version: 2.0
import type { WeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";
import type { WeddingVendorSearchProviderKind } from "@/lib/weddingVendorSearchProviderEnvState";
import type {
  WeddingVendorSearchProviderPlan,
  WeddingVendorSearchProviderQuery,
} from "@/lib/weddingVendorSearchProviderPlanState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import {
  normalizeWeddingVendorSourceEvidence,
  type WeddingVendorSourceEvidence,
} from "@/lib/weddingVendorRankingState";

export type WeddingVendorSearchExecutorMode = "dry_run" | "live";

export type WeddingVendorSearchSource = {
  title: string;
  url: string;
  snippet?: string | null;
  provider?: string | null;
  website_url?: string | null;
  map_url?: string | null;
  photo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  instagram_url?: string | null;
} & WeddingVendorSourceEvidence;

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

export type WeddingVendorSearchPlannedBatchPortResult = {
  ok: boolean;
  status?: WeddingVendorSearchExecutionState["status"] | string | null;
  externalSearchPerformed?: boolean | null;
  providerLabel?: string | null;
  queryCount?: number | null;
  sourceCount?: number | null;
  queries?: readonly string[] | null;
  sources?: readonly WeddingVendorSearchSource[] | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WeddingVendorSearchPlannedBatchPort = (
  queries: readonly WeddingVendorSearchProviderQuery[],
) => Promise<WeddingVendorSearchPlannedBatchPortResult> | WeddingVendorSearchPlannedBatchPortResult;

export type WeddingVendorSearchApiBatchResponseLike = {
  ok: boolean;
  status?: string | null;
  external_search_performed?: boolean | null;
  provider_label?: string | null;
  query_count?: number | null;
  source_count?: number | null;
  queries?: readonly string[] | null;
  sources?: readonly WeddingVendorSearchSource[] | null;
  message?: string | null;
  receipt_metadata?: Record<string, unknown> | null;
};

export type WeddingVendorSearchApiQueryLike = {
  provider_kind: string;
  category?: string | null;
  query: string;
  google_place_types?: string[];
  overpass_tags?: string[];
};

export type WeddingVendorSearchApiBatchRequestLike = {
  workspace_id?: string | null;
  wedding_plan_id?: string | null;
  queries: WeddingVendorSearchApiQueryLike[];
  max_results_per_query?: number;
  source_policy?: "directory_only" | "online_capable";
  material_fingerprint?: string | null;
  ranking_policy_version?: string | null;
};

export type WeddingVendorSearchApiBatchSearchPort = (
  body: WeddingVendorSearchApiBatchRequestLike,
) => Promise<WeddingVendorSearchApiBatchResponseLike> | WeddingVendorSearchApiBatchResponseLike;

export type WeddingVendorSearchExecutionState = {
  status: "blocked" | "dry_run" | "executed" | "cached" | "failed";
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
      website_url: clean(value.website_url) || null,
      map_url: clean(value.map_url) || null,
      photo_url: clean(value.photo_url) || null,
      address: clean(value.address) || null,
      phone: clean(value.phone) || null,
      email: clean(value.email) || null,
      instagram_url: clean(value.instagram_url) || null,
      ...normalizeWeddingVendorSourceEvidence(value as unknown as Record<string, unknown>),
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

function sourceReceiptMetadata(sources: readonly WeddingVendorSearchSource[], sourceCount: number = sources.length): Record<string, unknown> {
  return {
    source_count: Math.max(0, sourceCount),
    source_urls: sources.map((source) => source.url).slice(0, 20),
    source_provider_labels: sourceProviderLabels(sources),
    source_counts_by_provider: sourceCountsByProvider(sources),
  };
}

function executionStatusFrom(value: unknown, ok: boolean): WeddingVendorSearchExecutionState["status"] {
  return value === "blocked" || value === "dry_run" || value === "executed" || value === "cached" || value === "failed"
    ? value
    : ok
      ? "executed"
      : "failed";
}

function executionFromBatchResult(input: {
  result: WeddingVendorSearchPlannedBatchPortResult;
  providerLabel: string | null;
  plannedQueries: readonly WeddingVendorSearchProviderQuery[];
  workspaceId?: string | null;
  mode: WeddingVendorSearchExecutorMode;
}): WeddingVendorSearchExecutionState {
  const sources = normalizedSources(input.result.sources);
  const queries = (input.result.queries ?? input.plannedQueries.map((query) => query.query)).map(clean).filter(Boolean);
  const status = executionStatusFrom(input.result.status, input.result.ok);
  const externalSearchPerformed = input.result.externalSearchPerformed ?? (status === "executed");
  const sourceCount = Math.max(0, input.result.sourceCount ?? sources.length);
  return {
    status,
    externalSearchPerformed,
    providerLabel: clean(input.result.providerLabel) || input.providerLabel,
    queryCount: Math.max(0, input.result.queryCount ?? queries.length),
    sourceCount,
    queries,
    sources,
    message: clean(input.result.message)
      || (input.result.ok
        ? `Vendor search completed with ${sources.length} source${sources.length === 1 ? "" : "s"}.`
        : "Live provider-specific vendor search failed."),
    receiptMetadata: plannedReceiptMetadata({
      workspaceId: input.workspaceId,
      mode: input.mode,
      providerLabel: clean(input.result.providerLabel) || input.providerLabel,
      queries: input.plannedQueries,
      status,
      externalSearchPerformed,
      extra: {
        ...(input.result.metadata ?? {}),
        ...sourceReceiptMetadata(sources, sourceCount),
      },
    }),
  };
}

export function weddingVendorSearchBatchResultFromApiResponse(input: {
  response: WeddingVendorSearchApiBatchResponseLike;
  queries: readonly WeddingVendorSearchProviderQuery[];
}): WeddingVendorSearchPlannedBatchPortResult {
  return {
    ok: input.response.ok,
    status: input.response.status,
    externalSearchPerformed: input.response.external_search_performed,
    providerLabel: input.response.provider_label,
    queryCount: input.response.query_count,
    sourceCount: input.response.source_count,
    queries: input.response.queries,
    sources: input.response.sources,
    message: input.response.message,
    metadata: {
      ...(input.response.receipt_metadata ?? {}),
      expected_fields: [...new Set(input.queries.flatMap((query) => query.expectedFields))],
      provider_guardrails: [...new Set(input.queries.flatMap((query) => query.guardrails))],
    },
  };
}

export function weddingVendorSearchApiQueriesFromProviderQueries(
  queries: readonly WeddingVendorSearchProviderQuery[],
): WeddingVendorSearchApiQueryLike[] {
  return queries.map((query) => ({
    provider_kind: query.providerKind,
    category: query.category,
    query: query.query,
    google_place_types: query.googlePlaceTypes,
    overpass_tags: query.overpassTags,
  }));
}

export function weddingVendorSearchBatchPortFromApiSearch(input: {
  search: WeddingVendorSearchApiBatchSearchPort;
  workspaceId?: string | null;
  weddingPlanId?: string | null;
  maxResultsPerQuery?: number | null;
  sourcePolicy?: "directory_only" | "online_capable";
  materialFingerprint?: string | null;
  rankingPolicyVersion?: string | null;
  onResponse?: (response: WeddingVendorSearchApiBatchResponseLike) => void;
}): WeddingVendorSearchPlannedBatchPort {
  let claimSent = false;
  return async (queries) => {
    const maxResultsPerQuery = input.maxResultsPerQuery ?? null;
    const claim = !claimSent && input.materialFingerprint ? input.materialFingerprint : null;
    if (claim) claimSent = true;
    const response = await input.search({
      workspace_id: input.workspaceId ?? null,
      ...(input.weddingPlanId ? { wedding_plan_id: input.weddingPlanId } : {}),
      ...(maxResultsPerQuery && maxResultsPerQuery > 0 ? { max_results_per_query: maxResultsPerQuery } : {}),
      ...(input.sourcePolicy ? { source_policy: input.sourcePolicy } : {}),
      ...(claim ? { material_fingerprint: claim, ranking_policy_version: input.rankingPolicyVersion ?? "1" } : {}),
      queries: weddingVendorSearchApiQueriesFromProviderQueries(queries),
    });
    input.onResponse?.(response);
    return weddingVendorSearchBatchResultFromApiResponse({ response, queries });
  };
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
      ...sourceReceiptMetadata(sources),
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
  batchPort?: WeddingVendorSearchPlannedBatchPort | null;
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

  if (input.batchPort) {
    return executionFromBatchResult({
      result: await input.batchPort(plannedQueries),
      providerLabel,
      plannedQueries,
      workspaceId: input.workspaceId,
      mode,
    });
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
        ...sourceReceiptMetadata(sources),
      },
    }),
  };
}
