import assert from "node:assert/strict";
import test from "node:test";

import { runWeddingPlannedVendorSearchExecution } from "../src/lib/weddingVendorSearchExecutorState.ts";
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
