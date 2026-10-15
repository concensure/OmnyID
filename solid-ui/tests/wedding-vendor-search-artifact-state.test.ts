import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceState } from "@/lib/weddingResponseWorkspaceState";
import {
  buildWeddingVendorComparisonArtifactState,
  buildWeddingVendorSearchArtifactState,
  buildWeddingVendorSearchTaskItems,
} from "@/lib/weddingVendorSearchArtifactState";
import {
  runWeddingPlannedVendorSearchExecution,
  runWeddingVendorSearchExecution,
} from "@/lib/weddingVendorSearchExecutorState";
import { buildWeddingVendorSearchProviderPlanState } from "@/lib/weddingVendorSearchProviderPlanState";
import { buildWeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

const readiness = buildWeddingVendorSearchReadinessState({
  location: "Sydney",
  vendorCategories: ["photographer"],
  vendorPreferences: "documentary style and transparent pricing",
  photographyScope: "day-of coverage and portraits",
  liveSearchProviderReady: true,
});

test("buildWeddingVendorSearchArtifactState creates a source-linked vendor artifact from live search", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Wedding photographer with documentary packages.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const state = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(state.status, "created");
  assert.equal(state.sourceCount, 1);
  assert.equal(state.summary?.kind, "vendor_table");
  assert.equal(state.summary?.sourceLinks[0]?.url, "https://harbour-studio.example");
  assert.ok(state.summary?.searchText.includes("source_linked"));
  assert.match(state.markdown ?? "", /not a booking, quote, availability confirmation/i);
  assert.doesNotMatch(state.markdown ?? "", /Brave Search/i);
  assert.doesNotMatch(state.markdown ?? "", /Confirm service area, availability, packages/i);
  assert.deepEqual(state.artifactInput?.metadata.sourceProviderLabels, ["Brave Search"]);
  assert.deepEqual(state.artifactInput?.metadata.sourceCountsByProvider, { "Brave Search": 1 });
});

test("vendor search source packet feeds existing wedding response workspace", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [{ title: "Studio A", url: "https://studio-a.example", provider: "Brave Search" }],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: artifact.artifactInput ? [artifact.artifactInput] : [],
    query: "studio",
  });

  assert.equal(workspace.totalArtifacts, 1);
  assert.equal(workspace.results[0]?.kind, "vendor_table");
  assert.equal(workspace.results[0]?.sourceLinks.length, 1);
});

test("cached admin vendor database results still create source-backed artifacts", () => {
  const execution = {
    status: "cached" as const,
    externalSearchPerformed: false,
    providerLabel: "Admin vendor database",
    queryCount: 2,
    sourceCount: 2,
    queries: [
      "florist in Sydney specialising in wedding",
      "wedding florist Sydney reviews packages",
    ],
    sources: [
      {
        title: "Chloe's Florals",
        url: "https://chloes-florals.example",
        website_url: "https://chloes-florals.example",
        map_url: "https://maps.google.com/?cid=chloe",
        snippet: "florist - Sydney - saved in OmnyID's shared wedding vendor database.",
        provider: "Admin vendor database",
      },
      {
        title: "Harbour Blooms",
        url: "https://harbour-blooms.example",
        snippet: "florist - Sydney - package language and reliable reviews.",
        provider: "Admin vendor database",
      },
    ],
    message: "Admin vendor database returned 2 reusable sources; paid live search was skipped to save admin API credits.",
    receiptMetadata: {
      vendor_search_mode: "live",
      vendor_search_status: "cached",
      external_search_performed: false,
      admin_vendor_database_used: true,
      paid_provider_queries_skipped_due_to_admin_cache: 2,
      provider_kinds: ["google_places", "brave_search"],
      vendor_categories: ["florist"],
      source_provider_labels: ["Admin vendor database"],
      source_counts_by_provider: { "Admin vendor database": 2 },
    },
  };

  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "romantic flowers with reliable reviews",
    location: "Sydney",
    vendorCategories: ["florist"],
  });

  assert.equal(artifact.status, "created");
  assert.equal(comparison.status, "created");
  assert.doesNotMatch(artifact.markdown ?? "", /Admin vendor database/i);
  assert.deepEqual(artifact.artifactInput?.metadata.sourceProviderLabels, ["Admin vendor database"]);
  assert.equal((comparison.artifactInput?.metadata as Record<string, unknown>).sourceUrlCount, 3);
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).sourceProviderLabels, ["Admin vendor database"]);
});

test("planned vendor search source packet preserves provider-specific search context", async () => {
  const providerPlan = buildWeddingVendorSearchProviderPlanState({
    readiness,
    providerKinds: ["google_places", "overpass"],
    maxCategories: 1,
  });
  const execution = await runWeddingPlannedVendorSearchExecution({
    providerPlans: providerPlan.providerPlans,
    mode: "live",
    providerLabel: "Admin wedding search stack",
    maxQueries: 2,
    port: (query) => ({
      ok: true,
      query: query.query,
      sources: [{
        title: `${query.category} source`,
        url: `https://example.com/${query.providerKind}/${query.category}`,
        snippet: query.expectedFields.join(", "),
        provider: query.providerKind,
      }],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: artifact.artifactInput ? [artifact.artifactInput] : [],
    query: "place id craft=photographer",
  });

  assert.equal(artifact.status, "created");
  assert.doesNotMatch(artifact.markdown ?? "", /Provider kinds: google_places, overpass/i);
  assert.doesNotMatch(artifact.markdown ?? "", /Source providers returned: google_places, overpass/i);
  assert.doesNotMatch(artifact.markdown ?? "", /Source counts by provider: google_places: 1, overpass: 1/i);
  assert.match(artifact.markdown ?? "", /Google place types: point_of_interest/i);
  assert.match(artifact.markdown ?? "", /Overpass tags: craft=photographer/i);
  assert.match(artifact.markdown ?? "", /Expected fields: name, website, phone/i);
  assert.ok(artifact.summary?.sourceLabels.includes("google_places"));
  assert.deepEqual(artifact.artifactInput?.metadata.sourceProviderLabels, ["google_places", "overpass"]);
  assert.ok(artifact.summary?.sourceLabels.includes("craft=photographer"));
  assert.equal(workspace.totalArtifacts, 1);
  assert.ok(workspace.results[0]?.searchText.includes("place id"));
});

test("buildWeddingVendorComparisonArtifactState ranks top three vendor choices with A2UI comparison", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Sydney documentary wedding photographer with transparent packages, portfolio, and date availability.",
          provider: "Brave Search",
        },
        {
          title: "Budget Lens",
          url: "https://budget-lens.example",
          snippet: "Wedding photography rates and simple packages for Sydney couples.",
          provider: "Brave Search",
        },
        {
          title: "Portrait Hall",
          url: "https://portrait-hall.example",
          snippet: "Editorial portraits and gallery reviews.",
          provider: "Brave Search",
        },
        {
          title: "Generic Events",
          url: "https://generic-events.example",
          snippet: "Event services.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    budgetComfort: "balanced budget",
    vendorCategories: ["photographer"],
  });
  const a2ui = comparison.artifactInput?.metadata && typeof comparison.artifactInput.metadata === "object"
    ? (comparison.artifactInput.metadata as Record<string, unknown>).a2ui as Record<string, unknown>
    : null;

  assert.equal(comparison.status, "created");
  assert.equal(comparison.topChoiceCount, 3, "cards show at most three vendors still to verify");
  assert.equal(comparison.summary?.title, "Top vendor comparison");
  assert.equal(comparison.summary?.vendorLabels[0], "Harbour Studio");
  assert.match(comparison.markdown ?? "", /## Bookable candidates/);
  assert.match(comparison.markdown ?? "", /## High-potential — availability needs confirmation/);
  assert.match(comparison.markdown ?? "", /## Excluded/);
  assert.match(comparison.markdown ?? "", /## Suggested next actions/);
  assert.match(comparison.markdown ?? "", /Unknown facts are never treated as negatives/);
  assert.match(comparison.markdown ?? "", /documentary/i);
  assert.doesNotMatch(comparison.markdown ?? "", /Source provider:/i);
  assert.equal(a2ui?.schema_version, "a2ui.v1");
  assert.equal(Array.isArray(a2ui?.components), true);
  const recommendationCards = (a2ui?.components as Array<Record<string, unknown>>)[0] as Record<string, unknown> | undefined;
  const recommendationCardProps = recommendationCards?.props as Record<string, unknown> | undefined;
  assert.equal(recommendationCards?.type, "vendor_recommendation_cards");
  assert.equal((recommendationCardProps?.cards as Array<Record<string, unknown>>).length, 3);
  const comparisonTable = (a2ui?.components as Array<Record<string, unknown>>)[1] as Record<string, unknown> | undefined;
  const comparisonProps = comparisonTable?.props as Record<string, unknown> | undefined;
  assert.equal(comparisonTable?.type, "comparison_table");
  assert.equal((comparisonProps?.selection as Record<string, unknown> | undefined)?.mode, "multi");
  assert.equal(((comparisonProps?.selection as Record<string, unknown> | undefined)?.confirm_action as Record<string, unknown> | undefined)?.kind, "confirm_vendor_choices");
  // Selection and outreach live inside the interactive vendor cards, so this
  // portable A2UI data has no unhandled action/footer affordances.
  assert.equal(comparisonProps?.column_actions, undefined);
  assert.equal(comparisonProps?.footer_actions, undefined);
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).topChoiceLabels, [
    "Harbour Studio",
    "Budget Lens",
    "Generic Events",
  ]);
  const comparisonMetadata = comparison.artifactInput?.metadata as Record<string, unknown>;
  const recommendationHandoff = comparisonMetadata.vendorComparisonHandoff as Record<string, unknown>;
  assert.equal(recommendationHandoff.recommendationLabel, "Compare the 4 options below.");
  assert.deepEqual(recommendationHandoff.whyLabels as string[], [
    "4 source-backed vendors found: 0 booked, 0 bookable, 4 awaiting availability confirmation",
    "1 choice matched stated preferences",
    "Intake signals used: Preferences: documentary style and transparent...; Budget comfort: balanced budget",
    "Location context: Sydney",
  ]);
  assert.equal(recommendationHandoff.confidenceLabel, "Confidence: low");
  assert.match(String(recommendationHandoff.nextActionLabel), /Check availability with Harbour Studio/i);
  assert.deepEqual(
    (comparisonMetadata.vendorComparisonNextActions as Array<Record<string, unknown>>)[0]?.kind,
    "check_availability",
  );
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).confirmAction), "confirm_vendor_choices");
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).approvalRequiredBeforeOutreach), true);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).selectedVendorsContinueToFollowUp), true);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).unselectedVendorsLeaveActiveQueues), true);
  assert.equal(((comparisonMetadata.vendorComparisonSelection as Record<string, unknown>).closedVendorHistoryRetained), true);
  assert.equal((comparisonMetadata.topChoiceActionRows as Array<Record<string, unknown>>).length, 3);
  const firstCard = (comparisonMetadata.topChoiceCards as Array<Record<string, unknown>>)[0] ?? {};
  assert.equal(firstCard.group, "verify");
  assert.equal(firstCard.availability_state, "unknown");
  assert.match(String(firstCard.score_label), /^\d+ fit · (low|medium|high) confidence$/);
  const semanticObject = comparisonMetadata.semantic_object as Record<string, unknown>;
  const semanticActions = semanticObject.actions as Array<Record<string, unknown>>;
  assert.deepEqual(semanticActions.map((action) => action.kind), [
    "confirm_vendor_choices",
    "prepare_follow_up_for_selected_vendors",
    "open_vendor_sources",
  ]);
  assert.equal(semanticActions.find((action) => action.kind === "prepare_follow_up_for_selected_vendors")?.targetMenu, "response_queue");
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).sourceProviderLabels, ["Brave Search"]);
  assert.deepEqual((comparison.artifactInput?.metadata as Record<string, unknown>).sourceCountsByProvider, { "Brave Search": 4 });
  assert.equal((comparison.artifactInput?.metadata as Record<string, unknown>).sourceUrlCount, 3);
  assert.equal((comparison.artifactInput?.metadata as Record<string, unknown>).parentSourceUrlCount, 4);
});

test("buildWeddingVendorComparisonArtifactState ranks beachfront gothic venue fit and emits image cards", async () => {
  const venueReadiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["venue"],
    vendorPreferences: "60 people wedding at a beachfront location in Gothic style",
    liveSearchProviderReady: true,
  });
  const execution = await runWeddingVendorSearchExecution({
    readiness: venueReadiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Generic Sydney Venue Directory",
          url: "https://directory.example/sydney-venues",
          snippet: "List of event suppliers and function spaces.",
          provider: "Brave Search",
        },
        {
          title: "St Josephs Guesthouse",
          url: "https://st-josephs.example",
          website_url: "https://st-josephs.example",
          map_url: "https://maps.google.com/?cid=stjosephs",
          photo_url: "https://cdn.example/st-josephs.jpg",
          snippet: "Beautifully restored Gothic sandstone church wedding venue near Sydney for intimate weddings.",
          provider: "Admin vendor database",
        },
        {
          title: "Palm Beach Estate",
          url: "https://palm-beach-estate.example",
          photo_url: "https://images.unsplash.com/photo-1507504031003-b417219a0fde",
          snippet: "Private beachfront wedding venue in Sydney with harbour views and capacity for 60 guests.",
          provider: "Brave Search",
        },
        {
          title: "Paperlust venue guide",
          url: "https://paperlust.example/sydney-venues",
          snippet: "Heritage venue with Gothic Revival sandstone castle atmosphere. Capacity: 60 to 400 plus.",
          provider: "Brave Search",
        },
      ],
    }),
  });

  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "60 people wedding at a beachfront location in Gothic style",
    location: "Sydney",
    guestCount: "60",
    atmosphereDescription: "Gothic, dramatic, historic, by the water",
    vendorCategories: ["venue"],
  });

  const comparisonMetadata = comparison.artifactInput?.metadata as Record<string, unknown>;
  const cards = comparisonMetadata.topChoiceCards as Array<Record<string, unknown>>;
  const a2ui = comparisonMetadata.a2ui as Record<string, unknown>;
  const cardComponent = (a2ui.components as Array<Record<string, unknown>>)[0] as Record<string, unknown>;

  assert.equal(comparison.status, "created");
  assert.deepEqual(new Set(comparison.summary?.vendorLabels.slice(0, 3)), new Set([
    "Palm Beach Estate",
    "St Josephs Guesthouse",
    "Paperlust venue guide",
  ]));
  const palmCard = cards.find((card) => card.title === "Palm Beach Estate");
  const gothicCard = cards.find((card) => card.title === "St Josephs Guesthouse");
  assert.equal(palmCard?.image_url, "https://images.unsplash.com/photo-1507504031003-b417219a0fde");
  assert.equal(gothicCard?.image_url, null);
  assert.match(String(palmCard?.preference_match), /beachfront/i);
  assert.match(String(gothicCard?.preference_match), /gothic/i);
  assert.equal(gothicCard?.situation_fit, "");
  assert.deepEqual(gothicCard?.unknown_constraints, ["capacity"]);
  assert.equal(gothicCard?.group, "verify");
  assert.equal(cardComponent.type, "vendor_recommendation_cards");
  assert.ok(((cardComponent.props as Record<string, unknown>).cards as Array<Record<string, unknown>>).some((card) => card.title === "Palm Beach Estate"));
  assert.ok((comparisonMetadata.vendorComparisonRankingSignals as string[]).includes("personal_utility"));
});

test("vendor search artifacts preserve website and map actions from live source packets", async () => {
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
          title: "Chloe's Florals",
          url: "https://chloes-florals.example",
          website_url: "https://chloes-florals.example",
          map_url: "https://maps.google.com/?cid=chloe",
          snippet: "Sydney florist rating 4.9 across 63 reviews with floral packages.",
          provider: "Google Places API",
        },
      ],
    }),
  });

  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "romantic flowers with reliable reviews",
    location: "Sydney",
    vendorCategories: ["florist"],
  });

  assert.equal(artifact.status, "created");
  assert.deepEqual(artifact.summary?.sourceLinks.map((source) => source.url), [
    "https://chloes-florals.example",
    "https://maps.google.com/?cid=chloe",
  ]);
  assert.equal(artifact.artifactInput?.metadata.sourceWebsiteUrlCount, 1);
  assert.equal(artifact.artifactInput?.metadata.sourceMapUrlCount, 1);
  assert.equal(comparison.status, "created");
  assert.deepEqual(comparison.summary?.sourceLinks.map((source) => source.url), [
    "https://chloes-florals.example",
    "https://maps.google.com/?cid=chloe",
  ]);
  const actions = ((comparison.artifactInput?.metadata as Record<string, unknown>).topChoiceActionRows as Array<Record<string, unknown>>)[0]?.actions as Array<Record<string, unknown>>;
  assert.deepEqual(actions.map((action) => action.kind), [
    "select_vendor_for_follow_up",
    "open_vendor_website",
    "open_vendor_map",
    "prepare_approval_gated_outreach",
  ]);
  assert.equal(actions.find((action) => action.kind === "open_vendor_website")?.href, "https://chloes-florals.example");
  assert.equal(actions.find((action) => action.kind === "open_vendor_map")?.href, "https://maps.google.com/?cid=chloe");
});

test("buildWeddingVendorComparisonArtifactState uses structured intake atmosphere and inspiration signals", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Formal Ballroom Collective",
          url: "https://formal-ballroom.example",
          snippet: "Classic wedding photography packages and polished ballroom portraits.",
          provider: "Brave Search",
        },
        {
          title: "Garden Candle Studio",
          url: "https://garden-candle.example",
          snippet: "Relaxed candlelit garden wedding photographer with warm documentary galleries.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "transparent pricing",
    atmosphereDescription: "Relaxed candlelit garden dinner",
    inspirationImageUrls: ["https://example.com/garden-table.jpg"],
    topPriorities: ["family", "budget"],
    location: "Sydney",
    budgetComfort: "Keep total spend low",
    vendorCategories: ["photographer"],
  });
  const comparisonMetadata = comparison.artifactInput?.metadata as Record<string, unknown>;

  assert.equal(comparison.status, "created");
  assert.equal(comparison.summary?.vendorLabels[0], "Garden Candle Studio");
  assert.match(comparison.markdown ?? "", /Desired atmosphere: Relaxed candlelit garden dinner/i);
  assert.match(comparison.markdown ?? "", /Top priorities: family, budget/i);
  assert.match(comparison.markdown ?? "", /Inspiration links: https:\/\/example\.com\/garden-table\.jpg/i);
  assert.deepEqual(comparisonMetadata.vendorComparisonPreferenceSignals, [
    "Preferences: transparent pricing",
    "Atmosphere: Relaxed candlelit garden dinner",
    "Budget comfort: Keep total spend low",
    "Priority: family",
    "Priority: budget",
    "Inspiration link: https://example.com/garden-table.jpg",
  ]);
  const recommendationHandoff = comparisonMetadata.vendorComparisonHandoff as Record<string, unknown>;
  assert.ok((recommendationHandoff.whyLabels as string[]).some((label) =>
    /Intake signals used: Preferences: transparent pricing; Atmosphere: Relaxed candlelit garden dinner/i.test(label)
  ));
  assert.deepEqual(comparisonMetadata.vendorComparisonRankingSignals, [
    "eligibility_hard_constraints",
    "availability_state",
    "personal_utility",
    "evidence_confidence",
    "next_action_value",
  ]);
});

test("buildWeddingVendorSearchArtifactState does not create artifacts from dry-run or failed search", async () => {
  const dryRun = await runWeddingVendorSearchExecution({
    readiness,
    mode: "dry_run",
    providerLabel: "Brave Search",
  });
  const failed = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
  });

  const dryRunArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution: dryRun });
  const failedArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution: failed });

  assert.equal(dryRunArtifact.status, "not_created");
  assert.equal(failedArtifact.status, "not_created");
  assert.match(dryRunArtifact.reason ?? "", /No source-backed vendor results were returned yet/i);
  assert.equal(dryRunArtifact.artifactInput, null);
  assert.equal(failedArtifact.artifactInput, null);
});

test("buildWeddingVendorSearchArtifactState blocks live searches with no usable sources", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({ ok: true, query, sources: [{ title: "No URL", url: "" }] }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(execution.status, "executed");
  assert.equal(execution.sourceCount, 0);
  assert.equal(artifact.status, "not_created");
  assert.match(artifact.reason ?? "", /no usable vendor source URLs/i);
});

test("buildWeddingVendorSearchArtifactState blocks malformed source URLs before artifact creation", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Bad URL", url: "javascript:alert(1)", provider: "Brave Search" },
        { title: "Relative URL", url: "/vendor/profile", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(execution.status, "executed");
  assert.equal(execution.sourceCount, 2);
  assert.equal(artifact.status, "not_created");
  assert.equal(artifact.sourceCount, 0);
  assert.match(artifact.reason ?? "", /no usable vendor source URLs/i);
  assert.equal(artifact.artifactInput, null);
});

test("buildWeddingVendorSearchArtifactState blocks local source URLs before artifact creation", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Localhost URL", url: "http://localhost:8787/vendor/profile", provider: "Brave Search" },
        { title: "Loopback URL", url: "https://127.0.0.1/vendor/profile", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(execution.status, "executed");
  assert.equal(execution.sourceCount, 2);
  assert.equal(artifact.status, "not_created");
  assert.equal(artifact.sourceCount, 0);
  assert.match(artifact.reason ?? "", /no usable vendor source URLs/i);
  assert.equal(artifact.artifactInput, null);
});

test("buildWeddingVendorSearchArtifactState drops malformed URLs from mixed source packets", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", provider: "Brave Search" },
        { title: "Bad URL", url: "javascript:alert(1)", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(artifact.status, "created");
  assert.equal(artifact.sourceCount, 1);
  assert.equal(artifact.summary?.sourceLinks.length, 1);
  assert.equal(artifact.summary?.sourceLinks[0]?.url, "https://harbour-studio.example");
  assert.equal(artifact.artifactInput?.metadata.sourceUrlCount, 1);
  assert.equal(artifact.artifactInput?.metadata.unusableSourceUrlCount, 1);
  assert.doesNotMatch(artifact.markdown ?? "", /javascript:alert/);
});

test("buildWeddingVendorSearchArtifactState drops local URLs from mixed source packets", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", provider: "Brave Search" },
        { title: "Local URL", url: "http://localhost:8787/vendor/profile", provider: "Brave Search" },
      ],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });

  assert.equal(artifact.status, "created");
  assert.equal(artifact.sourceCount, 1);
  assert.equal(artifact.summary?.sourceLinks.length, 1);
  assert.equal(artifact.summary?.sourceLinks[0]?.url, "https://harbour-studio.example");
  assert.equal(artifact.artifactInput?.metadata.sourceUrlCount, 1);
  assert.equal(artifact.artifactInput?.metadata.unusableSourceUrlCount, 1);
  assert.doesNotMatch(artifact.markdown ?? "", /localhost/);
});

test("buildWeddingVendorSearchTaskItems recovers review tasks from source packet artifacts", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [{ title: "Studio A", url: "https://studio-a.example", provider: "Brave Search" }],
    }),
  });
  const artifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const tasks = buildWeddingVendorSearchTaskItems({
    metadata,
    artifacts: artifact.artifactInput ? [artifact.artifactInput] : [],
  });

  assert.equal(tasks.length, 4);
  assert.ok(tasks.some((task) => /source freshness/i.test(task.title)));
  assert.ok(tasks.some((task) => /Tick preferred vendor/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).vendor_search_review_task === true
    && (task.metadata as Record<string, unknown>).vendor_price_freshness_required === true
    && task.linkedArtifactId === artifact.artifactInput?.id
  ));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).approval_required_before_outreach === true
    && (task.metadata as Record<string, unknown>).no_external_send_without_approval === true
  ));
});

test("buildWeddingVendorSearchTaskItems projects top-three comparison as a decision task", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", snippet: "Documentary Sydney photographer packages.", provider: "Brave Search" },
        { title: "Budget Lens", url: "https://budget-lens.example", snippet: "Transparent pricing for weddings.", provider: "Brave Search" },
        { title: "Portrait Hall", url: "https://portrait-hall.example", snippet: "Portfolio and reviews.", provider: "Brave Search" },
      ],
    }),
  });
  const sourceArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    vendorCategories: ["photographer"],
  });
  const tasks = buildWeddingVendorSearchTaskItems({
    metadata,
    artifacts: [
      sourceArtifact.artifactInput!,
      comparison.artifactInput!,
    ],
  });
  const comparisonTask = tasks.find((task) =>
    (task.metadata as Record<string, unknown>).vendor_comparison_decision_task === true
  );

  assert.equal(tasks.length, 1);
  assert.ok(comparisonTask);
  assert.equal(comparisonTask?.kind, "decision");
  assert.match(comparisonTask?.title ?? "", /top-three comparison/i);
  assert.deepEqual((comparisonTask?.metadata as Record<string, unknown>).vendor_comparison_top_choice_labels, [
    "Budget Lens",
    "Harbour Studio",
    "Portrait Hall",
  ]);
  assert.equal((comparisonTask?.metadata as Record<string, unknown>).a2ui_primary_action, "open_vendor_comparison");
});

test("buildWeddingVendorSearchTaskItems hides comparison queue work after vendors are selected", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "Harbour Studio", url: "https://harbour-studio.example", snippet: "Documentary Sydney photographer packages.", provider: "Brave Search" },
        { title: "Budget Lens", url: "https://budget-lens.example", snippet: "Transparent pricing for weddings.", provider: "Brave Search" },
        { title: "Portrait Hall", url: "https://portrait-hall.example", snippet: "Portfolio and reviews.", provider: "Brave Search" },
      ],
    }),
  });
  const sourceArtifact = buildWeddingVendorSearchArtifactState({ metadata, execution });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    vendorCategories: ["photographer"],
  });
  assert.ok(comparison.artifactInput);

  const tasks = buildWeddingVendorSearchTaskItems({
    metadata,
    artifacts: [
      sourceArtifact.artifactInput!,
      comparison.artifactInput,
    ],
    selectedDecisionItems: [{
      id: "decision:harbour",
      metadata,
      artifactId: comparison.artifactInput.id,
      artifactTitle: comparison.artifactInput.title,
      artifactKind: "vendor_table",
      sourceLabels: [],
      sourceUrls: [],
      sourceProviderLabels: [],
      sourceCountsByProvider: null,
      selectedOption: {
        id: "0:harbour-studio",
        rowIndex: 0,
        label: "Harbour Studio",
        detail: "Documentary Sydney photographer packages.",
        cells: ["Harbour Studio"],
        selected: true,
        preferenceFitLabels: [],
        missingPreferenceLabels: [],
        tradeoffLabels: [],
        preferenceSummaryLabel: "Selected by user",
      },
      source: "local_selection",
    }],
  });

  assert.deepEqual(tasks, []);
});

test("strict MVP comparison shows honest partial cards without padding to three", async () => {
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Directory",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        { title: "One", url: "https://one.example", provider: "Directory" },
        { title: "Two", url: "https://two.example", photo_url: "https://images.unsplash.com/photo-1507504031003-b417219a0fde", provider: "Directory" },
        { title: "Three", url: "https://three.example", provider: "Directory" },
      ],
    }),
  });
  const complete = buildWeddingVendorComparisonArtifactState({
    metadata, execution, location: "Sydney", vendorCategories: ["photographer"],
    targetCategory: "photographer", requireExactlyThree: true,
  });
  const cards = (complete.artifactInput?.metadata as Record<string, unknown>).topChoiceCards as Array<Record<string, unknown>>;

  assert.equal(complete.status, "created");
  assert.equal(complete.topChoiceCount, 3);
  assert.equal(new Set(cards.map((card) => card.title)).size, 3);
  assert.ok(cards.some((card) => card.media_kind === "verified_photo"));
  assert.ok(cards.some((card) => card.media_kind === "placeholder"));
  assert.ok(cards.filter((card) => card.media_kind === "placeholder").every((card) => /placeholder/i.test(String(card.media_label))));

  const shortfall = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution: { ...execution, sources: execution.sources.slice(0, 2), sourceCount: 2 },
    location: "Sydney", vendorCategories: ["photographer"], targetCategory: "photographer", requireExactlyThree: true,
  });
  assert.equal(shortfall.status, "created");
  assert.equal(shortfall.topChoiceCount, 2);
  const shortfallMetadata = shortfall.artifactInput?.metadata as Record<string, unknown>;
  assert.equal(shortfallMetadata.shortlistStatus, "needs_online_shortfall");
  assert.equal(shortfallMetadata.shortlistShortfall, 1);
  assert.match(String(shortfallMetadata.shortlistReason), /search for 1 more/i);
  assert.equal((shortfallMetadata.topChoiceCards as unknown[]).length, 2);

  const singleChoice = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution: { ...execution, sources: execution.sources.slice(0, 1), sourceCount: 1 },
    location: "Sydney", vendorCategories: ["photographer"], targetCategory: "photographer", requireExactlyThree: true,
  });
  assert.equal(singleChoice.status, "created");
  assert.equal(singleChoice.topChoiceCount, 1);
  assert.equal(((singleChoice.artifactInput?.metadata as Record<string, unknown>).topChoiceCards as unknown[]).length, 1);
});
