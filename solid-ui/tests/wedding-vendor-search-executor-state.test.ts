import assert from "node:assert/strict";
import test from "node:test";

import {
  runWeddingVendorSearchExecution,
  weddingVendorSearchBatchPortFromApiSearch,
  weddingVendorSearchPortAvailable,
} from "@/lib/weddingVendorSearchExecutorState";
import { buildWeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";

const readyBrief = buildWeddingVendorSearchReadinessState({
  location: "Sydney",
  vendorCategories: ["photographer", "celebrant"],
  vendorPreferences: "transparent pricing, documentary style",
  photographyScope: "day-of coverage and wedding portraits",
  liveSearchProviderReady: true,
});

test("runWeddingVendorSearchExecution blocks when vendor-search intake is incomplete", async () => {
  const blocked = buildWeddingVendorSearchReadinessState({});
  const state = await runWeddingVendorSearchExecution({
    readiness: blocked,
    mode: "live",
    port: () => ({ ok: true, query: "unused" }),
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.queryCount, 0);
  assert.match(state.message, /Vendor search blocked/i);
  assert.deepEqual(state.receiptMetadata.missing_context, blocked.missing);
});

test("runWeddingVendorSearchExecution prepares dry-run queries without external search", async () => {
  const state = await runWeddingVendorSearchExecution({
    readiness: readyBrief,
    mode: "dry_run",
    providerLabel: "Google Places API",
    providerKind: "google_places",
    maxQueries: 2,
  });

  assert.equal(state.status, "dry_run");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.queryCount, 2);
  assert.equal(state.sourceCount, 0);
  assert.equal(state.receiptMetadata.vendor_search_mode, "dry_run");
  assert.equal(state.receiptMetadata.provider_kind, "google_places");
  assert.equal(state.receiptMetadata.provider_smoke_test_only, true);
});

test("runWeddingVendorSearchExecution fails safely when live port is missing", async () => {
  const state = await runWeddingVendorSearchExecution({
    readiness: readyBrief,
    mode: "live",
    providerLabel: "Google Places API",
    providerKind: "google_places",
  });

  assert.equal(state.status, "failed");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.receiptMetadata.provider_kind, "google_places");
  assert.equal(state.receiptMetadata.missing_provider_port, "vendor_search");
  assert.match(state.message, /not connected/i);
});

test("runWeddingVendorSearchExecution records live provider failures", async () => {
  const state = await runWeddingVendorSearchExecution({
    readiness: readyBrief,
    mode: "live",
    providerKind: "brave_search",
    maxQueries: 1,
    port: (query) => ({ ok: false, query, message: "Brave quota exhausted.", metadata: { status_code: 429 } }),
  });

  assert.equal(state.status, "failed");
  assert.equal(state.externalSearchPerformed, false);
  assert.equal(state.receiptMetadata.provider_kind, "brave_search");
  assert.equal(state.receiptMetadata.status_code, 429);
  assert.match(state.message, /quota exhausted/i);
});

test("runWeddingVendorSearchExecution normalizes live source results", async () => {
  const seenQueries: string[] = [];
  const state = await runWeddingVendorSearchExecution({
    readiness: readyBrief,
    mode: "live",
    providerLabel: "OSM / Overpass API",
    providerKind: "overpass",
    workspaceId: "response_workspace:planning-pass",
    maxQueries: 2,
    port: (query) => {
      seenQueries.push(query);
      return {
        ok: true,
        query,
        sources: [
          { title: "Studio A", url: "https://studio.example", snippet: "Documentary wedding photography.", provider: "Brave" },
          { title: "Studio A", url: "https://studio.example", snippet: "Duplicate should be removed.", provider: "Brave" },
          { title: "Missing URL", url: "" },
        ],
      };
    },
  });

  assert.equal(state.status, "executed");
  assert.equal(state.externalSearchPerformed, true);
  assert.equal(state.receiptMetadata.provider_kind, "overpass");
  assert.equal(state.queryCount, 2);
  assert.equal(seenQueries.length, 2);
  assert.equal(state.sourceCount, 1);
  assert.equal(state.sources[0]?.title, "Studio A");
  assert.deepEqual(state.receiptMetadata.source_urls, ["https://studio.example"]);
  assert.deepEqual(state.receiptMetadata.source_provider_labels, ["Brave"]);
  assert.deepEqual(state.receiptMetadata.source_counts_by_provider, { Brave: 1 });
  assert.match(String(state.receiptMetadata.receipt_id), /^wedding_vendor_search:live:/);
});

test("weddingVendorSearchPortAvailable exposes whether live search can be registered", () => {
  assert.equal(weddingVendorSearchPortAvailable(null), false);
  assert.equal(weddingVendorSearchPortAvailable(() => ({ ok: true, query: "x" })), true);
});

test("directory-only batch ports forward the explicit source policy without changing queries", async () => {
  let request: Record<string, unknown> | null = null;
  const port = weddingVendorSearchBatchPortFromApiSearch({
    sourcePolicy: "directory_only",
    search: async (body) => {
      request = body as unknown as Record<string, unknown>;
      return {
        ok: true, status: "cached", external_search_performed: false, provider_label: "Admin vendor database",
        query_count: body.queries.length, source_count: 1, queries: body.queries.map((query) => query.query),
        sources: [{ title: "Harbour Studio", url: "https://studio.example", provider: "Admin vendor database" }],
        message: "Directory-only vendor search returned 1 source; online providers were not called.", receipt_metadata: { source_policy: "directory_only" },
      };
    },
  });
  const result = await port([{ providerKind: "google_places", category: "photographer", query: "photographer Sydney", googlePlaceTypes: [], overpassTags: [], expectedFields: [], guardrails: [] }]);

  assert.equal(request?.source_policy, "directory_only");
  assert.equal(result.externalSearchPerformed, false);
  assert.equal(result.status, "cached");
  assert.equal(result.sources.length, 1);
});
