import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { buildWeddingVendorComparisonArtifactState } from "../src/lib/weddingVendorSearchArtifactState.ts";
import { runWeddingVendorSearchExecution } from "../src/lib/weddingVendorSearchExecutorState.ts";
import { buildWeddingVendorSearchReadinessState } from "../src/lib/weddingVendorSearchReadinessState.ts";
import {
  weddingMemoryStorage as memoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

const readiness = buildWeddingVendorSearchReadinessState({
  location: "Hunter Valley",
  vendorCategories: ["venue"],
  vendorPreferences: "garden rustic vineyard",
  liveSearchProviderReady: true,
});

function attribute(value: unknown) {
  return { status: "known", value, confidence: 0.9, authority: "primary_official" };
}

async function comparisonCards() {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Google Places API",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Redleaf Wollombi",
          url: "https://redleaf.example/",
          website_url: "https://redleaf.example/",
          snippet: "Garden estate with rustic vineyard ceremonies in the Hunter Valley.",
          provider: "Google Places API",
          address: "1 Main Rd, Wollombi NSW 2325",
          vendor_id: "vendor-redleaf",
          category: "venue",
          source_kind: "official",
          rating: 4.8,
          review_count: 312,
          attributes: {
            capacity_seated_max: attribute(120),
            rating_google: { ...attribute(4.8), authority: "independent_aggregate" },
            review_count_google: { ...attribute(312), authority: "independent_aggregate" },
          },
          availability: { state: "confirmed_available", source: "user", checked_at: "2026-09-30T00:00:00Z" },
        },
        {
          title: "Peterson Barn",
          url: "https://peterson.example/",
          website_url: "https://peterson.example/",
          snippet: "Rustic barn venue with garden lawns and vineyard views.",
          provider: "Google Places API",
          vendor_id: "vendor-peterson",
          category: "venue",
          availability: { state: "awaiting_response", source: "outreach" },
        },
        {
          title: "Old Hall Rooms",
          url: "https://oldhall.example/",
          snippet: "Garden rustic vineyard function rooms.",
          provider: "Google Places API",
          vendor_id: "vendor-oldhall",
          category: "venue",
          availability: { state: "confirmed_unavailable", source: "user" },
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "garden rustic vineyard",
    location: "Hunter Valley",
    guestCount: "100",
    vendorCategories: ["venue"],
  });
  assert.equal(comparison.status, "created");
  const artifactInput = comparison.artifactInput;
  assert.ok(artifactInput);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: artifactInput.id,
    artifacts: [artifactInput],
    projectionStorage: memoryStorage(),
  });
  return { comparison, cards: state.activePreview?.vendorComparisonCards ?? [] };
}

test("server evidence flows from search sources into ranked comparison cards", async () => {
  const { comparison, cards } = await comparisonCards();
  const redleaf = cards.find((card) => card.title === "Redleaf Wollombi");
  const peterson = cards.find((card) => card.title === "Peterson Barn");

  assert.equal(redleaf?.group, "bookable");
  assert.equal(redleaf?.availabilityState, "confirmed_available");
  assert.equal(redleaf?.availabilityLabel, "Available on your date");
  assert.equal(redleaf?.vendorId, "vendor-redleaf");
  assert.match(redleaf?.scoreLabel ?? "", /^\d+ fit · (low|medium|high) confidence$/);
  assert.match(redleaf?.confidenceLabel ?? "", / confidence$/);
  assert.equal(redleaf?.weddingPlanId, "wedding_plan:harbour");
  assert.deepEqual(redleaf?.unknownConstraints, []);

  assert.equal(peterson?.group, "verify");
  assert.equal(peterson?.availabilityLabel, "Awaiting reply");
  assert.deepEqual(peterson?.unknownConstraints, ["capacity"]);
  assert.equal(cards[0]?.title, "Redleaf Wollombi", "bookable vendors are shown before ones to verify");
  assert.ok(!cards.some((card) => card.title === "Old Hall Rooms"), "unavailable vendors are not offered as cards");

  const markdown = comparison.markdown ?? "";
  assert.match(markdown, /## Bookable candidates[\s\S]*Redleaf Wollombi/);
  assert.match(markdown, /## High-potential — availability needs confirmation[\s\S]*Peterson Barn/);
  assert.match(markdown, /## Excluded[\s\S]*Old Hall Rooms[\s\S]*unavailable on requested date/);
  assert.match(markdown, /Confirm seated capacity for Peterson Barn \(you have 100 guests\)/);
});
