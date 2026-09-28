import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceState } from "@/lib/weddingResponseWorkspaceState";
import {
  buildWeddingVendorSeedState,
  buildWeddingVendorSeedTaskItems,
  weddingVendorSeedDetailsFromEditableVendorRows,
  weddingVendorSeedDetailFromDbRow,
} from "@/lib/weddingVendorSeedState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:vendor-seeds",
  source_response_id: "afp:response-1",
};

test("buildWeddingVendorSeedState creates a conservative vendor artifact from source-backed seeds", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    seeds: [
      {
        vendorSlug: "crown-sydney-weddings",
        vendorName: "Crown Sydney Weddings",
        category: "Venue",
        serviceArea: "Sydney, NSW",
        websiteUrl: "https://www.crownhotels.com.au/",
        contactEmail: "weddings@crownsydney.com.au",
        sourceUrl: "https://www.crownhotels.com.au/",
        sourceLabel: "Official Crown wedding contact page",
        sourceCheckedAt: "2026-09-14",
        evidence: {
          verified_fields: ["category", "service_area", "email"],
          price_basis: "not verified; request quote",
          availability_basis: "not verified; request date-specific availability",
        },
        caveatLabels: ["No availability guarantee"],
      },
      {
        vendorSlug: "best-buds-sydney-florist",
        vendorName: "Best Buds Sydney Florist",
        category: "Floral Designer",
        serviceArea: "Sydney, NSW",
        websiteUrl: "https://bestbuds.com.au/",
        contactPhone: "+61 (02) 9310 1136",
        sourceUrl: "https://bestbuds.com.au/",
        sourceLabel: "Official Best Buds contact page",
        sourceCheckedAt: "2026-09-14",
      },
    ],
  });

  assert.equal(state.status, "needs_live_recheck");
  assert.match(state.summary, /live price, availability, or fit checks are still required/i);
  assert.equal(state.vendorCount, 2);
  assert.equal(state.categoryCount, 2);
  assert.equal(state.sourceCount, 2);
  assert.equal(state.evidenceCount, 3);
  assert.equal(state.freshnessStatus, "needs_live_recheck");
  assert.equal(state.artifactInput?.metadata.vendorFreshnessReady, false);
  assert.equal(state.artifactInput?.metadata.vendorPriceRecheckCount, 2);
  assert.equal(state.artifactInput?.metadata.vendorAvailabilityRecheckCount, 2);
  assert.equal(state.summaryArtifact?.kind, "vendor_table");
  assert.match(state.markdown ?? "", /not live availability checks, quotes, endorsements/i);
  assert.match(state.markdown ?? "", /Freshness review/i);
  assert.match(state.markdown ?? "", /request current quote and date-specific availability/i);
  assert.match(state.markdown ?? "", /Verified fields: category, service_area, email/i);
  assert.match(state.markdown ?? "", /Price basis: not verified; request quote/i);
  assert.equal(state.artifactInput?.metadata.vendorSeedEvidenceCount, 3);
  assert.ok(state.caveatLabels.includes("Seeded vendors require live recheck before recommendation or outreach."));

  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: state.artifactInput ? [state.artifactInput] : [],
    query: "request quote",
  });

  assert.equal(workspace.totalArtifacts, 1);
  assert.equal(workspace.results[0]?.kind, "vendor_table");
  assert.ok(workspace.results[0]?.searchText.includes("request quote"));
  assert.ok(workspace.results[0]?.searchText.includes("request date-specific availability"));
  assert.ok(workspace.results[0]?.vendorLabels.includes("Best Buds Sydney Florist"));
});

test("weddingVendorSeedDetailFromDbRow maps Oracle seed rows with structured evidence", () => {
  const detail = weddingVendorSeedDetailFromDbRow({
    vendor_slug: "divon-photography",
    vendor_name: "Divon Photography",
    category: "Photographer",
    service_area: "Sydney, NSW",
    website_url: "https://divonphotography.com.au/",
    contact_phone: "02 9161 0000",
    contact_email: "hello@divonphotography.com.au",
    source_url: "https://divonphotography.com.au/",
    source_label: "Official Divon Photography contact page",
    source_checked_at: "2026-09-14",
    evidence: JSON.stringify({
      verified_fields: ["category", "service_area", "phone", "email"],
      service_notes: ["photography", "videography"],
      price_basis: "not verified; request package quote",
      availability_basis: "not verified; request date-specific availability",
    }),
    caveat_labels: ["Confirm photography versus videography scope before search or outreach"],
  });
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    seeds: [detail],
  });

  assert.equal(detail.vendorName, "Divon Photography");
  assert.equal(state.status, "needs_live_recheck");
  assert.equal(state.evidenceCount, 4);
  assert.match(state.markdown ?? "", /Services: photography, videography/i);
  assert.match(state.markdown ?? "", /request package quote/i);
  assert.ok(state.caveatLabels.includes("Confirm photography versus videography scope before search or outreach"));
});

test("editable wedding vendor rows can feed seeded vendor freshness artifacts", () => {
  const details = weddingVendorSeedDetailsFromEditableVendorRows([
    {
      vendor_slug: "harbour-venue",
      vendor_name: "Harbour Venue",
      category: "Venue",
      service_area: "Sydney, NSW",
      address: "1 Harbour St, Sydney NSW",
      website_url: "https://venue.example.test",
      contact_email: "events@venue.example.test",
      source_checked_at: "2026-09-14",
      status: "active",
      evidence: {
        price_basis: "not verified; request quote",
        availability_basis: "not verified; request date-specific availability",
      },
      caveat_labels: ["Admin maintained vendor row"],
    },
    {
      vendor_slug: "archived-vendor",
      vendor_name: "Archived Vendor",
      category: "Venue",
      service_area: "Sydney, NSW",
      website_url: "https://archived.example.test",
      status: "archived",
    },
  ]);
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    seeds: details,
  });

  assert.equal(details.length, 1);
  assert.equal(details[0]?.sourceUrl, "https://venue.example.test");
  assert.equal(details[0]?.sourceLabel, "Editable wedding vendor directory");
  assert.deepEqual((details[0]?.evidence as Record<string, unknown>).verified_fields, ["address", "email"]);
  assert.equal(state.vendorCount, 1);
  assert.match(state.markdown ?? "", /Harbour Venue/);
  assert.match(state.markdown ?? "", /Verified fields: address, email/);
  assert.ok(state.caveatLabels.includes("Admin maintained vendor row"));
});

test("buildWeddingVendorSeedState reports ready only with current price availability and fit evidence", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial transparent pricing",
    proofReferenceLabels: ["seeded-vendor-corpus:oracle-prod-1:2026-09-28"],
    seeds: [{
      vendorSlug: "verified-photo",
      vendorName: "Verified Photo Studio",
      category: "Photographer",
      serviceArea: "Sydney, NSW",
      websiteUrl: "https://photo.example",
      sourceUrl: "https://photo.example/source",
      sourceLabel: "Official verified photo source",
      sourceCheckedAt: "2026-09-14",
      evidence: {
        verified_fields: ["category", "service_area", "price", "availability"],
        service_notes: ["editorial photography", "transparent pricing guide"],
        price_basis: "official package guide verified on current source",
        availability_basis: "date-specific availability confirmed by vendor inquiry",
      },
    }],
  });

  assert.equal(state.status, "ready");
  assert.equal(state.freshnessStatus, "ready_for_shortlist_review");
  assert.deepEqual(state.proofReferenceLabels, ["seeded-vendor-corpus:oracle-prod-1:2026-09-28"]);
  assert.deepEqual(state.artifactInput?.metadata.vendorSeedProofReferenceLabels, [
    "seeded-vendor-corpus:oracle-prod-1:2026-09-28",
  ]);
  assert.equal(state.artifactInput?.metadata.vendorFreshnessReady, true);
  assert.match(state.summary, /source-backed seeded vendor row available/i);
});

test("buildWeddingVendorSeedState rejects placeholder corpus proof references", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial transparent pricing",
    proofReferenceLabels: ["seeded-vendor-corpus:fake:test"],
    seeds: [{
      vendorSlug: "verified-photo",
      vendorName: "Verified Photo Studio",
      category: "Photographer",
      serviceArea: "Sydney, NSW",
      websiteUrl: "https://photo.example",
      sourceUrl: "https://photo.example/source",
      sourceLabel: "Official verified photo source",
      sourceCheckedAt: "2026-09-14",
      evidence: {
        verified_fields: ["category", "service_area", "price", "availability"],
        service_notes: ["editorial photography", "transparent pricing guide"],
        price_basis: "official package guide verified on current source",
        availability_basis: "date-specific availability confirmed by vendor inquiry",
      },
    }],
  });

  assert.equal(state.status, "ready");
  assert.deepEqual(state.proofReferenceLabels, []);
});

test("buildWeddingVendorSeedState rejects bare test corpus proof references while accepting prod-smoke", () => {
  const baseInput = {
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial transparent pricing",
    seeds: [{
      vendorSlug: "verified-photo",
      vendorName: "Verified Photo Studio",
      category: "Photographer",
      serviceArea: "Sydney, NSW",
      websiteUrl: "https://photo.example",
      sourceUrl: "https://photo.example/source",
      sourceLabel: "Official verified photo source",
      sourceCheckedAt: "2026-09-14",
      evidence: {
        verified_fields: ["category", "service_area", "price", "availability"],
        service_notes: ["editorial photography", "transparent pricing guide"],
        price_basis: "official package guide verified on current source",
        availability_basis: "date-specific availability confirmed by vendor inquiry",
      },
    }],
  };

  const testProof = buildWeddingVendorSeedState({
    ...baseInput,
    proofReferenceLabels: ["seeded-vendor-corpus:test:latest"],
  });
  const prodSmokeProof = buildWeddingVendorSeedState({
    ...baseInput,
    proofReferenceLabels: ["seeded-vendor-corpus:prod-smoke:2026-09-28"],
  });

  assert.equal(testProof.status, "ready");
  assert.deepEqual(testProof.proofReferenceLabels, []);
  assert.equal(prodSmokeProof.status, "ready");
  assert.deepEqual(prodSmokeProof.proofReferenceLabels, ["seeded-vendor-corpus:prod-smoke:2026-09-28"]);
  assert.deepEqual(prodSmokeProof.artifactInput?.metadata.vendorSeedProofReferenceLabels, [
    "seeded-vendor-corpus:prod-smoke:2026-09-28",
  ]);
});

test("buildWeddingVendorSeedState flags stale seed sources without dropping the planning artifact", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    maxSourceAgeDays: 30,
    seeds: [{
      vendorSlug: "old-dj",
      vendorName: "Old DJ",
      category: "DJ",
      serviceArea: "Sydney, NSW",
      websiteUrl: "https://dj.example",
      sourceUrl: "https://dj.example",
      sourceLabel: "DJ source",
      sourceCheckedAt: "2026-01-01",
    }],
  });

  assert.equal(state.status, "stale");
  assert.equal(state.staleCount, 1);
  assert.match(state.summary, /need source recheck/i);
  assert.match(state.markdown ?? "", /Recheck source before use/i);
  assert.equal(state.artifactInput?.metadata.staleSeedCount, 1);
});

test("buildWeddingVendorSeedState preserves relevance blockers for personalized vendor research", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial transparent pricing",
    seeds: [{
      vendorSlug: "hunter-florist",
      vendorName: "Hunter Florals",
      category: "Floral Designer",
      serviceArea: "Hunter Valley, NSW",
      websiteUrl: "https://florist.example",
      sourceUrl: "https://florist.example",
      sourceLabel: "Florist source",
      sourceCheckedAt: "2026-09-14",
      evidence: {
        price_basis: "official package page lists AUD 2500 package",
        availability_basis: "official inquiry page confirms date-specific availability check completed",
        service_notes: ["romantic floral installations"],
      },
    }],
  });

  assert.equal(state.freshnessStatus, "needs_live_recheck");
  assert.equal(state.artifactInput?.metadata.vendorFreshnessReady, false);
  assert.equal(state.artifactInput?.metadata.vendorRelevanceBlockerCount, 1);
  assert.match(state.markdown ?? "", /Do not recommend this vendor for the selected category/i);
});

test("buildWeddingVendorSeedState does not create fake artifacts from empty or malformed seeds", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    seeds: [
      { vendorName: "Missing source", category: "Venue", serviceArea: "Sydney" },
      { sourceUrl: "https://example.com", category: "Venue", serviceArea: "Sydney" },
      {
        vendorSlug: "bad-source-url",
        vendorName: "Bad Source URL",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "javascript:alert(1)",
        sourceLabel: "Unsafe source",
      },
    ],
  });

  assert.equal(state.status, "empty");
  assert.equal(state.vendorCount, 0);
  assert.equal(state.evidenceCount, 0);
  assert.equal(state.artifactInput, null);
  assert.equal(state.summaryArtifact, null);
});

test("buildWeddingVendorSeedState does not create artifacts from local source URLs", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    seeds: [
      {
        vendorSlug: "local-source-url",
        vendorName: "Local Source Venue",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "http://localhost:8787/vendor/profile",
        sourceLabel: "Local source",
      },
      {
        vendorSlug: "loopback-source-url",
        vendorName: "Loopback Source Venue",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "https://127.0.0.1/vendor/profile",
        sourceLabel: "Loopback source",
      },
    ],
  });

  assert.equal(state.status, "empty");
  assert.equal(state.vendorCount, 0);
  assert.equal(state.sourceCount, 0);
  assert.equal(state.artifactInput, null);
  assert.equal(state.summaryArtifact, null);
});

test("buildWeddingVendorSeedState drops malformed source URLs from mixed seed packets", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    seeds: [
      {
        vendorSlug: "bad-source-url",
        vendorName: "Bad Source URL",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "javascript:alert(1)",
        sourceLabel: "Unsafe source",
      },
      {
        vendorSlug: "safe-source-url",
        vendorName: "Safe Source Venue",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "https://safe-venue.example/source",
        sourceLabel: "Safe venue source",
        sourceCheckedAt: "2026-09-14",
      },
    ],
  });

  assert.equal(state.vendorCount, 1);
  assert.equal(state.sourceCount, 1);
  assert.equal(state.summaryArtifact?.sourceLinks.length, 1);
  assert.equal(state.summaryArtifact?.sourceLinks[0]?.url, "https://safe-venue.example/source");
  assert.doesNotMatch(state.markdown ?? "", /javascript:alert/);
  assert.ok(state.summaryArtifact?.vendorLabels.includes("Safe Source Venue"));
  assert.ok(!state.summaryArtifact?.vendorLabels.includes("Bad Source URL"));
});

test("buildWeddingVendorSeedState drops local source URLs from mixed seed packets", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    seeds: [
      {
        vendorSlug: "local-source-url",
        vendorName: "Local Source Venue",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "http://localhost:8787/vendor/profile",
        sourceLabel: "Local source",
      },
      {
        vendorSlug: "safe-source-url",
        vendorName: "Safe Source Venue",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "https://safe-venue.example/source",
        sourceLabel: "Safe venue source",
        sourceCheckedAt: "2026-09-14",
      },
    ],
  });

  assert.equal(state.vendorCount, 1);
  assert.equal(state.sourceCount, 1);
  assert.equal(state.summaryArtifact?.sourceLinks.length, 1);
  assert.equal(state.summaryArtifact?.sourceLinks[0]?.url, "https://safe-venue.example/source");
  assert.doesNotMatch(state.markdown ?? "", /localhost/);
  assert.ok(state.summaryArtifact?.vendorLabels.includes("Safe Source Venue"));
  assert.ok(!state.summaryArtifact?.vendorLabels.includes("Local Source Venue"));
});

test("buildWeddingVendorSeedTaskItems turns seeded freshness blockers into review tasks", () => {
  const state = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    maxSourceAgeDays: 30,
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial transparent pricing",
    seeds: [{
      vendorSlug: "hunter-florist",
      vendorName: "Hunter Florals",
      category: "Floral Designer",
      serviceArea: "Hunter Valley, NSW",
      websiteUrl: "https://florist.example",
      sourceUrl: "https://florist.example",
      sourceLabel: "Florist source",
      sourceCheckedAt: "2026-01-01",
      evidence: {
        price_basis: "not verified; request package quote",
        availability_basis: "not verified; request date-specific availability",
      },
    }],
  });
  const tasks = buildWeddingVendorSeedTaskItems({
    metadata,
    artifacts: state.artifactInput ? [state.artifactInput] : [],
  });

  assert.ok(tasks.some((task) => /Refresh stale seeded vendor/i.test(task.title)));
  assert.ok(tasks.some((task) => /price and date-specific availability/i.test(task.title)));
  assert.ok(tasks.some((task) => /category, location, or preference-fit blockers/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).vendor_seed_review_task === true
    && (task.metadata as Record<string, unknown>).vendor_search_review_task === true
    && (task.metadata as Record<string, unknown>).vendor_price_freshness_required === true
    && task.linkedArtifactId === state.artifactInput?.id
  ));
});
