import assert from "node:assert/strict";
import test from "node:test";

import {
  runWeddingPlannedVendorSearchExecution,
  weddingVendorSearchApiQueriesFromProviderQueries,
  weddingVendorSearchBatchPortFromApiSearch,
  weddingVendorSearchBatchResultFromApiResponse,
} from "../src/lib/weddingVendorSearchExecutorState.ts";
import { buildWeddingVendorSearchProviderPlanState } from "../src/lib/weddingVendorSearchProviderPlanState.ts";
import { buildWeddingVendorSearchReadinessState } from "../src/lib/weddingVendorSearchReadinessState.ts";

const readiness = buildWeddingVendorSearchReadinessState({
  location: "Sydney",
  vendorCategories: ["venue", "floral_designer", "photographer"],
  vendorPreferences: "waterfront, transparent pricing, documentary photos",
  photographyScope: "day-of coverage and wedding portraits",
  liveSearchProviderReady: true,
});

const plan = buildWeddingVendorSearchProviderPlanState({
  readiness,
  providerKinds: ["google_places", "overpass"],
  maxCategories: 2,
});

test("planned vendor search dry-run preserves provider-specific metadata", async () => {
  const state = await runWeddingPlannedVendorSearchExecution({
    providerPlans: plan.providerPlans,
    mode: "dry_run",
    providerLabel: "Admin wedding search stack",
    workspaceId: "response_workspace:vendors",
    maxQueries: 3,
  });

  assert.equal(state.status, "dry_run");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.queryCount, 3);
  assert.deepEqual(state.receiptMetadata.provider_kinds, ["google_places", "overpass"]);
  assert.ok((state.receiptMetadata.google_place_types as string[]).includes("event_venue"));
  assert.ok((state.receiptMetadata.overpass_tags as string[]).includes("amenity=events_venue"));
  assert.ok((state.receiptMetadata.expected_fields as string[]).includes("place id"));
  assert.equal(state.receiptMetadata.provider_smoke_test_only, true);
});

test("planned vendor search live port receives structured query intent", async () => {
  const seen: string[] = [];
  const state = await runWeddingPlannedVendorSearchExecution({
    providerPlans: plan.providerPlans,
    mode: "live",
    maxQueries: 2,
    port: (query) => {
      seen.push(`${query.providerKind}:${query.category}:${query.googlePlaceTypes.join(",")}:${query.overpassTags.join(",")}`);
      return {
        ok: true,
        query: query.query,
        sources: [{
          title: `${query.category} result`,
          url: `https://example.com/${query.providerKind}/${query.category}`,
          provider: query.providerKind,
        }],
      };
    },
  });

  assert.equal(state.status, "executed");
  assert.equal(state.externalSearchPerformed, true);
  assert.equal(state.sourceCount, 2);
  assert.match(seen[0] ?? "", /^google_places:venue:event_venue,restaurant,lodging:/);
  assert.match(seen[1] ?? "", /^google_places:floral_designer:florist:/);
  assert.deepEqual(state.receiptMetadata.source_urls, [
    "https://example.com/google_places/venue",
    "https://example.com/google_places/floral_designer",
  ]);
  assert.deepEqual(state.receiptMetadata.source_provider_labels, ["google_places"]);
  assert.deepEqual(state.receiptMetadata.source_counts_by_provider, { google_places: 2 });
});

test("planned vendor search batch port normalizes backend batch responses", async () => {
  let receivedQueryCount = 0;
  const state = await runWeddingPlannedVendorSearchExecution({
    providerPlans: plan.providerPlans,
    mode: "live",
    providerLabel: "Admin wedding search stack",
    workspaceId: "response_workspace:vendors",
    maxQueries: 2,
    batchPort: (queries) => {
      receivedQueryCount = queries.length;
      return {
        ok: true,
        status: "cached",
        externalSearchPerformed: false,
        providerLabel: "Admin vendor database",
        queryCount: queries.length,
        sourceCount: 1,
        queries: queries.map((query) => query.query),
        sources: [{
          title: "Harbour Studio",
          url: "https://example.test/harbour-studio",
          provider: "Admin vendor database",
        }],
        message: "Admin vendor database returned 1 reusable source.",
        metadata: {
          admin_vendor_database_used: true,
        },
      };
    },
  });

  assert.equal(receivedQueryCount, 2);
  assert.equal(state.status, "cached");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.providerLabel, "Admin vendor database");
  assert.equal(state.sourceCount, 1);
  assert.equal(state.receiptMetadata.admin_vendor_database_used, true);
  assert.deepEqual(state.receiptMetadata.provider_kinds, ["google_places"]);
  assert.deepEqual(state.receiptMetadata.source_provider_labels, ["Admin vendor database"]);
});

test("planned vendor search API adapter keeps backend mapping out of the view", () => {
  const queries = plan.providerPlans.flatMap((providerPlan) => providerPlan.queries).slice(0, 2);
  const result = weddingVendorSearchBatchResultFromApiResponse({
    queries,
    response: {
      ok: true,
      status: "executed",
      external_search_performed: true,
      provider_label: "Google Places",
      query_count: 2,
      source_count: 1,
      queries: queries.map((query) => query.query),
      sources: [{
        title: "Harbour Venue",
        url: "https://example.com/harbour-venue",
        provider: "Google Places",
      }],
      message: "Live vendor search completed.",
      receipt_metadata: {
        admin_vendor_database_used: true,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "executed");
  assert.equal(result.externalSearchPerformed, true);
  assert.equal(result.providerLabel, "Google Places");
  assert.equal(result.sourceCount, 1);
  assert.equal(result.metadata?.admin_vendor_database_used, true);
  assert.ok((result.metadata?.expected_fields as string[]).includes("place id"));
  assert.ok((result.metadata?.provider_guardrails as string[]).length > 0);
});

test("planned vendor search API query adapter preserves provider-specific fields", () => {
  const queries = plan.providerPlans.flatMap((providerPlan) => providerPlan.queries).slice(0, 3);
  const apiQueries = weddingVendorSearchApiQueriesFromProviderQueries(queries);

  assert.equal(apiQueries.length, 3);
  assert.equal(apiQueries[0]?.provider_kind, "google_places");
  assert.equal(apiQueries[0]?.category, "venue");
  assert.ok(apiQueries[0]?.query.includes("Sydney"));
  assert.deepEqual(apiQueries[0]?.google_place_types, ["event_venue", "restaurant", "lodging"]);
  assert.deepEqual(apiQueries[0]?.overpass_tags, []);
  assert.equal(apiQueries[2]?.provider_kind, "overpass");
  assert.ok((apiQueries[2]?.overpass_tags ?? []).length > 0);
});

test("planned vendor search batch port factory calls backend search and normalizes response", async () => {
  const queries = plan.providerPlans.flatMap((providerPlan) => providerPlan.queries).slice(0, 2);
  let observedWorkspaceId = "";
  let observedMaxResults = 0;
  let observedQueryCount = 0;
  let observedNoticeProvider = "";
  const port = weddingVendorSearchBatchPortFromApiSearch({
    workspaceId: "response_workspace:vendors",
    maxResultsPerQuery: 5,
    onResponse: (response) => {
      observedNoticeProvider = response.provider_label ?? "";
    },
    search: (body) => {
      observedWorkspaceId = body.workspace_id ?? "";
      observedMaxResults = body.max_results_per_query ?? 0;
      observedQueryCount = body.queries.length;
      return {
        ok: true,
        status: "executed",
        external_search_performed: true,
        provider_label: "Google Places",
        query_count: body.queries.length,
        source_count: 1,
        queries: body.queries.map((query) => query.query),
        sources: [{
          title: "Harbour Venue",
          url: "https://example.com/harbour-venue",
          provider: "Google Places",
        }],
        message: "Live vendor search completed.",
        receipt_metadata: {
          admin_vendor_database_used: false,
        },
      };
    },
  });

  const result = await port(queries);

  assert.equal(observedWorkspaceId, "response_workspace:vendors");
  assert.equal(observedMaxResults, 5);
  assert.equal(observedQueryCount, 2);
  assert.equal(observedNoticeProvider, "Google Places");
  assert.equal(result.ok, true);
  assert.equal(result.providerLabel, "Google Places");
  assert.equal(result.sourceCount, 1);
  assert.ok((result.metadata?.expected_fields as string[]).includes("place id"));
});

test("planned vendor search fails safely for missing executor and provider failure", async () => {
  const missing = await runWeddingPlannedVendorSearchExecution({
    providerPlans: plan.providerPlans,
    mode: "live",
    maxQueries: 1,
  });
  const failed = await runWeddingPlannedVendorSearchExecution({
    providerPlans: plan.providerPlans,
    mode: "live",
    maxQueries: 1,
    port: (query) => ({
      ok: false,
      query: query.query,
      message: "Places quota exhausted.",
      metadata: { status_code: 429 },
    }),
  });

  assert.equal(missing.status, "failed");
  assert.equal(missing.receiptMetadata.missing_provider_port, "planned_vendor_search");
  assert.equal(failed.status, "failed");
  assert.equal(failed.receiptMetadata.status_code, 429);
  assert.match(failed.message, /quota exhausted/i);
});

test("planned vendor search blocks empty plans without external search", async () => {
  const state = await runWeddingPlannedVendorSearchExecution({
    providerPlans: [],
    mode: "live",
    port: () => ({ ok: true, query: "unused" }),
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.queryCount, 0);
  assert.deepEqual(state.receiptMetadata.missing_context, ["provider-specific vendor search plan"]);
});
